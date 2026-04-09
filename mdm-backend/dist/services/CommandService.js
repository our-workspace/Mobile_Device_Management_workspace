"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommandService = void 0;
// src/services/CommandService.ts
const uuid_1 = require("uuid");
const prisma_1 = __importDefault(require("../db/prisma"));
const ConnectionRegistry_1 = require("../websocket/ConnectionRegistry");
const redis_1 = require("../db/redis");
exports.CommandService = {
    async createAndDispatch(options) {
        const { deviceUid, commandType, params = {}, priority = 'normal', timeoutSeconds = 120, adminId, } = options;
        // التحقق من وجود الجهاز
        const device = await prisma_1.default.device.findUnique({ where: { deviceUid } });
        if (!device)
            throw new Error('DEVICE_NOT_FOUND');
        const commandId = `cmd_${(0, uuid_1.v4)().replace(/-/g, '').substring(0, 12)}`;
        // إنشاء أمر في قاعدة البيانات
        await prisma_1.default.command.create({
            data: {
                commandId,
                deviceId: device.id,
                adminId: adminId ?? null,
                commandType,
                params: params,
                priority,
                timeoutSeconds,
                status: 'PENDING',
            },
        });
        // محاولة إرسال الأمر فوراً إذا الجهاز متصل (in-memory check)
        const isOnline = ConnectionRegistry_1.ConnectionRegistry.isAgentOnline(deviceUid);
        if (isOnline) {
            const message = {
                type: 'command',
                msgId: (0, uuid_1.v4)(),
                timestamp: new Date().toISOString(),
                payload: {
                    commandId,
                    commandType,
                    priority,
                    timeoutSeconds,
                    params,
                },
            };
            const sent = ConnectionRegistry_1.ConnectionRegistry.sendToAgent(deviceUid, message);
            if (sent) {
                await prisma_1.default.command.update({
                    where: { commandId },
                    data: { status: 'SENT' },
                });
                console.log(`[CommandService] Dispatched ${commandId} to ${deviceUid}`);
                return { commandId, status: 'SENT', dispatched: true };
            }
        }
        // الجهاز offline → وضع في قائمة الانتظار
        await prisma_1.default.command.update({
            where: { commandId },
            data: { status: 'QUEUED' },
        });
        // حفظ في Redis إذا كان متاحاً (اختياري)
        await (0, redis_1.safeRedis)(async (redis) => {
            await redis.rpush(redis_1.RedisKeys.devicePendingCmds(deviceUid), commandId);
        });
        console.log(`[CommandService] Queued ${commandId} for offline device ${deviceUid}`);
        return { commandId, status: 'QUEUED', dispatched: false };
    },
    // استرجاع الأوامر المعلّقة لجهاز (يُستخدم عند agent_hello)
    async getPendingCommandsForDevice(deviceUid) {
        const device = await prisma_1.default.device.findUnique({ where: { deviceUid } });
        if (!device)
            return [];
        const commands = await prisma_1.default.command.findMany({
            where: {
                deviceId: device.id,
                status: { in: ['QUEUED', 'PENDING'] },
            },
            orderBy: { createdAt: 'asc' },
        });
        return commands.map((cmd) => ({
            commandId: cmd.commandId,
            commandType: cmd.commandType,
            priority: cmd.priority,
            timeoutSeconds: cmd.timeoutSeconds,
            params: cmd.params,
        }));
    },
    // تحديث حالة الأمر عند استلام command_ack
    async markAcknowledged(commandId) {
        try {
            await prisma_1.default.command.update({
                where: { commandId },
                data: {
                    status: 'IN_PROGRESS',
                    acknowledgedAt: new Date(),
                },
            });
        }
        catch (error) {
            if (error.code === 'P2025') {
                console.warn(`[CommandService] Command ${commandId} not found to mark acknowledged (possibly cancelled)`);
            }
            else {
                throw error;
            }
        }
    },
    // تحديث الأمر عند استلام command_result
    async markCompleted(commandId, status, result, errorCode, errorMessage) {
        try {
            await prisma_1.default.command.update({
                where: { commandId },
                data: {
                    status: status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
                    result: (result ?? undefined),
                    errorCode: errorCode ?? null,
                    errorMessage: errorMessage ?? null,
                    completedAt: new Date(),
                },
            });
            // إزالة من Redis queue إذا كان موجوداً (اختياري)
            const command = await prisma_1.default.command.findUnique({
                where: { commandId },
                include: { device: true },
            });
            if (command) {
                await (0, redis_1.safeRedis)(async (redis) => {
                    await redis.lrem(redis_1.RedisKeys.devicePendingCmds(command.device.deviceUid), 1, commandId);
                });
            }
        }
        catch (error) {
            if (error.code === 'P2025') {
                console.warn(`[CommandService] Command ${commandId} not found to mark completed (possibly cancelled)`);
            }
            else {
                throw error;
            }
        }
    },
    // جلب سجل الأوامر لجهاز معين
    async getCommandHistory(deviceUid, limit = 20) {
        const device = await prisma_1.default.device.findUnique({ where: { deviceUid } });
        if (!device)
            return [];
        return prisma_1.default.command.findMany({
            where: { deviceId: device.id },
            orderBy: { createdAt: 'desc' },
            take: limit,
            select: {
                commandId: true,
                commandType: true,
                status: true,
                priority: true,
                params: true,
                result: true,
                errorCode: true,
                errorMessage: true,
                createdAt: true,
                acknowledgedAt: true,
                completedAt: true,
                admin: {
                    select: { username: true },
                },
            },
        });
    },
    // جلب الأوامر في الـ audit log (كل الأجهزة)
    async getRecentCommands(limit = 50) {
        return prisma_1.default.command.findMany({
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                device: {
                    select: { deviceUid: true, model: true },
                },
                admin: {
                    select: { username: true },
                },
            },
        });
    },
};
//# sourceMappingURL=CommandService.js.map