"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
// =====================================================================
// MDM Backend – Entry Point
// =====================================================================
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const ws_1 = require("ws");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const prisma_1 = __importDefault(require("./db/prisma"));
const redis_1 = require("./db/redis");
const AuthService_1 = require("./services/AuthService");
const AgentGateway_1 = require("./websocket/AgentGateway");
const DashboardGateway_1 = require("./websocket/DashboardGateway");
const auth_routes_1 = require("./api/auth.routes");
const status_routes_1 = require("./api/status.routes");
const devices_routes_1 = require("./api/devices.routes");
const commands_routes_1 = require("./api/commands.routes");
async function bootstrap() {
    // ---- Fastify ----
    const app = (0, fastify_1.default)({
        logger: {
            level: config_1.config.isDev ? 'info' : 'warn',
            transport: config_1.config.isDev
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined,
        },
    });
    // ---- Plugins ----
    await app.register(cors_1.default, {
        origin: config_1.config.isDev ? '*' : ['https://mdm.company.com'],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    });
    await app.register(multipart_1.default, {
        limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    });
    // ---- API Routes ----
    await app.register(status_routes_1.statusRoutes, { prefix: '/api/v1' });
    await app.register(auth_routes_1.authRoutes, { prefix: '/api/v1/auth' });
    await app.register(devices_routes_1.devicesRoutes, { prefix: '/api/v1/devices' });
    await app.register(commands_routes_1.commandsRoutes, { prefix: '/api/v1' });
    // ---- تأكد من وجود مجلد الرفع ----
    const uploadDir = path_1.default.resolve(config_1.config.fileStoragePath);
    if (!fs_1.default.existsSync(uploadDir)) {
        fs_1.default.mkdirSync(uploadDir, { recursive: true });
        console.log(`[Server] Created upload directory: ${uploadDir}`);
    }
    // ---- Start HTTP Server ----
    await app.listen({ port: config_1.config.port, host: config_1.config.host });
    console.log(`[Server] HTTP listening on http://${config_1.config.host}:${config_1.config.port}`);
    // ---- WebSocket Servers (attached manually to HTTP server) ----
    const agentWss = new ws_1.WebSocketServer({ noServer: true });
    (0, AgentGateway_1.createAgentGateway)(agentWss);
    console.log(`[Server] Agent WS at ws://localhost:${config_1.config.port}${config_1.config.wsAgentPath}`);
    const dashboardWss = new ws_1.WebSocketServer({ noServer: true });
    (0, DashboardGateway_1.createDashboardGateway)(dashboardWss);
    console.log(`[Server] Dashboard WS at ws://localhost:${config_1.config.port}${config_1.config.wsDashboardPath}`);
    // حل تعارض Fastify مع ws upgrade
    app.server.removeAllListeners('upgrade');
    app.server.on('upgrade', (request, socket, head) => {
        const url = request.url || '';
        if (url.startsWith(config_1.config.wsAgentPath)) {
            agentWss.handleUpgrade(request, socket, head, (ws) => {
                agentWss.emit('connection', ws, request);
            });
        }
        else if (url.startsWith(config_1.config.wsDashboardPath)) {
            dashboardWss.handleUpgrade(request, socket, head, (ws) => {
                dashboardWss.emit('connection', ws, request);
            });
        }
        else {
            socket.destroy();
        }
    });
    // ---- Seed Dev Admin ----
    if (config_1.config.isDev) {
        await AuthService_1.AuthService.seedDefaultAdmin();
    }
    // ---- Graceful Shutdown ----
    const shutdown = async (signal) => {
        console.log(`\n[Server] ${signal} received. Shutting down...`);
        await app.close();
        await prisma_1.default.$disconnect();
        const redis = (0, redis_1.getRedis)();
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
//# sourceMappingURL=index.js.map