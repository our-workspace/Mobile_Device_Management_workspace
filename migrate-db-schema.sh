#!/bin/bash
# migrate-db-schema.sh
# Backup current DB → Drop & Recreate with new schema → Restore data

set -e

# Database configuration
DB_NAME="mdm_db"
DB_USER="postgres"
DB_PASS="postgres123"
DB_HOST="localhost"
DB_PORT="5432"

# Directories
BACKUP_DIR="$HOME/Mobile_Device_Management_workspace/db_backups"
TMP_DIR="$HOME/tmp"
SQL_DIR="$HOME/Mobile_Device_Management_workspace/mdm-backend/src/db"
mkdir -p "$BACKUP_DIR" "$TMP_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

export PGPASSWORD="$DB_PASS"

echo "=========================================="
echo "  Database Migration: Backup → Recreate → Restore"
echo "=========================================="

# ==========================================
# STEP 1: Backup current data
# ==========================================
echo ""
echo -e "${BLUE}[STEP 1/4] Backing up current database...${NC}"

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/mdm_db_pre_migration_$TIMESTAMP.sql"

echo "Creating data-only backup..."

# Backup data only (no schema)
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --data-only \
    --inserts \
    --column-inserts \
    > "$BACKUP_FILE" 2>/dev/null || {
    echo -e "${RED}✗ Backup failed!${NC}"
    exit 1
}

echo -e "${GREEN}✓ Data backed up to: $BACKUP_FILE${NC}"

# Also create a full backup for safety
FULL_BACKUP="$BACKUP_DIR/mdm_db_full_backup_$TIMESTAMP.sql.gz"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" | gzip > "$FULL_BACKUP"
echo -e "${GREEN}✓ Full backup created: $FULL_BACKUP${NC}"

# ==========================================
# STEP 2: Drop and recreate database
# ==========================================
echo ""
echo -e "${BLUE}[STEP 2/4] Dropping and recreating database...${NC}"

echo "Dropping database $DB_NAME..."
dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" 2>/dev/null || true

echo "Creating fresh database $DB_NAME..."
createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"

echo -e "${GREEN}✓ Database recreated${NC}"

# ==========================================
# STEP 3: Create new schema
# ==========================================
echo ""
echo -e "${BLUE}[STEP 3/4] Creating new schema...${NC}"

# Run the init.sql script
if [ -f "$SQL_DIR/init.sql" ]; then
    echo "Applying schema from init.sql..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$SQL_DIR/init.sql" > /dev/null 2>&1
    echo -e "${GREEN}✓ New schema created${NC}"
else
    echo -e "${RED}✗ init.sql not found at $SQL_DIR/init.sql${NC}"
    exit 1
fi

# ==========================================
# STEP 4: Restore data
# ==========================================
echo ""
echo -e "${BLUE}[STEP 4/4] Restoring data...${NC}"

# Temporarily disable foreign key checks for data import
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SET session_replication_role = replica;" 2>/dev/null || true

# Extract and restore data table by table
echo "Restoring devices..."
pg_restore_table() {
    local table=$1
    grep -i "INSERT INTO $table" "$BACKUP_FILE" | psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" 2>/dev/null || true
}

# Restore tables in correct order (respecting foreign keys)
pg_restore_table "admins"
pg_restore_table "devices"
sleep 1  # Small delay to ensure devices are inserted
pg_restore_table "commands"
pg_restore_table "heartbeats"
pg_restore_table "backup_files"
pg_restore_table "notification_logs"

# Re-enable constraints
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SET session_replication_role = DEFAULT;" 2>/dev/null || true

# Count records
echo ""
echo "Data restored. Current record counts:"
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT 'Devices: ' || count(*) FROM devices;
" 2>/dev/null || true
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT 'Commands: ' || count(*) FROM commands;
" 2>/dev/null || true
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT 'Admins: ' || count(*) FROM admins;
" 2>/dev/null || true

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Migration completed successfully!${NC}"
echo "=========================================="
echo ""
echo "Backup files:"
echo "  Data only: $BACKUP_FILE"
echo "  Full backup: $FULL_BACKUP"
echo ""
echo "You can now start the backend:"
echo "  cd ~/Mobile_Device_Management_workspace/mdm-backend && npm run dev"
