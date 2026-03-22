"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDashboardGateway = createDashboardGateway;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ConnectionRegistry_1 = require("./ConnectionRegistry");
const config_1 = require("../config");
function createDashboardGateway(wss) {
    wss.on('connection', (ws, req) => {
        // استخراج التوكن من URL: /ws/dashboard?token=xxx
        const url = new URL(req.url || '', `http://localhost`);
        const token = url.searchParams.get('token');
        if (!token) {
            ws.close(4001, 'Missing token');
            return;
        }
        try {
            jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        }
        catch {
            ws.close(4003, 'Invalid token');
            return;
        }
        ConnectionRegistry_1.ConnectionRegistry.registerDashboard(ws);
        // إرسال حالة أولية
        ws.send(JSON.stringify({
            event: 'connected',
            timestamp: new Date().toISOString(),
            stats: ConnectionRegistry_1.ConnectionRegistry.getStats(),
        }));
        ws.on('close', () => {
            ConnectionRegistry_1.ConnectionRegistry.unregisterDashboard(ws);
        });
        ws.on('error', (err) => {
            console.error('[DashboardGW] Error:', err.message);
            ConnectionRegistry_1.ConnectionRegistry.unregisterDashboard(ws);
        });
        // الـ Dashboard لا يرسل أوامر مباشرة عبر WebSocket؛
        // الأوامر تُرسل عبر REST API
        ws.on('message', (data) => {
            // في المستقبل: يمكن إضافة ping/pong أو subscription للأجهزة
        });
    });
    console.log('[DashboardGW] Dashboard WebSocket Gateway initialized');
}
//# sourceMappingURL=DashboardGateway.js.map