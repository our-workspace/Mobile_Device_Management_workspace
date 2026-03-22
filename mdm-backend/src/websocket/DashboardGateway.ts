// src/websocket/DashboardGateway.ts
// =====================================================================
// يدير اتصالات WebSocket مع الـ Dashboard (real-time updates)
// =====================================================================
import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { ConnectionRegistry } from './ConnectionRegistry';
import { config } from '../config';

export function createDashboardGateway(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    // استخراج التوكن من URL: /ws/dashboard?token=xxx
    const url = new URL(req.url || '', `http://localhost`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    try {
      jwt.verify(token, config.jwtSecret);
    } catch {
      ws.close(4003, 'Invalid token');
      return;
    }

    ConnectionRegistry.registerDashboard(ws);

    // إرسال حالة أولية
    ws.send(JSON.stringify({
      event: 'connected',
      timestamp: new Date().toISOString(),
      stats: ConnectionRegistry.getStats(),
    }));

    ws.on('close', () => {
      ConnectionRegistry.unregisterDashboard(ws);
    });

    ws.on('error', (err) => {
      console.error('[DashboardGW] Error:', err.message);
      ConnectionRegistry.unregisterDashboard(ws);
    });

    // الـ Dashboard لا يرسل أوامر مباشرة عبر WebSocket؛
    // الأوامر تُرسل عبر REST API
    ws.on('message', (data) => {
      // في المستقبل: يمكن إضافة ping/pong أو subscription للأجهزة
    });
  });

  console.log('[DashboardGW] Dashboard WebSocket Gateway initialized');
}
