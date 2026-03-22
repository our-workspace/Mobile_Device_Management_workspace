"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
exports.generateAdminToken = generateAdminToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config");
async function requireAdmin(request, reply) {
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
        return;
    }
    const token = authHeader.slice(7);
    try {
        const payload = jsonwebtoken_1.default.verify(token, config_1.config.jwtSecret);
        request.admin = payload;
    }
    catch (err) {
        reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
    }
}
function generateAdminToken(adminId, username, role) {
    return jsonwebtoken_1.default.sign({ adminId, username, role }, config_1.config.jwtSecret, { expiresIn: config_1.config.jwtAdminExpiry });
}
//# sourceMappingURL=auth.middleware.js.map