"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
// src/services/AuthService.ts
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const uuid_1 = require("uuid");
const prisma_1 = __importDefault(require("../db/prisma"));
const config_1 = require("../config");
exports.AuthService = {
    // ---- Admin Auth ----
    async login(username, password) {
        const admin = await prisma_1.default.admin.findUnique({
            where: { username },
        });
        if (!admin || !admin.isActive) {
            throw new Error('INVALID_CREDENTIALS');
        }
        const isValid = await bcryptjs_1.default.compare(password, admin.passwordHash);
        if (!isValid) {
            throw new Error('INVALID_CREDENTIALS');
        }
        await prisma_1.default.admin.update({
            where: { id: admin.id },
            data: { lastLoginAt: new Date() },
        });
        return {
            admin: {
                id: admin.id,
                username: admin.username,
                email: admin.email,
                role: admin.role,
            },
        };
    },
    // ---- Device Auth ----
    generateDeviceUid() {
        return `dev_${(0, uuid_1.v4)().replace(/-/g, '').substring(0, 12)}`;
    },
    generateCommandId() {
        return `cmd_${(0, uuid_1.v4)().replace(/-/g, '').substring(0, 12)}`;
    },
    async hashToken(token) {
        return bcryptjs_1.default.hash(token, 10);
    },
    async verifyTokenHash(token, hash) {
        return bcryptjs_1.default.compare(token, hash);
    },
    // التحقق من enrollment token
    validateEnrollmentToken(token) {
        return token === config_1.config.enrollmentToken;
    },
    // ---- Seed Admin (للتطوير) ----
    async seedDefaultAdmin() {
        const existing = await prisma_1.default.admin.findUnique({
            where: { username: 'admin' },
        });
        if (!existing) {
            const passwordHash = await bcryptjs_1.default.hash('admin123', 10);
            await prisma_1.default.admin.create({
                data: {
                    username: 'admin',
                    email: 'admin@company.com',
                    passwordHash,
                    role: 'SUPER_ADMIN',
                },
            });
            console.log('[Auth] Default admin created: admin / admin123 — غيّر كلمة المرور فوراً!');
        }
    },
};
//# sourceMappingURL=AuthService.js.map