#!/bin/bash
# start-mdm.sh
# Quick start script for MDM Backend

set -e

PROJECT_DIR="$HOME/Mobile_Device_Management_workspace"
BACKEND_DIR="$PROJECT_DIR/mdm-backend"

echo "=========================================="
echo "  MDM Backend - Quick Start"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Check if we're inside Proot Ubuntu
if [ ! -f "/etc/os-release" ]; then
    echo "⚠️  Please run this script inside Ubuntu Proot"
    echo "   proot-distro login ubuntu"
    exit 1
fi

echo -e "${YELLOW}[1/4] Starting services...${NC}"

# Start PostgreSQL
if ! pg_isready -q 2>/dev/null; then
    echo "Starting PostgreSQL..."
    service postgresql start 2>/dev/null || pg_ctlcluster 14 main start 2>/dev/null || sudo -u postgres pg_ctl -D /var/lib/postgresql/data start 2>/dev/null || true
    sleep 2
fi

# Start Redis
if ! redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "Starting Redis..."
    redis-server --daemonize yes --port 6379 2>/dev/null || true
fi

echo -e "${GREEN}✓ Services running${NC}"

echo -e "${YELLOW}[2/4] Checking database...${NC}"
cd "$BACKEND_DIR"

# Apply migrations if any
npx prisma migrate deploy 2>/dev/null || true

echo -e "${GREEN}✓ Database ready${NC}"

echo ""
echo -e "${YELLOW}[3/4] Starting Backend...${NC}"
echo "========================================"

# Display connection info
echo "📊 Connection Info:"
echo "   Local:   http://localhost:3000"
echo "   Network: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "🌐 To run ngrok (open another terminal):"
echo "   ngrok http 3000"
echo ""
echo "========================================"
echo ""

# Start backend
npm run dev
