// src/index.ts
// =====================================================================
// MDM Backend – Entry Point
// =====================================================================
import Fastify from 'fastify';
import cors from '@fastify/cors';

// حل مشكلة BigInt في JSON.stringify
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};
import multipart from '@fastify/multipart';
import { WebSocketServer } from 'ws';
import fs from 'fs';
import path from 'path';

import { config } from './config';
import prisma from './db/prisma';
import { getRedis } from './db/redis';
import { AuthService } from './services/AuthService';

import { createAgentGateway } from './websocket/AgentGateway';
import { createDashboardGateway } from './websocket/DashboardGateway';

import { authRoutes } from './api/auth.routes';
import { statusRoutes } from './api/status.routes';
import { devicesRoutes } from './api/devices.routes';
import { commandsRoutes } from './api/commands.routes';

async function bootstrap(): Promise<void> {
  // ---- Fastify ----
  const app = Fastify({
    logger: {
      level: config.isDev ? 'info' : 'warn',
      transport: config.isDev
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
  });

  // ---- Plugins ----
  await app.register(cors, {
    origin: config.isDev ? '*' : ['https://mdm.company.com'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  });

  await app.register(multipart, {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  });

  // ---- API Routes ----
  await app.register(statusRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(devicesRoutes, { prefix: '/api/v1/devices' });
  await app.register(commandsRoutes, { prefix: '/api/v1' });

  // ---- تأكد من وجود مجلد الرفع ----
  const uploadDir = path.resolve(config.fileStoragePath);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`[Server] Created upload directory: ${uploadDir}`);
  }

  // ---- Start HTTP Server ----
  await app.listen({ port: config.port, host: config.host });
  console.log(`[Server] HTTP listening on http://${config.host}:${config.port}`);

  // ---- WebSocket Servers (attached manually to HTTP server) ----
  const agentWss = new WebSocketServer({ noServer: true });
  createAgentGateway(agentWss);
  console.log(`[Server] Agent WS at ws://localhost:${config.port}${config.wsAgentPath}`);

  const dashboardWss = new WebSocketServer({ noServer: true });
  createDashboardGateway(dashboardWss);
  console.log(`[Server] Dashboard WS at ws://localhost:${config.port}${config.wsDashboardPath}`);

  // حل تعارض Fastify مع ws upgrade
  app.server.removeAllListeners('upgrade');
  app.server.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith(config.wsAgentPath)) {
      agentWss.handleUpgrade(request, socket, head, (ws) => {
        agentWss.emit('connection', ws, request);
      });
    } else if (url.startsWith(config.wsDashboardPath)) {
      dashboardWss.handleUpgrade(request, socket, head, (ws) => {
        dashboardWss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // ---- Seed Dev Admin ----
  if (config.isDev) {
    await AuthService.seedDefaultAdmin();
  }

  // ---- Graceful Shutdown ----
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] ${signal} received. Shutting down...`);
    await app.close();
    await prisma.$disconnect();
    const redis = getRedis();
    await redis.quit();
    console.log('[Server] Graceful shutdown complete.');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[Server] Fatal error during startup:', err);
  process.exit(1);
});
