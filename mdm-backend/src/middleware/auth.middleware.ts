// src/middleware/auth.middleware.ts
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';

interface AdminJwtPayload {
  adminId: string;
  username: string;
  role: string;
}

// تمديد FastifyRequest لإضافة user
declare module 'fastify' {
  interface FastifyRequest {
    admin?: AdminJwtPayload;
  }
}

export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwtSecret) as AdminJwtPayload;
    request.admin = payload;
  } catch (err) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

export function generateAdminToken(adminId: string, username: string, role: string): string {
  return jwt.sign(
    { adminId, username, role },
    config.jwtSecret,
    { expiresIn: config.jwtAdminExpiry as string }
  );
}
