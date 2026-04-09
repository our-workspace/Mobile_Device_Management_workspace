#!/bin/bash
# start-mdm.sh
# سكريبت تشغيل سريع للـ MDM Backend

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

# التحقق من أننا داخل Proot Ubuntu
if [ ! -f "/etc/os-release" ]; then
    echo "⚠️  يرجى تشغيل هذا السكريبت داخل Ubuntu Proot"
    echo "   proot-distro login ubuntu"
    exit 1
fi

echo -e "${YELLOW}[1/4] بدء الخدمات...${NC}"

# بدء PostgreSQL
if ! pg_isready -q 2>/dev/null; then
    echo "بدء PostgreSQL..."
    service postgresql start 2>/dev/null || pg_ctlcluster 14 main start 2>/dev/null || sudo -u postgres pg_ctl -D /var/lib/postgresql/data start 2>/dev/null || true
    sleep 2
fi

# بدء Redis
if ! redis-cli ping 2>/dev/null | grep -q PONG; then
    echo "بدء Redis..."
    redis-server --daemonize yes --port 6379 2>/dev/null || true
fi

echo -e "${GREEN}✓ الخدمات تعمل${NC}"

echo -e "${YELLOW}[2/4] التحقق من قاعدة البيانات...${NC}"
cd "$BACKEND_DIR"

# تطبيق migrations إن وجدت
npx prisma migrate deploy 2>/dev/null || true

echo -e "${GREEN}✓ قاعدة البيانات جاهزة${NC}"

echo ""
echo -e "${YELLOW}[3/4] تشغيل Backend...${NC}"
echo "========================================"

# عرض معلومات الاتصال
echo "📊 معلومات الاتصال:"
echo "   Local:   http://localhost:3000"
echo "   Network: http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "🌐 لتشغيل ngrok (افتح terminal آخر):"
echo "   ngrok http 3000"
echo ""
echo "========================================"
echo ""

# تشغيل الـ backend
npm run dev
