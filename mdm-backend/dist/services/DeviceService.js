"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = __importDefault(require("../db/prisma"));
const AuthService_1 = require("./AuthService");
const ConnectionRegistry_1 = require("../websocket/ConnectionRegistry");
const config_1 = require("../config");
exports.DeviceService = {
    // ---- Registration ----
    async registerDevice(data) {
        // التحقق من enrollment token
        if (!AuthService_1.AuthService.validateEnrollmentToken(data.enrollmentToken)) {
            throw new Error('INVALID_ENROLLMENT_TOKEN');
        }
        // هل الجهاز مسجّل مسبقاً؟
        const existing = await prisma_1.default.device.findUnique({
            where: { androidId: data.androidId },
        });
        if (existing) {
            // إعادة إصدار توكن جديد للجهاز المعاد تسجيله
            const authToken = exports.DeviceService._generateDeviceJwt(existing.deviceUid);
            const tokenHash = await AuthService_1.AuthService.hashToken(authToken);
            await prisma_1.default.device.update({
                where: { id: existing.id },
                data: {
                    agentVersion: data.agentVersion,
                    androidVersion: data.androidVersion,
                    sdkVersion: data.sdkVersion,
                    authTokenHash: tokenHash,
                    lastSeenAt: new Date(),
                },
            });
            console.log(`[DeviceService] Re-registered device: ${existing.deviceUid}`);
            return {
                deviceUid: existing.deviceUid,
                authToken,
                wsUrl: `${config_1.config.isDev ? 'ws' : 'wss'}://${config_1.config.publicHost}:${config_1.config.port}${config_1.config.wsAgentPath}`,
                heartbeatIntervalSeconds: config_1.config.heartbeatIntervalSeconds,
            };
        }
        // جهاز جديد
        const deviceUid = AuthService_1.AuthService.generateDeviceUid();
        const authToken = exports.DeviceService._generateDeviceJwt(deviceUid);
        const tokenHash = await AuthService_1.AuthService.hashToken(authToken);
        await prisma_1.default.device.create({
            data: {
                deviceUid,
                androidId: data.androidId,
                serialNumber: data.serialNumber,
                model: data.model,
                manufacturer: data.manufacturer,
                androidVersion: data.androidVersion,
                sdkVersion: data.sdkVersion,
                agentVersion: data.agentVersion,
                authTokenHash: tokenHash,
            },
        });
        console.log(`[DeviceService] New device registered: ${deviceUid}`);
        return {
            deviceUid,
            authToken,
            wsUrl: `${config_1.config.isDev ? 'ws' : 'wss'}://${config_1.config.publicHost}:${config_1.config.port}${config_1.config.wsAgentPath}`,
            heartbeatIntervalSeconds: config_1.config.heartbeatIntervalSeconds,
        };
    },
    // ---- Token Verification (للـ WebSocket) ----
    async verifyDeviceToken(authToken) {
        let payload;
        try {
            payload = jsonwebtoken_1.default.verify(authToken, config_1.config.jwtSecret);
        }
        catch {
            throw new Error('INVALID_TOKEN');
        }
        const device = await prisma_1.default.device.findUnique({
            where: { deviceUid: payload.deviceUid },
        });
        if (!device) {
            throw new Error('DEVICE_NOT_FOUND');
        }
        // التحقق من هاش التوكن
        const isValid = await AuthService_1.AuthService.verifyTokenHash(authToken, device.authTokenHash);
        if (!isValid) {
            throw new Error('TOKEN_MISMATCH');
        }
        return { deviceUid: payload.deviceUid, device };
    },
    // ---- Queries ----
    async getAllDevices() {
        const devices = await prisma_1.default.device.findMany({
            orderBy: { lastSeenAt: 'desc' },
            select: {
                id: true,
                deviceUid: true,
                model: true,
                manufacturer: true,
                androidVersion: true,
                agentVersion: true,
                serialNumber: true,
                enrolledAt: true,
                lastSeenAt: true,
            },
        });
        // إضافة حالة الاتصال الحية
        return devices.map((device) => ({
            ...device,
            isOnline: ConnectionRegistry_1.ConnectionRegistry.isAgentOnline(device.deviceUid),
        }));
    },
    async getDeviceByUid(deviceUid) {
        const device = await prisma_1.default.device.findUnique({
            where: { deviceUid },
            include: {
                commands: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
                backupFiles: {
                    orderBy: { createdAt: 'desc' },
                    take: 10,
                },
            },
        });
        if (!device)
            return null;
        return {
            ...device,
            isOnline: ConnectionRegistry_1.ConnectionRegistry.isAgentOnline(deviceUid),
            authTokenHash: undefined, // لا نُرجع الهاش للـ API
        };
    },
    async updateLastSeen(deviceUid) {
        await prisma_1.default.device.update({
            where: { deviceUid },
            data: { lastSeenAt: new Date() },
        });
    },
    async saveHeartbeat(deviceUid, heartbeatData) {
        const device = await prisma_1.default.device.findUnique({ where: { deviceUid } });
        if (!device)
            return;
        await prisma_1.default.heartbeat.create({
            data: {
                deviceId: device.id,
                ...heartbeatData,
            },
        });
        // تحديث lastSeenAt
        await prisma_1.default.device.update({
            where: { id: device.id },
            data: { lastSeenAt: new Date() },
        });
    },
    // ---- Internal ----
    _generateDeviceJwt(deviceUid) {
        return jsonwebtoken_1.default.sign({ deviceUid, type: 'device' }, config_1.config.jwtSecret, { expiresIn: config_1.config.jwtDeviceExpiry });
    },
};
//# sourceMappingURL=DeviceService.js.map