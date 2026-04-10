// src/db/prisma.ts
// Singleton Prisma Client
import { PrismaClient } from '@prisma/client';
import { config } from '../config';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: config.isDev ? ['warn', 'error'] : ['error'],
  });

if (config.isDev) {
  globalForPrisma.prisma = prisma;
}

export default prisma;
