// src/api/status.routes.ts
import { FastifyInstance } from 'fastify';
import { requireAdmin } from '../middleware/auth.middleware';
import { ConnectionRegistry } from '../websocket/ConnectionRegistry';
import prisma from '../db/prisma';
import { getRedis } from '../db/redis';

export async function statusRoutes(app: FastifyInstance): Promise<void> {

  // -------------------------------------------------------
  // GET /health  (عام، بدون مصادقة – للـ load balancer/uptime monitor)
  // -------------------------------------------------------
  app.get('/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });
  });

  // -------------------------------------------------------
  // GET /api/v1/status  (يحتاج admin token – معلومات شاملة)
  // -------------------------------------------------------
  app.get('/status', { preHandler: requireAdmin }, async (request, reply) => {
    const checks = await runHealthChecks();
    const wsStats = ConnectionRegistry.getStats();

    const overallStatus = checks.every((c) => c.ok) ? 'healthy' : 'degraded';

    return reply.status(overallStatus === 'healthy' ? 200 : 207).send({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.floor(process.uptime()),
        human: formatUptime(process.uptime()),
      },
      server: {
        nodeVersion: process.version,
        env: process.env.NODE_ENV ?? 'unknown',
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      connections: {
        agentsOnline: wsStats.agentsOnline,
        dashboardsConnected: wsStats.dashboardsConnected,
      },
      checks,
    });
  });
}

// ---- Health Checks ----

async function runHealthChecks(): Promise<Array<{ name: string; ok: boolean; latencyMs?: number; error?: string }>> {
  return Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);
}

async function checkDatabase() {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: 'postgresql', ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'postgresql', ok: false, error: (err as Error).message };
  }
}

async function checkRedis() {
  const start = Date.now();
  try {
    const redis = getRedis();
    await redis.ping();
    return { name: 'redis', ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { name: 'redis', ok: false, error: (err as Error).message };
  }
}

// ---- Helpers ----

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}
