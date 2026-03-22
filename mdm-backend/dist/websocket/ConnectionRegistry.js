"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionRegistry = void 0;
// src/websocket/ConnectionRegistry.ts
// =====================================================================
// يتتبع الاتصالات الحية للأجهزة (في الذاكرة + Redis optional)
// =====================================================================
const ws_1 = __importDefault(require("ws"));
const redis_1 = require("../db/redis");
const config_1 = require("../config");
// Map في الذاكرة: deviceUid → connection
const connections = new Map();
// Map للـ socket ID → deviceUid (للبحث العكسي)
const socketToDevice = new Map();
// Dashboard connections
const dashboardConnections = new Set();
exports.ConnectionRegistry = {
    // ---- Agent Connections ----
    async registerAgent(deviceUid, ws, socketId) {
        const conn = {
            ws,
            deviceUid,
            connectedAt: new Date(),
            socketId,
        };
        connections.set(deviceUid, conn);
        socketToDevice.set(socketId, deviceUid);
        // Redis optional – لا يوقف التسجيل إذا كان غائباً
        await (0, redis_1.safeRedis)(async (redis) => {
            await redis.setex(redis_1.RedisKeys.deviceOnline(deviceUid), config_1.config.heartbeatTtlSeconds, '1');
            await redis.set(redis_1.RedisKeys.deviceSocketId(deviceUid), socketId);
        });
        console.log(`[Registry] Agent registered: ${deviceUid} (total: ${connections.size})`);
    },
    async unregisterAgent(socketId) {
        const deviceUid = socketToDevice.get(socketId);
        if (!deviceUid)
            return null;
        connections.delete(deviceUid);
        socketToDevice.delete(socketId);
        await (0, redis_1.safeRedis)(async (redis) => {
            await redis.del(redis_1.RedisKeys.deviceOnline(deviceUid));
            await redis.del(redis_1.RedisKeys.deviceSocketId(deviceUid));
        });
        console.log(`[Registry] Agent disconnected: ${deviceUid} (total: ${connections.size})`);
        return deviceUid;
    },
    getAgentSocket(deviceUid) {
        return connections.get(deviceUid)?.ws ?? null;
    },
    isAgentOnline(deviceUid) {
        const conn = connections.get(deviceUid);
        if (!conn)
            return false;
        return conn.ws.readyState === ws_1.default.OPEN;
    },
    getOnlineDeviceUids() {
        return Array.from(connections.keys());
    },
    getConnectionInfo(deviceUid) {
        const conn = connections.get(deviceUid);
        if (!conn)
            return null;
        const { ws, ...info } = conn;
        return info;
    },
    async refreshHeartbeatTtl(deviceUid) {
        await (0, redis_1.safeRedis)(async (redis) => {
            await redis.expire(redis_1.RedisKeys.deviceOnline(deviceUid), config_1.config.heartbeatTtlSeconds);
        });
    },
    // إرسال رسالة لجهاز معين
    sendToAgent(deviceUid, message) {
        const conn = connections.get(deviceUid);
        if (!conn || conn.ws.readyState !== ws_1.default.OPEN) {
            return false;
        }
        try {
            conn.ws.send(JSON.stringify(message));
            return true;
        }
        catch (err) {
            console.error(`[Registry] Failed to send to ${deviceUid}:`, err);
            return false;
        }
    },
    // ---- Dashboard Connections ----
    registerDashboard(ws) {
        dashboardConnections.add(ws);
        console.log(`[Registry] Dashboard connected (total: ${dashboardConnections.size})`);
    },
    unregisterDashboard(ws) {
        dashboardConnections.delete(ws);
        console.log(`[Registry] Dashboard disconnected (total: ${dashboardConnections.size})`);
    },
    // Broadcast حدث لجميع نوافذ الـ Dashboard
    broadcastToDashboards(event) {
        const message = JSON.stringify(event);
        dashboardConnections.forEach((ws) => {
            if (ws.readyState === ws_1.default.OPEN) {
                ws.send(message);
            }
        });
    },
    // ---- Stats ----
    getStats() {
        return {
            agentsOnline: connections.size,
            dashboardsConnected: dashboardConnections.size,
        };
    },
};
//# sourceMappingURL=ConnectionRegistry.js.map