"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentGateway = createAgentGateway;
// src/websocket/AgentGateway.ts
// =====================================================================
// يدير اتصالات WebSocket مع الـ Android Agents
// =====================================================================
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const ConnectionRegistry_1 = require("./ConnectionRegistry");
const DeviceService_1 = require("../services/DeviceService");
const CommandService_1 = require("../services/CommandService");
const ConnectionRegistry_2 = require("./ConnectionRegistry");
const prisma_1 = __importDefault(require("../db/prisma"));
function createAgentGateway(wss) {
    wss.on('connection', async (ws, req) => {
        const socketId = (0, uuid_1.v4)();
        let authenticatedDeviceUid = null;
        console.log(`[AgentGW] New connection attempt (socketId: ${socketId})`);
        // Timeout للمصادقة: 10 ثوانٍ
        const authTimeout = setTimeout(() => {
            if (!authenticatedDeviceUid) {
                console.warn(`[AgentGW] Auth timeout for socket ${socketId}`);
                sendError(ws, 'AUTH_TIMEOUT', 'Authentication required within 10 seconds');
                ws.close(4001, 'Auth timeout');
            }
        }, 10000);
        ws.on('message', async (data) => {
            console.log(`[AgentGW] Received raw data from ${socketId}:`, data.toString());
            let message;
            try {
                message = JSON.parse(data.toString());
            }
            catch {
                sendError(ws, 'INVALID_JSON', 'Message must be valid JSON');
                return;
            }
            try {
                await handleMessage(ws, socketId, message, authenticatedDeviceUid, (uid) => {
                    authenticatedDeviceUid = uid;
                    clearTimeout(authTimeout);
                });
            }
            catch (err) {
                const error = err;
                console.error(`[AgentGW] Error handling message from ${authenticatedDeviceUid}:`, error.message);
                sendError(ws, 'INTERNAL_ERROR', error.message);
            }
        });
        ws.on('close', async (code, reason) => {
            clearTimeout(authTimeout);
            if (authenticatedDeviceUid) {
                await ConnectionRegistry_1.ConnectionRegistry.unregisterAgent(socketId);
                // إبلاغ الـ Dashboard بانقطاع الجهاز
                ConnectionRegistry_2.ConnectionRegistry.broadcastToDashboards({
                    event: 'device_offline',
                    deviceUid: authenticatedDeviceUid,
                    timestamp: new Date().toISOString(),
                });
                console.log(`[AgentGW] ${authenticatedDeviceUid} disconnected (${code})`);
            }
        });
        ws.on('error', (err) => {
            console.error(`[AgentGW] WebSocket error for ${authenticatedDeviceUid}:`, err.message);
        });
    });
    console.log('[AgentGW] Agent WebSocket Gateway initialized');
}
async function handleMessage(ws, socketId, message, currentDeviceUid, setAuthenticated) {
    // المصادقة مطلوبة لكل رسالة إلا agent_hello
    if (message.type !== 'agent_hello' && !currentDeviceUid) {
        sendError(ws, 'NOT_AUTHENTICATED', 'Send agent_hello first', message.msgId);
        return;
    }
    switch (message.type) {
        case 'agent_hello':
            await handleAgentHello(ws, socketId, message, setAuthenticated);
            break;
        case 'heartbeat':
            await handleHeartbeat(ws, message, currentDeviceUid);
            break;
        case 'command_ack':
            await handleCommandAck(message);
            break;
        case 'command_result':
            await handleCommandResult(ws, message);
            break;
        case 'notification_event':
            await handleNotificationEvent(message);
            break;
        default:
            sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${message.type}`);
    }
}
// ---- Handlers ----
async function handleAgentHello(ws, socketId, message, setAuthenticated) {
    const { deviceUid, authToken, lastKnownCommandId } = message.payload;
    // التحقق من التوكن
    try {
        await DeviceService_1.DeviceService.verifyDeviceToken(authToken);
    }
    catch (err) {
        const error = err;
        sendError(ws, 'AUTH_FAILED', error.message, message.msgId);
        ws.close(4003, 'Authentication failed');
        return;
    }
    // تسجيل الاتصال
    await ConnectionRegistry_1.ConnectionRegistry.registerAgent(deviceUid, ws, socketId);
    setAuthenticated(deviceUid);
    // تحديث lastSeenAt
    await DeviceService_1.DeviceService.updateLastSeen(deviceUid);
    // جلب الأوامر المعلّقة
    const pendingCommands = await CommandService_1.CommandService.getPendingCommandsForDevice(deviceUid);
    // الرد بـ hello_ack
    const ack = {
        type: 'agent_hello_ack',
        msgId: (0, uuid_1.v4)(),
        timestamp: new Date().toISOString(),
        payload: {
            pendingCommands,
            heartbeatIntervalSeconds: 30,
        },
    };
    ws.send(JSON.stringify(ack));
    // إبلاغ الـ Dashboard
    ConnectionRegistry_2.ConnectionRegistry.broadcastToDashboards({
        event: 'device_online',
        deviceUid,
        timestamp: new Date().toISOString(),
    });
    console.log(`[AgentGW] ${deviceUid} authenticated. Pending commands: ${pendingCommands.length}`);
}
async function handleHeartbeat(ws, message, deviceUid) {
    const { battery, network, storage, uptime } = message.payload;
    // تجديد TTL في Redis
    await ConnectionRegistry_1.ConnectionRegistry.refreshHeartbeatTtl(deviceUid);
    // حفظ في DB
    await DeviceService_1.DeviceService.saveHeartbeat(deviceUid, {
        batteryLevel: battery.level,
        isCharging: battery.isCharging,
        chargingType: battery.chargingType,
        networkType: network.type,
        isConnected: network.isConnected,
        wifiSignalLevel: network.wifiSignalLevel,
        mobileNetType: network.mobileNetworkType,
        storageFreeBytes: BigInt(storage.freeBytes),
        storageTotalBytes: BigInt(storage.totalBytes),
        usedPercent: storage.usedPercent,
        deviceUptimeMs: uptime?.deviceUptimeMs ? BigInt(uptime.deviceUptimeMs) : undefined,
        agentUptimeMs: uptime?.agentUptimeMs ? BigInt(uptime.agentUptimeMs) : undefined,
    });
    // إبلاغ الـ Dashboard بالـ heartbeat
    ConnectionRegistry_2.ConnectionRegistry.broadcastToDashboards({
        event: 'heartbeat',
        deviceUid,
        data: { battery, network, storage },
        timestamp: message.timestamp,
    });
    // الرد
    const ack = {
        type: 'heartbeat_ack',
        msgId: (0, uuid_1.v4)(),
        timestamp: new Date().toISOString(),
        payload: { serverTime: new Date().toISOString() },
    };
    ws.send(JSON.stringify(ack));
}
async function handleCommandAck(message) {
    const { commandId, status } = message.payload;
    await CommandService_1.CommandService.markAcknowledged(commandId);
    console.log(`[AgentGW] Command ack: ${commandId} → ${status}`);
}
async function handleCommandResult(ws, message) {
    const { commandId, status, result, error, executionTimeMs } = message.payload;
    await CommandService_1.CommandService.markCompleted(commandId, status === 'success' ? 'SUCCESS' : 'FAILURE', result, error?.code, error?.message);
    // الرد بـ result_ack
    const ack = {
        type: 'command_result_ack',
        msgId: (0, uuid_1.v4)(),
        timestamp: new Date().toISOString(),
        payload: { commandId, received: true },
    };
    ws.send(JSON.stringify(ack));
    // إبلاغ الـ Dashboard
    ConnectionRegistry_2.ConnectionRegistry.broadcastToDashboards({
        event: 'command_result',
        commandId,
        status,
        result,
        error,
        executionTimeMs,
        timestamp: message.timestamp,
    });
    console.log(`[AgentGW] Command result: ${commandId} → ${status} (${executionTimeMs}ms)`);
}
async function handleNotificationEvent(message) {
    const { deviceUid, notifications } = message.payload;
    // جلب device id
    const device = await prisma_1.default.device.findUnique({ where: { deviceUid } });
    if (!device)
        return;
    // حفظ الإشعارات
    if (notifications.length > 0) {
        await prisma_1.default.notificationLog.createMany({
            data: notifications.map((n) => ({
                deviceId: device.id,
                packageName: n.packageName,
                appName: n.appName,
                title: n.title,
                text: n.text,
                category: n.category,
                postedAt: new Date(n.postedAt),
            })),
            skipDuplicates: true,
        });
    }
    // إبلاغ الـ Dashboard
    ConnectionRegistry_2.ConnectionRegistry.broadcastToDashboards({
        event: 'notifications',
        deviceUid,
        notifications,
        timestamp: message.timestamp,
    });
}
// ---- Helpers ----
function sendError(ws, code, messageText, relatedMsgId) {
    const error = {
        type: 'error',
        msgId: (0, uuid_1.v4)(),
        timestamp: new Date().toISOString(),
        payload: { code, message: messageText, relatedMsgId },
    };
    if (ws.readyState === ws_1.default.OPEN) {
        ws.send(JSON.stringify(error));
    }
}
//# sourceMappingURL=AgentGateway.js.map