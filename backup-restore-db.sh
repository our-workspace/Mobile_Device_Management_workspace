#!/bin/bash
# backup-restore-db.sh
# PostgreSQL Backup & Restore Script for MDM Database

set -e

# Database configuration
DB_NAME="mdm_db"
DB_USER="postgres"
DB_PASS="postgres123"
DB_HOST="localhost"
DB_PORT="5432"

# Backup directory
BACKUP_DIR="$HOME/Mobile_Device_Management_workspace/db_backups"
TMP_DIR="$HOME/tmp"
mkdir -p "$BACKUP_DIR"
mkdir -p "$TMP_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Function to show usage
show_usage() {
    echo "Usage:"
    echo "  $0 backup              - Create backup"
    echo "  $0 restore [file]      - Restore from backup file"
    echo "  $0 list                - List available backups"
    echo ""
    echo "Examples:"
    echo "  $0 backup"
    echo "  $0 restore mdm_db_2025-01-15_143022.sql"
    echo "  $0 restore latest      - Restore most recent backup"
}

# Create backup
backup_database() {
    local timestamp=$(date +%Y-%m-%d_%H%M%S)
    local backup_file="${BACKUP_DIR}/mdm_db_${timestamp}.sql"
    
    echo -e "${YELLOW}Creating backup...${NC}"
    echo "Database: $DB_NAME"
    echo "Backup file: $backup_file"
    
    # Create backup using pg_dump
    export PGPASSWORD="$DB_PASS"
    
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        --clean --if-exists --create \
        > "$backup_file"; then
        
        # Compress the backup
        gzip -f "$backup_file"
        local compressed_file="${backup_file}.gz"
        
        echo -e "${GREEN}✓ Backup created successfully!${NC}"
        echo "File: $compressed_file"
        echo "Size: $(du -h "$compressed_file" | cut -f1)"
        
        # Create symlink to latest
        ln -sf "$compressed_file" "${BACKUP_DIR}/latest.sql.gz"
        
    else
        echo -e "${RED}✗ Backup failed!${NC}"
        rm -f "$backup_file"
        exit 1
    fi
}

# Restore database
restore_database() {
    local backup_file="$1"
    
    # If 'latest' is specified, use the latest backup
    if [ "$backup_file" = "latest" ]; then
        backup_file="${BACKUP_DIR}/latest.sql.gz"
        if [ ! -f "$backup_file" ]; then
            echo -e "${RED}✗ No latest backup found!${NC}"
            exit 1
        fi
    elif [ ! -f "$backup_file" ]; then
        # Try to find in backup directory
        backup_file="${BACKUP_DIR}/${backup_file}"
        if [ ! -f "$backup_file" ]; then
            # Try with .gz extension
            backup_file="${backup_file}.gz"
            if [ ! -f "$backup_file" ]; then
                echo -e "${RED}✗ Backup file not found: $1${NC}"
                exit 1
            fi
        fi
    fi
    
    echo -e "${YELLOW}Restoring database from:${NC} $backup_file"
    echo -e "${RED}WARNING: This will overwrite the current database!${NC}"
    read -p "Are you sure? Type 'yes' to continue: " confirm
    
    if [ "$confirm" != "yes" ]; then
        echo "Restore cancelled."
        exit 0
    fi
    
    export PGPASSWORD="$DB_PASS"
    
    # If compressed, decompress to temp file
    local temp_file=""
    if [[ "$backup_file" == *.gz ]]; then
        temp_file="$TMP_DIR/restore_$(date +%s).sql"
        echo "Decompressing backup to: $temp_file"
        gunzip -c "$backup_file" > "$temp_file"
        if [ ! -f "$temp_file" ]; then
            echo -e "${RED}✗ Failed to decompress backup file${NC}"
            exit 1
        fi
        backup_file="$temp_file"
    fi
    
    echo "Dropping and recreating database..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null || true
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -c "CREATE DATABASE $DB_NAME;"
    
    echo "Restoring data..."
    if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" < "$backup_file"; then
        echo -e "${GREEN}✓ Database restored successfully!${NC}"
    else
        echo -e "${RED}✗ Restore failed!${NC}"
    fi
    
    # Cleanup temp file
    if [ -n "$temp_file" ] && [ -f "$temp_file" ]; then
        rm -f "$temp_file"
    fi
}

# List backups
list_backups() {
    echo -e "${YELLOW}Available backups in $BACKUP_DIR:${NC}"
    echo ""
    
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]; then
        echo "No backups found."
        exit 0
    fi
    
    printf "%-30s %-10s %s\n" "FILENAME" "SIZE" "DATE"
    printf "%s\n" "-----------------------------------------------------------"
    
    for file in $(ls -t "$BACKUP_DIR"/*.sql* 2>/dev/null); do
        if [ -f "$file" ]; then
            local filename=$(basename "$file")
            local size=$(du -h "$file" | cut -f1)
            local date=$(stat -c %y "$file" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1)
            printf "%-30s %-10s %s\n" "$filename" "$size" "$date"
        fi
    done
}

# Main
main() {
    case "$1" in
        backup)
            backup_database
            ;;
        restore)
            if [ -z "$2" ]; then
                echo "Error: Please specify backup file or 'latest'"
                echo "Usage: $0 restore <backup_file|latest>"
                exit 1
            fi
            restore_database "$2"
            ;;
        list)
            list_backups
            ;;
        *)
            show_usage
            exit 1
            ;;
    esac
}

main "$@"
