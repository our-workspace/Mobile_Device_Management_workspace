"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
// src/db/prisma.ts
// Singleton Prisma Client
const client_1 = require("@prisma/client");
const config_1 = require("../config");
const globalForPrisma = globalThis;
exports.prisma = globalForPrisma.prisma ??
    new client_1.PrismaClient({
        log: config_1.config.isDev ? ['warn', 'error'] : ['error'],
    });
if (config_1.config.isDev) {
    globalForPrisma.prisma = exports.prisma;
}
exports.default = exports.prisma;
//# sourceMappingURL=prisma.js.map