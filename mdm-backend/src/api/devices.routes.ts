// src/api/devices.routes.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DeviceService } from '../services/DeviceService';
import { requireAdmin } from '../middleware/auth.middleware';
import { requireDevice } from '../middleware/deviceAuth.middleware';
import { ConnectionRegistry } from '../websocket/ConnectionRegistry';
import { config } from '../config';
import prisma from '../db/prisma';
import fs from 'fs';
import path from 'path';

const RegisterSchema = z.object({
  androidId: z.string().min(1),
  serialNumber: z.string().optional(),
  model: z.string().min(1),
  manufacturer: z.string().min(1),
  androidVersion: z.string().min(1),
  sdkVersion: z.number().int(),
  agentVersion: z.string().min(1),
  enrollmentToken: z.string().min(1),
});

export async function devicesRoutes(app: FastifyInstance): Promise<void> {
  // -----------------------------------------------------------
  // POST /api/v1/devices/register  (لا تحتاج admin auth)
  // -----------------------------------------------------------
  app.post('/register', async (request, reply) => {
    const parseResult = RegisterSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'VALIDATION_ERROR', details: parseResult.error.errors });
    }

    try {
      const result = await DeviceService.registerDevice(parseResult.data);
      return reply.status(201).send(result);
    } catch (err) {
      const error = err as Error;
      if (error.message === 'INVALID_ENROLLMENT_TOKEN') {
        return reply.status(403).send({ error: 'INVALID_ENROLLMENT_TOKEN', message: 'Enrollment token is invalid' });
      }
      throw err;
    }
  });

  // -----------------------------------------------------------
  // GET /api/v1/devices  (admin required)
  // -----------------------------------------------------------
  app.get('/', { preHandler: requireAdmin }, async (request, reply) => {
    const devices = await DeviceService.getAllDevices();
    return reply.send({ devices, total: devices.length });
  });

  // -----------------------------------------------------------
  // GET /api/v1/devices/:deviceUid  (admin required)
  // -----------------------------------------------------------
  app.get<{ Params: { deviceUid: string } }>(
    '/:deviceUid',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { deviceUid } = request.params;
      const device = await DeviceService.getDeviceByUid(deviceUid);

      if (!device) {
        return reply.status(404).send({ error: 'DEVICE_NOT_FOUND', message: `Device ${deviceUid} not found` });
      }

      return reply.send({ device });
    }
  );

  // -----------------------------------------------------------
  // GET /api/v1/devices/stats  (admin required)
  // -----------------------------------------------------------
  app.get('/stats', { preHandler: requireAdmin }, async (request, reply) => {
    const allDevices = await DeviceService.getAllDevices();
    const onlineCount = allDevices.filter((d) => d.isOnline).length;

    return reply.send({
      total: allDevices.length,
      online: onlineCount,
      offline: allDevices.length - onlineCount,
      wsStats: ConnectionRegistry.getStats(),
    });
  });

  // -----------------------------------------------------------
  // GET /api/v1/devices/:deviceUid/notifications  (admin required)
  // -----------------------------------------------------------
  app.get<{ Params: { deviceUid: string }; Querystring: { limit?: string } }>(
    '/:deviceUid/notifications',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { deviceUid } = request.params;
      const limit = parseInt(request.query.limit || '50', 10);

      const device = await DeviceService.getDeviceByUid(deviceUid);
      if (!device) {
        return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
      }

      const notifications = await prisma.notificationLog.findMany({
        where: { deviceId: device.id },
        orderBy: { postedAt: 'desc' },
        take: limit,
      });

      return reply.send({ notifications, total: notifications.length });
    }
  );

  // -----------------------------------------------------------
  // GET /api/v1/devices/:deviceUid/files  (admin required)
  // -----------------------------------------------------------
  app.get<{ Params: { deviceUid: string }; Querystring: { fileType?: string; limit?: string } }>(
    '/:deviceUid/files',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { deviceUid } = request.params;
      const limit = parseInt(request.query.limit || '20', 10);
      const fileType = request.query.fileType;

      const device = await DeviceService.getDeviceByUid(deviceUid);
      if (!device) {
        return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
      }

      const files = await prisma.backupFile.findMany({
        where: {
          deviceId: device.id,
          ...(fileType ? { fileType } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      return reply.send({ files, total: files.length });
    }
  );

  // -----------------------------------------------------------
  // POST /api/v1/devices/:deviceUid/files/upload-sms
  // يُستدعى من الـ Agent مباشرة (device auth)
  // -----------------------------------------------------------
  app.post<{ Params: { deviceUid: string } }>(
    '/:deviceUid/files/upload-sms',
    { preHandler: requireDevice },
    async (request, reply) => {
      const { deviceUid } = request.params;

      const body = request.body as {
        deviceUid: string;
        commandId?: string;
        fileType?: string;
        totalCount?: number;
        messages: any[];
      };

      if (!body || !Array.isArray(body.messages)) {
        return reply.status(400).send({ error: 'INVALID_BODY', message: 'messages array is required' });
      }

      // جلب الجهاز
      const device = await prisma.device.findUnique({ where: { deviceUid } });
      if (!device) {
        return reply.status(404).send({ error: 'DEVICE_NOT_FOUND' });
      }

      // إنشاء مجلد الحفظ
      const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 15);
      const fileName  = `sms_${timestamp}.json`;
      const dirPath   = path.resolve(config.fileStoragePath, 'backups', deviceUid);
      const filePath  = path.join(dirPath, fileName);
      const fileKey   = `backups/${deviceUid}/${fileName}`;

      fs.mkdirSync(dirPath, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify({
        exportedAt : new Date().toISOString(),
        deviceUid,
        commandId  : body.commandId,
        totalCount : body.messages.length,
        messages   : body.messages,
      }, null, 2), 'utf8');

      const fileSizeBytes = BigInt(fs.statSync(filePath).size);

      // حفظ السجل في DB
      await prisma.backupFile.create({
        data: {
          deviceId       : device.id,
          commandId      : body.commandId,
          fileType       : 'sms',
          fileKey,
          fileName,
          fileSizeBytes,
          recordCount    : body.messages.length,
          storageProvider: 'local',
          mimeType       : 'application/json',
        },
      });

      console.log(`[FilesRoute] SMS backup saved: ${fileKey} (${body.messages.length} messages)`);

      return reply.status(201).send({ fileKey, recordCount: body.messages.length });
    }
  );

  // -----------------------------------------------------------
  // GET /api/v1/devices/:deviceUid/files/:fileKey/download
  // تحميل ملف backup (admin only)
  // -----------------------------------------------------------
  app.get<{ Params: { deviceUid: string; '*': string } }>(
    '/:deviceUid/files/download/*',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { deviceUid } = request.params;
      const subPath = (request.params as any)['*'] as string;
      const filePath = path.resolve(config.fileStoragePath, 'backups', deviceUid, subPath);

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: 'FILE_NOT_FOUND' });
      }

      const stream = fs.createReadStream(filePath);
      reply.header('Content-Type', 'application/json');
      reply.header('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
      return reply.send(stream);
    }
  );
}


