# إعداد MDM Backend على Termux (Ubuntu Proot)

## ⚡ خطوات سريعة

### 1. الدخول إلى Ubuntu Proot
```bash
proot-distro login ubuntu
```

### 2. نقل ملفات المشروع
انسخ مجلد `Mobile_Device_Management_workspace` إلى `~/` داخل Ubuntu.

### 3. تشغيل سكريبت الإعداد
```bash
cd ~/Mobile_Device_Management_workspace
chmod +x setup-mdm-termux.sh
./setup-mdm-termux.sh
```

### 4. تشغيل المشروع
```bash
./start-mdm.sh
```

---

## 🔧 يدوياً (إذا فشل السكريبت)

### تثبيت الأدوات
```bash
apt-get update
apt-get install -y curl wget git postgresql postgresql-contrib nodejs npm redis-server openssl
```

### تثبيت ngrok
```bash
cd /tmp
wget https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-arm64.tgz
tar -xzf ngrok-v3-stable-linux-arm64.tgz
mv ngrok /usr/local/bin/
ngrok config add-authtoken 2PEwUttOJFiRgrbDzJE6VjvUjSQ_5fap6y5rNuqY58VUwhN1Z
```

### إعداد PostgreSQL
```bash
service postgresql start
su - postgres -c "psql -c \"CREATE DATABASE mdm_db;\""
su - postgres -c "psql -c \"CREATE USER postgres WITH PASSWORD 'postgres123';\""
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE mdm_db TO postgres;\""
```

### استعادة Backup
```bash
cd ~/Mobile_Device_Management_workspace
su - postgres -c "pg_restore -d mdm_db mdm_db.backup" 2>/dev/null || \
su - postgres -c "psql mdm_db < mdm_db.backup"
```

### تثبيت Dependencies
```bash
cd mdm-backend
npm install
npx prisma generate
npx prisma migrate deploy
```

### تشغيل
```bash
npm run dev
```

---

## 🌐 تشغيل ngrok

افتح **terminal ثاني** داخل Ubuntu:

```bash
ngrok http 3000
```

انسخ الـ URL (مثل: `https://abc123.ngrok-free.dev`)

---

## ⚠️ ملاحظات مهمة

1. **Prisma على ARM64**: يجب توليد Client بعد `npm install`
2. **PostgreSQL**: يجب بدء الخدمة يدوياً `service postgresql start`
3. **Redis**: يعمل في الخلفية `redis-server --daemonize yes`
4. **ngrok**: يحتاج token صالح (تم تضمينه في السكريبت)

---

## 🐛 حل المشاكل

### مشكلة: Prisma binary غير متوافق
```bash
cd mdm-backend
rm -rf node_modules
npm install
npx prisma generate
```

### مشكلة: PostgreSQL لا يبدأ
```bash
pg_ctlcluster 14 main start
# أو
service postgresql restart
```

### مشكلة: port 3000 مشغول
```bash
kill $(lsof -t -i:3000) 2>/dev/null || true
```

---

## 📂 هيكل الملفات

```
~/Mobile_Device_Management_workspace/
├── setup-mdm-termux.sh      # سكريبت الإعداد الكامل
├── start-mdm.sh             # سكريبت التشغيل السريع
├── mdm_db.backup            # نسخة قاعدة البيانات
├── mdm-backend/             # مشروع Backend
│   ├── .env                 # إعدادات البيئة
│   ├── prisma/
│   ├── src/
│   └── package.json
└── mdm-dashboard/           # مشروع Dashboard
```

---

## ✅ checklist

- [ ] Ubuntu Proot مُفعَّل
- [ ] ملفات المشروع منسوخة
- [ ] `./setup-mdm-termux.sh` تم تنفيذه بدون أخطاء
- [ ] `npm run dev` يعمل
- [ ] ngrok يعمل ويعرض URL
- [ ] Agent يتصل بنجاح
