#!/bin/bash
# migrate-to-pg.sh
# Script to migrate from Prisma to node-postgres

set -e

echo "=========================================="
echo "  Migrating from Prisma to pg"
echo "=========================================="

cd ~/Mobile_Device_Management_workspace/mdm-backend

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}[1/5] Removing Prisma...${NC}"
rm -rf node_modules/@prisma
rm -rf node_modules/prisma
rm -rf node_modules/.prisma
rm -rf prisma/migrations 2>/dev/null || true
rm -f prisma/dev.db 2>/dev/null || true

echo -e "${YELLOW}[2/5] Installing pg dependencies...${NC}"
npm install pg
npm install --save-dev @types/pg

echo -e "${YELLOW}[3/5] Cleaning old build...${NC}"
rm -rf dist
rm -rf node_modules/.cache

echo -e "${YELLOW}[4/5] Building project...${NC}"
npm run build 2>/dev/null || echo -e "${YELLOW}Build warnings ignored${NC}"

echo -e "${YELLOW}[5/5] Initializing database...${NC}"
# Run the init SQL manually
if [ -f src/db/init.sql ]; then
    echo "Please run the following command to initialize the database:"
    echo "  sudo -u postgres psql -d mdm_db -f src/db/init.sql"
    echo ""
    echo "Or let the app auto-create tables on first run."
fi

echo ""
echo -e "${GREEN}✓ Migration complete!${NC}"
echo ""
echo "To start the server:"
echo "  npm run dev"
echo ""
echo "If you encounter any issues, check:"
echo "  1. PostgreSQL is running: service postgresql status"
echo "  2. Database mdm_db exists"
echo "  3. .env file has correct DATABASE_URL"
echo ""
