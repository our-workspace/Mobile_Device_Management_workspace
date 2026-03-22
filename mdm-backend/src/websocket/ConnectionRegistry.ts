// src/websocket/ConnectionRegistry.ts
// =====================================================================
// يتتبع الاتصالات الحية للأجهزة (في الذاكرة + Redis optional)
// =====================================================================
import WebSocket from 'ws';
import { safeRedis, RedisKeys } from '../db/redis';
import { config } from '../config';

interface AgentConnection {
  ws: WebSocket;
  deviceUid: string;
  connectedAt: Date;
  socketId: string; // UUID داخلي
}

// Map في الذاكرة: deviceUid → connection
const connections = new Map<string, AgentConnection>();

// Map للـ socket ID → deviceUid (للبحث العكسي)
const socketToDevice = new Map<string, string>();

// Dashboard connections
const dashboardConnections = new Set<WebSocket>();

export const ConnectionRegistry = {
  // ---- Agent Connections ----

  async registerAgent(deviceUid: string, ws: WebSocket, socketId: string): Promise<void> {
    const conn: AgentConnection = {
      ws,
      deviceUid,
      connectedAt: new Date(),
      socketId,
    };
    connections.set(deviceUid, conn);
    socketToDevice.set(socketId, deviceUid);

    // Redis optional – لا يوقف التسجيل إذا كان غائباً
    await safeRedis(async (redis) => {
      await redis.setex(
        RedisKeys.deviceOnline(deviceUid),
        config.heartbeatTtlSeconds,
        '1'
      );
      await redis.set(RedisKeys.deviceSocketId(deviceUid), socketId);
    });

    console.log(`[Registry] Agent registered: ${deviceUid} (total: ${connections.size})`);
  },

  async unregisterAgent(socketId: string): Promise<string | null> {
    const deviceUid = socketToDevice.get(socketId);
    if (!deviceUid) return null;

    connections.delete(deviceUid);
    socketToDevice.delete(socketId);

    await safeRedis(async (redis) => {
      await redis.del(RedisKeys.deviceOnline(deviceUid));
      await redis.del(RedisKeys.deviceSocketId(deviceUid));
    });

    console.log(`[Registry] Agent disconnected: ${deviceUid} (total: ${connections.size})`);
    return deviceUid;
  },

  getAgentSocket(deviceUid: string): WebSocket | null {
    return connections.get(deviceUid)?.ws ?? null;
  },

  isAgentOnline(deviceUid: string): boolean {
    const conn = connections.get(deviceUid);
    if (!conn) return false;
    return conn.ws.readyState === WebSocket.OPEN;
  },

  getOnlineDeviceUids(): string[] {
    return Array.from(connections.keys());
  },

  getConnectionInfo(deviceUid: string): Omit<AgentConnection, 'ws'> | null {
    const conn = connections.get(deviceUid);
    if (!conn) return null;
    const { ws, ...info } = conn;
    return info;
  },

  async refreshHeartbeatTtl(deviceUid: string): Promise<void> {
    await safeRedis(async (redis) => {
      await redis.expire(
        RedisKeys.deviceOnline(deviceUid),
        config.heartbeatTtlSeconds
      );
    });
  },

  // إرسال رسالة لجهاز معين
  sendToAgent(deviceUid: string, message: object): boolean {
    const conn = connections.get(deviceUid);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    try {
      conn.ws.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error(`[Registry] Failed to send to ${deviceUid}:`, err);
      return false;
    }
  },

  // ---- Dashboard Connections ----

  registerDashboard(ws: WebSocket): void {
    dashboardConnections.add(ws);
    console.log(`[Registry] Dashboard connected (total: ${dashboardConnections.size})`);
  },

  unregisterDashboard(ws: WebSocket): void {
    dashboardConnections.delete(ws);
    console.log(`[Registry] Dashboard disconnected (total: ${dashboardConnections.size})`);
  },

  // Broadcast حدث لجميع نوافذ الـ Dashboard
  broadcastToDashboards(event: object): void {
    const message = JSON.stringify(event);
    dashboardConnections.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
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
