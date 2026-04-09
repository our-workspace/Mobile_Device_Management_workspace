#!/bin/bash
# setup-mdm-termux.sh
# سكريبت إعداد MDM Backend على Ubuntu ARM64 داخل Termux Proot

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

echo -e "${YELLOW}[1/8] تحديث النظام...${NC}"
apt-get update && apt-get upgrade -y

echo -e "${YELLOW}[2/8] تثبيت الأدوات الأساسية...${NC}"
apt-get install -y \
    curl \
    wget \
    git \
    postgresql \
    postgresql-contrib \
    nodejs \
    npm \
    redis-server \
    openssl \
    libssl-dev \
    build-essential \
    sqlite3 \
    net-tools

echo -e "${YELLOW}[3/8] تثبيت ngrok...${NC}"
# تحميل ngrok للـ ARM64
cd /tmp
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
tar -xzf ngrok-v3-stable-linux-arm64.tgz
mv ngrok /usr/local/bin/
rm ngrok-v3-stable-linux-arm64.tgz

# إعداد ngrok
mkdir -p "$HOME/.config/ngrok"
echo "authtoken: $NGROK_TOKEN" > "$HOME/.config/ngrok/ngrok.yml"
echo -e "${GREEN}✓ ngrok تم تثبيته${NC}"

echo -e "${YELLOW}[4/8] إعداد PostgreSQL...${NC}"
# بدء خدمة PostgreSQL
service postgresql start || pg_ctlcluster 14 main start || true

# انتظار بدء الخدمة
sleep 2

# إنشاء المستخدم وقاعدة البيانات
su - postgres -c "psql -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\"" 2>/dev/null || true
su - postgres -c "psql -c \"ALTER USER $DB_USER WITH SUPERUSER;\"" 2>/dev/null || true
su - postgres -c "psql -c \"CREATE DATABASE $DB_NAME OWNER $DB_USER;\"" 2>/dev/null || true
su - postgres -c "psql -c \"ALTER DATABASE $DB_NAME SET timezone TO 'UTC';\"" 2>/dev/null || true

echo -e "${GREEN}✓ قاعدة البيانات $DB_NAME تم إنشاؤها${NC}"

echo -e "${YELLOW}[5/8] إعداد Redis...${NC}"
# بدء Redis
redis-server --daemonize yes --port 6379 || true
echo -e "${GREEN}✓ Redis يعمل${NC}"

echo -e "${YELLOW}[6/8] استعادة النسخة الاحتياطية...${NC}"
BACKUP_FILE="$PROJECT_DIR/mdm_db.backup"
if [ -f "$BACKUP_FILE" ]; then
    echo "جاري استعادة: $BACKUP_FILE"
    su - postgres -c "pg_restore --clean --if-exists -d $DB_NAME '$BACKUP_FILE'" 2>/dev/null || \
    su - postgres -c "psql $DB_NAME < '$BACKUP_FILE'" 2>/dev/null || \
    echo -e "${YELLOW}⚠ فشل استعادة الـ backup (قد يكون فارغاً أو تالفاً)${NC}"
    echo -e "${GREEN}✓ سيتم إنشاء الجداول تلقائياً عند أول تشغيل${NC}"
else
    echo -e "${YELLOW}⚠ لم يتم العثور على $BACKUP_FILE${NC}"
    echo "سيتم إنشاء قاعدة بيانات جديدة"
fi

echo -e "${YELLOW}[7/8] إعداد مشروع Backend...${NC}"
cd "$BACKEND_DIR"

# إنشاء ملف .env
cat > .env << EOF
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
ENROLLMENT_TOKEN=secure-enrollment-token-change-me
PORT=3000
FILE_STORAGE_PATH=./uploads
EOF

echo -e "${GREEN}✓ ملف .env تم إنشاؤه${NC}"

# حذف node_modules القديمة إن وجدت
if [ -d "node_modules" ]; then
    echo "حذف node_modules القديمة..."
    rm -rf node_modules package-lock.json
fi

echo -e "${YELLOW}[8/8] تثبيت dependencies...${NC}"
npm install

echo -e "${YELLOW}توليد Prisma Client...${NC}"
npx prisma generate

echo -e "${YELLOW}تطبيق migrations...${NC}"
npx prisma migrate deploy || true

echo ""
echo "=========================================="
echo -e "${GREEN}✓ تم الإعداد بنجاح!${NC}"
echo "=========================================="
echo ""
echo "📁 المسار: $BACKEND_DIR"
echo "🗄️  قاعدة البيانات: $DB_NAME"
echo "🔧 ngrok token: مُعَّرف"
echo ""
echo "🚀 لتشغيل المشروع:"
echo "   cd $BACKEND_DIR"
echo "   npm run dev"
echo ""
echo "🌐 لتشغيل ngrok (في terminal آخر):"
echo "   ngrok http 3000"
echo ""
echo "📋 ملاحظات:"
echo "   - PostgreSQL يعمل على port 5432"
echo "   - Redis يعمل على port 6379"
echo "   - Backend يعمل على port 3000"
echo ""
