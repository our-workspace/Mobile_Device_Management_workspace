// src/services/AuthService.ts
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db/prisma';
import { config } from '../config';

export interface AdminLoginResult {
  admin: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

export const AuthService = {
  // ---- Admin Auth ----

  async login(username: string, password: string): Promise<AdminLoginResult> {
    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    if (!admin || !admin.isActive) {
      throw new Error('INVALID_CREDENTIALS');
    }

    const isValid = await bcrypt.compare(password, admin.passwordHash);
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS');
    }

    await prisma.admin.update({
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

  generateDeviceUid(): string {
    return `dev_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  },

  generateCommandId(): string {
    return `cmd_${uuidv4().replace(/-/g, '').substring(0, 12)}`;
  },

  async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, 10);
  },

  async verifyTokenHash(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  },

  // التحقق من enrollment token
  validateEnrollmentToken(token: string): boolean {
    return token === config.enrollmentToken;
  },

  // ---- Seed Admin (للتطوير) ----
  async seedDefaultAdmin(): Promise<void> {
    const existing = await prisma.admin.findUnique({
      where: { username: 'admin' },
    });

    if (!existing) {
      const passwordHash = await bcrypt.hash('admin123', 10);
      await prisma.admin.create({
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
