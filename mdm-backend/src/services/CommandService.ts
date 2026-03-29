// src/services/CommandService.ts
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db/prisma';
import { ConnectionRegistry } from '../websocket/ConnectionRegistry';
import { safeRedis, RedisKeys } from '../db/redis';
import type { CommandType, CommandMessage } from '../types/messages';
import type { CommandStatus } from '@prisma/client';

export interface CreateCommandOptions {
  deviceUid: string;
  commandType: CommandType;
  params?: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
  timeoutSeconds?: number;
  adminId?: string;
}

export const CommandService = {
  async createAndDispatch(options: CreateCommandOptions): Promise<{
    commandId: string;
    status: CommandStatus;
    dispatched: boolean;
  }> {
    const {
      deviceUid,
      commandType,
      params = {},
      priority = 'normal',
      timeoutSeconds = 120,
      adminId,
    } = options;

    // التحقق من وجود الجهاز
    const device = await prisma.device.findUnique({ where: { deviceUid } });
    if (!device) throw new Error('DEVICE_NOT_FOUND');

    const commandId = `cmd_${uuidv4().replace(/-/g, '').substring(0, 12)}`;

    // إنشاء أمر في قاعدة البيانات
    await prisma.command.create({
      data: {
        commandId,
        deviceId: device.id,
        adminId: adminId ?? null,
        commandType,
        params: params as any,
        priority,
        timeoutSeconds,
        status: 'PENDING',
      },
    });

    // محاولة إرسال الأمر فوراً إذا الجهاز متصل (in-memory check)
    const isOnline = ConnectionRegistry.isAgentOnline(deviceUid);

    if (isOnline) {
      const message: CommandMessage = {
        type: 'command',
        msgId: uuidv4(),
        timestamp: new Date().toISOString(),
        payload: {
          commandId,
          commandType,
          priority,
          timeoutSeconds,
          params,
        },
      };

      const sent = ConnectionRegistry.sendToAgent(deviceUid, message);
      if (sent) {
        await prisma.command.update({
          where: { commandId },
          data: { status: 'SENT' },
        });

        console.log(`[CommandService] Dispatched ${commandId} to ${deviceUid}`);
        return { commandId, status: 'SENT', dispatched: true };
      }
    }

    // الجهاز offline → وضع في قائمة الانتظار
    await prisma.command.update({
      where: { commandId },
      data: { status: 'QUEUED' },
    });

    // حفظ في Redis إذا كان متاحاً (اختياري)
    await safeRedis(async (redis) => {
      await redis.rpush(RedisKeys.devicePendingCmds(deviceUid), commandId);
    });

    console.log(`[CommandService] Queued ${commandId} for offline device ${deviceUid}`);
    return { commandId, status: 'QUEUED', dispatched: false };
  },

  // استرجاع الأوامر المعلّقة لجهاز (يُستخدم عند agent_hello)
  async getPendingCommandsForDevice(deviceUid: string) {
    const device = await prisma.device.findUnique({ where: { deviceUid } });
    if (!device) return [];

    const commands = await prisma.command.findMany({
      where: {
        deviceId: device.id,
        status: { in: ['QUEUED', 'PENDING'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    return commands.map((cmd) => ({
      commandId: cmd.commandId,
      commandType: cmd.commandType as CommandType,
      priority: cmd.priority as 'low' | 'normal' | 'high',
      timeoutSeconds: cmd.timeoutSeconds,
      params: cmd.params as Record<string, unknown>,
    }));
  },

  // تحديث حالة الأمر عند استلام command_ack
  async markAcknowledged(commandId: string): Promise<void> {
    await prisma.command.update({
      where: { commandId },
      data: {
        status: 'IN_PROGRESS',
        acknowledgedAt: new Date(),
      },
    });
  },

  // تحديث الأمر عند استلام command_result
  async markCompleted(
    commandId: string,
    status: 'SUCCESS' | 'FAILURE',
    result?: Record<string, unknown>,
    errorCode?: string,
    errorMessage?: string
  ): Promise<void> {
    await prisma.command.update({
      where: { commandId },
      data: {
        status: status === 'SUCCESS' ? 'SUCCESS' : 'FAILURE',
        result: (result ?? undefined) as any,
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
        completedAt: new Date(),
      },
    });

    // إزالة من Redis queue إذا كان موجوداً (اختياري)
    const command = await prisma.command.findUnique({
      where: { commandId },
      include: { device: true },
    });
    if (command) {
      await safeRedis(async (redis) => {
        await redis.lrem(
          RedisKeys.devicePendingCmds(command.device.deviceUid),
          1,
          commandId
        );
      });
    }
  },

  // جلب سجل الأوامر لجهاز معين
  async getCommandHistory(deviceUid: string, limit = 20) {
    const device = await prisma.device.findUnique({ where: { deviceUid } });
    if (!device) return [];

    return prisma.command.findMany({
      where: { deviceId: device.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        commandId: true,
        commandType: true,
        status: true,
        priority: true,
        params: true,
        result: true,
        errorCode: true,
        errorMessage: true,
        createdAt: true,
        acknowledgedAt: true,
        completedAt: true,
        admin: {
          select: { username: true },
        },
      },
    });
  },

  // جلب الأوامر في الـ audit log (كل الأجهزة)
  async getRecentCommands(limit = 50) {
    return prisma.command.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        device: {
          select: { deviceUid: true, model: true },
        },
        admin: {
          select: { username: true },
        },
      },
    });
  },
};
