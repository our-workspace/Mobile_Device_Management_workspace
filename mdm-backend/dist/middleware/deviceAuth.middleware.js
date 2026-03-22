"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireDevice = requireDevice;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
const prisma_1 = __importDefault(require("../db/prisma"));
const AuthService_1 = require("../services/AuthService");
async function requireDevice(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing Authorization header' });
        return;
    }
    const token = authHeader.slice(7);
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
    }
    catch {
        reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired device token' });
        return;
    }
    if (payload.type !== 'device') {
        reply.status(403).send({ error: 'FORBIDDEN', message: 'Token is not a device token' });
        return;
    }
    // التحقق من الجهاز في DB
    const device = await prisma_1.default.device.findUnique({ where: { deviceUid: payload.deviceUid } });
    if (!device) {
        reply.status(401).send({ error: 'DEVICE_NOT_FOUND', message: 'Device not registered' });
        return;
    }
    // التحقق من هاش التوكن
    const isValid = await AuthService_1.AuthService.verifyTokenHash(token, device.authTokenHash);
    if (!isValid) {
        reply.status(401).send({ error: 'TOKEN_MISMATCH', message: 'Token does not match stored hash' });
        return;
    }
    request.deviceUid = payload.deviceUid;
}
//# sourceMappingURL=deviceAuth.middleware.js.map