#!/bin/bash
# fix-fastify.sh
# Fix Fastify version mismatch

set -e

echo "=========================================="
echo "  Fixing Fastify Version Mismatch"
echo "=========================================="

cd ~/Mobile_Device_Management_workspace/mdm-backend

echo "[1/4] Removing node_modules and lock files..."
rm -rf node_modules
rm -f package-lock.json

echo "[2/4] Clearing npm cache..."
npm cache clean --force

echo "[3/4] Installing exact versions..."
# Install Fastify v4.x (compatible with current plugins)
npm install fastify@4.26.2

echo "[4/4] Installing remaining dependencies..."
npm install

echo ""
echo "=========================================="
echo "  ✓ Fastify fixed!"
echo "=========================================="
echo ""
echo "Run: npm run dev"
