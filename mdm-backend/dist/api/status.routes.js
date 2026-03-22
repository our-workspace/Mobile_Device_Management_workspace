"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusRoutes = statusRoutes;
const auth_middleware_1 = require("../middleware/auth.middleware");
const ConnectionRegistry_1 = require("../websocket/ConnectionRegistry");
const prisma_1 = __importDefault(require("../db/prisma"));
const redis_1 = require("../db/redis");
async function statusRoutes(app) {
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
    app.get('/status', { preHandler: auth_middleware_1.requireAdmin }, async (request, reply) => {
        const checks = await runHealthChecks();
        const wsStats = ConnectionRegistry_1.ConnectionRegistry.getStats();
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
async function runHealthChecks() {
    return Promise.all([
        checkDatabase(),
        checkRedis(),
    ]);
}
async function checkDatabase() {
    const start = Date.now();
    try {
        await prisma_1.default.$queryRaw `SELECT 1`;
        return { name: 'postgresql', ok: true, latencyMs: Date.now() - start };
    }
    catch (err) {
        return { name: 'postgresql', ok: false, error: err.message };
    }
}
async function checkRedis() {
    const start = Date.now();
    try {
        const redis = (0, redis_1.getRedis)();
        await redis.ping();
        return { name: 'redis', ok: true, latencyMs: Date.now() - start };
    }
    catch (err) {
        return { name: 'redis', ok: false, error: err.message };
    }
}
// ---- Helpers ----
function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0)
        parts.push(`${d}d`);
    if (h > 0)
        parts.push(`${h}h`);
    if (m > 0)
        parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}
//# sourceMappingURL=status.routes.js.map