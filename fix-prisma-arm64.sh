#!/bin/bash
# fix-prisma-arm64.sh
# Fix Prisma engine for ARM64

set -e

echo "=========================================="
echo "  Fixing Prisma for ARM64"
echo "=========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PRISMA_DIR="$HOME/Mobile_Device_Management_workspace/mdm-backend/node_modules/@prisma/engines"
PRISMA_CLIENT="$HOME/Mobile_Device_Management_workspace/mdm-backend/node_modules/.prisma/client"

# Download URLs for ARM64
SCHEMA_ENGINE_URL="https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-arm64-openssl-3.0.x/schema-engine.gz"
QUERY_ENGINE_URL="https://binaries.prisma.sh/all_commits/605197351a3c8bdd595af2d2a9bc3025bca48ea2/debian-arm64-openssl-3.0.x/libquery_engine.so.node"

echo -e "${YELLOW}[1/3] Creating directories...${NC}"
mkdir -p "$PRISMA_DIR"
mkdir -p "$PRISMA_CLIENT"

cd /tmp

echo -e "${YELLOW}[2/3] Downloading ARM64 engines...${NC}"

# Download schema engine (for migrations)
if [ ! -f "$PRISMA_DIR/schema-engine-debian-openssl-3.0.x" ]; then
    echo "Downloading schema-engine..."
    curl -L -o schema-engine.gz "$SCHEMA_ENGINE_URL"
    gunzip -f schema-engine.gz
    chmod +x schema-engine
    mv schema-engine "$PRISMA_DIR/schema-engine-debian-openssl-3.0.x"
    echo -e "${GREEN}✓ Schema engine downloaded${NC}"
else
    echo -e "${GREEN}✓ Schema engine exists${NC}"
fi

# Download query engine (for queries)
if [ ! -f "$PRISMA_CLIENT/libquery_engine.so.node" ]; then
    echo "Downloading query engine..."
    curl -L -o libquery_engine.so.node "$QUERY_ENGINE_URL"
    mv libquery_engine.so.node "$PRISMA_CLIENT/"
    echo -e "${GREEN}✓ Query engine downloaded${NC}"
else
    echo -e "${GREEN}✓ Query engine exists${NC}"
fi

# Create symlinks for compatibility
echo -e "${YELLOW}[3/3] Creating compatibility symlinks...${NC}"
cd "$PRISMA_DIR"
ln -sf schema-engine-debian-openssl-3.0.x schema-engine-debian-openssl-1.1.x 2>/dev/null || true

cd "$PRISMA_CLIENT"
ln -sf libquery_engine.so.node libquery_engine-debian-openssl-1.1.x.so.node 2>/dev/null || true
ln -sf libquery_engine.so.node libquery_engine-debian-openssl-3.0.x.so.node 2>/dev/null || true

echo -e "${GREEN}✓ Prisma engines fixed!${NC}"
echo ""
echo "Now run: cd ~/Mobile_Device_Management_workspace/mdm-backend && npm run dev"
