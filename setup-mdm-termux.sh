#!/bin/bash
# setup-mdm-termux.sh
# MDM Backend Setup Script for Ubuntu ARM64 on Termux Proot

set -e

echo "=========================================="
echo "  MDM Backend Setup for Ubuntu ARM64"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Variables
PROJECT_DIR="$HOME/Mobile_Device_Management_workspace"
BACKEND_DIR="$PROJECT_DIR/mdm-backend"
DB_NAME="mdm_db"
DB_USER="postgres"
DB_PASS="postgres123"
NGROK_TOKEN="2PEwUttOJFiRgrbDzJE6VjvUjSQ_5fap6y5rNuqY58VUwhN1Z"

# ===== Check Functions =====
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

package_installed() {
    dpkg -l "$1" 2>/dev/null | grep -q "^ii"
}

echo -e "${YELLOW}[1/8] Updating system...${NC}"
apt-get update

echo -e "${YELLOW}[2/8] Checking tools...${NC}"

# Required tools list
TOOLS_TO_INSTALL=""

# Check each tool
if ! command_exists curl; then
    TOOLS_TO_INSTALL="$TOOLS_TO_INSTALL curl"
else
    echo -e "${GREEN}✓ curl found (v$(curl --version | head -1 | awk '{print $2}'))${NC}"
fi

if ! command_exists wget; then
    TOOLS_TO_INSTALL="$TOOLS_TO_INSTALL wget"
else
    echo -e "${GREEN}✓ wget found (v$(wget --version | head -1 | awk '{print $3}'))${NC}"
fi

if ! command_exists git; then
    TOOLS_TO_INSTALL="$TOOLS_TO_INSTALL git"
else
    echo -e "${GREEN}✓ git found ($(git --version | awk '{print $3}'))${NC}"
fi

if ! command_exists node; then
    TOOLS_TO_INSTALL="$TOOLS_TO_INSTALL nodejs npm"
else
    echo -e "${GREEN}✓ Node.js found ($(node --version))${NC}"
fi

if ! command_exists psql; then
    TOOLS_TO_INSTALL="$TOOLS_TO_INSTALL postgresql postgresql-contrib"
else
    echo -e "${GREEN}✓ PostgreSQL found ($(psql --version | awk '{print $3}'))${NC}"
fi

if ! command_exists redis-server; then
    TOOLS_TO_INSTALL="$TOOLS_TO_INSTALL redis-server"
else
    echo -e "${GREEN}✓ Redis found${NC}"
fi

if ! package_installed openssl; then
    TOOLS_TO_INSTALL="$TOOLS_TO_INSTALL openssl libssl-dev"
else
    echo -e "${GREEN}✓ OpenSSL found${NC}"
fi

if ! package_installed build-essential; then
    TOOLS_TO_INSTALL="$TOOLS_TO_INSTALL build-essential"
else
    echo -e "${GREEN}✓ build-essential found${NC}"
fi

# Install only missing tools
if [ -n "$TOOLS_TO_INSTALL" ]; then
    echo -e "${YELLOW}📦 Installing: $TOOLS_TO_INSTALL${NC}"
    apt-get install -y $TOOLS_TO_INSTALL net-tools sqlite3
else
    echo -e "${GREEN}✓ All tools are present!${NC}"
fi

echo -e "${YELLOW}[3/8] Checking ngrok...${NC}"
if command_exists ngrok; then
    echo -e "${GREEN}✓ ngrok found${NC}"
else
    echo -e "${YELLOW}📥 Installing ngrok...${NC}"
    cd /tmp
    wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
    tar -xzf ngrok-v3-stable-linux-arm64.tgz
    mv ngrok /usr/local/bin/
    rm -f ngrok-v3-stable-linux-arm64.tgz
    echo -e "${GREEN}✓ ngrok installed${NC}"
fi

# Setup ngrok
mkdir -p "$HOME/.config/ngrok"
echo "authtoken: $NGROK_TOKEN" > "$HOME/.config/ngrok/ngrok.yml"
echo -e "${GREEN}✓ ngrok token configured${NC}"

echo -e "${YELLOW}[4/8] Setting up PostgreSQL...${NC}"
# Start PostgreSQL service
service postgresql start 2>/dev/null || pg_ctlcluster 14 main start 2>/dev/null || echo -e "${YELLOW}⚠ PostgreSQL may already be running${NC}"

# Wait for service to start
sleep 2

# Create user and database
su - postgres -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\"" 2>/dev/null || true
su - postgres -c "psql -c \"ALTER USER $DB_USER WITH SUPERUSER;\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\"" 2>/dev/null || true
su - postgres -c "psql -c \"ALTER DATABASE $DB_NAME SET timezone TO 'UTC';\"" 2>/dev/null || true

echo -e "${GREEN}✓ Database $DB_NAME created${NC}"

echo -e "${YELLOW}[5/8] Setting up Redis...${NC}"
# Start Redis
redis-server --daemonize yes --port 6379 || true
echo -e "${GREEN}✓ Redis running${NC}"

echo -e "${YELLOW}[6/8] Restoring backup...${NC}"
BACKUP_FILE="$PROJECT_DIR/mdm_db.backup"
if [ -f "$BACKUP_FILE" ]; then
    echo "Restoring: $BACKUP_FILE"
    su - postgres -c "pg_restore --clean --if-exists -d $DB_NAME '$BACKUP_FILE'" 2>/dev/null || \
    su - postgres -c "psql $DB_NAME < '$BACKUP_FILE'" 2>/dev/null || \
    echo -e "${YELLOW}⚠ Backup restore failed (may be empty or corrupted)${NC}"
    echo -e "${GREEN}✓ Tables will be created automatically on first run${NC}"
else
    echo -e "${YELLOW}⚠ $BACKUP_FILE not found${NC}"
    echo "A new database will be created"
fi

echo -e "${YELLOW}[7/8] Setting up Backend project...${NC}"
cd "$BACKEND_DIR"

# Create .env file
cat > .env << EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ENROLLMENT_TOKEN=secure-enrollment-token-change-me
PORT=3000
FILE_STORAGE_PATH=./uploads
EOF

echo -e "${GREEN}✓ .env file created${NC}"

# Remove old node_modules if exists
if [ -d "node_modules" ]; then
    echo "Removing old node_modules..."
    rm -rf node_modules package-lock.json
fi

echo -e "${YELLOW}[8/8] Installing dependencies...${NC}"
npm install

echo -e "${YELLOW}Generating Prisma Client...${NC}"
npx prisma generate

echo -e "${YELLOW}Applying migrations...${NC}"
npx prisma migrate deploy || true

echo ""
echo "=========================================="
echo -e "${GREEN}✓ Setup completed successfully!${NC}"
echo "=========================================="
echo ""
echo "📁 Path: $BACKEND_DIR"
echo "🗄️  Database: $DB_NAME"
echo "🔧 ngrok token: configured"
echo ""
echo "🚀 To start the project:"
echo "   cd $BACKEND_DIR"
echo "   npm run dev"
echo ""
echo "🌐 To run ngrok (in another terminal):"
echo "   ngrok http 3000"
echo ""
echo "📋 Notes:"
echo "   - PostgreSQL running on port 5432"
echo "   - Redis running on port 6379"
echo "   - Backend running on port 3000"
echo ""
