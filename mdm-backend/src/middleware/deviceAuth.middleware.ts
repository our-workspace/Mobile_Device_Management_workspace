// src/middleware/deviceAuth.middleware.ts
// يتحقق من توكن الجهاز (device JWT) في طلبات HTTP من الـ Agent
import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../db/prisma';
import { AuthService } from '../services/AuthService';

interface DeviceJwtPayload {
  deviceUid: string;
  type: string;
}

// تمديد FastifyRequest لإضافة deviceUid
declare module 'fastify' {
  interface FastifyRequest {
    deviceUid?: string;
  }
}

export async function requireDevice(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing Authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  let payload: DeviceJwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret) as DeviceJwtPayload;
  } catch {
    reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired device token' });
    return;
  }

  if (payload.type !== 'device') {
    reply.status(403).send({ error: 'FORBIDDEN', message: 'Token is not a device token' });
    return;
  }

  // التحقق من الجهاز في DB
  const device = await prisma.device.findUnique({ where: { deviceUid: payload.deviceUid } });
  if (!device) {
    reply.status(401).send({ error: 'DEVICE_NOT_FOUND', message: 'Device not registered' });
    return;
  }

  // التحقق من هاش التوكن
  const isValid = await AuthService.verifyTokenHash(token, device.authTokenHash);
  if (!isValid) {
    reply.status(401).send({ error: 'TOKEN_MISMATCH', message: 'Token does not match stored hash' });
    return;
  }

  request.deviceUid = payload.deviceUid;
}
