// src/services/DeviceService.ts
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import prisma from '../db/prisma';
import { AuthService } from './AuthService';
import { ConnectionRegistry } from '../websocket/ConnectionRegistry';
import { config } from '../config';
import type { RegisterDeviceRequest, RegisterDeviceResponse } from '../types/messages';
import type { Device } from '@prisma/client';

export const DeviceService = {
  // ---- Registration ----

  async registerDevice(data: RegisterDeviceRequest): Promise<RegisterDeviceResponse> {
    // التحقق من enrollment token
    if (!AuthService.validateEnrollmentToken(data.enrollmentToken)) {
      throw new Error('INVALID_ENROLLMENT_TOKEN');
    }

    // هل الجهاز مسجّل مسبقاً؟
    const existing = await prisma.device.findUnique({
      where: { androidId: data.androidId },
    });

    if (existing) {
      // إعادة إصدار توكن جديد للجهاز المعاد تسجيله
      const authToken = DeviceService._generateDeviceJwt(existing.deviceUid);
      const tokenHash = await AuthService.hashToken(authToken);

      await prisma.device.update({
        where: { id: existing.id },
        data: {
          agentVersion: data.agentVersion,
          androidVersion: data.androidVersion,
          sdkVersion: data.sdkVersion,
          authTokenHash: tokenHash,
          lastSeenAt: new Date(),
        },
      });

      console.log(`[DeviceService] Re-registered device: ${existing.deviceUid}`);
      return {
        deviceUid: existing.deviceUid,
        authToken,
        wsUrl: config.publicUrl 
          ? `${config.publicUrl}${config.wsAgentPath}`
          : `${config.isDev ? 'ws' : 'wss'}://${config.publicHost}:${config.port}${config.wsAgentPath}`,
        heartbeatIntervalSeconds: config.heartbeatIntervalSeconds,
      };
    }

    // جهاز جديد
    const deviceUid = AuthService.generateDeviceUid();
    const authToken = DeviceService._generateDeviceJwt(deviceUid);
    const tokenHash = await AuthService.hashToken(authToken);

    await prisma.device.create({
      data: {
        deviceUid,
        androidId: data.androidId,
        serialNumber: data.serialNumber,
        model: data.model,
        manufacturer: data.manufacturer,
        androidVersion: data.androidVersion,
        sdkVersion: data.sdkVersion,
        agentVersion: data.agentVersion,
        authTokenHash: tokenHash,
      },
    });

    console.log(`[DeviceService] New device registered: ${deviceUid}`);
    return {
      deviceUid,
      authToken,
      wsUrl: config.publicUrl 
        ? `${config.publicUrl}${config.wsAgentPath}`
        : `${config.isDev ? 'ws' : 'wss'}://${config.publicHost}:${config.port}${config.wsAgentPath}`,
      heartbeatIntervalSeconds: config.heartbeatIntervalSeconds,
    };
  },

  // ---- Token Verification (للـ WebSocket) ----

  async verifyDeviceToken(authToken: string): Promise<{ deviceUid: string; device: Device }> {
    let payload: { deviceUid: string };
    try {
      payload = jwt.verify(authToken, config.jwtSecret) as { deviceUid: string };
    } catch {
      throw new Error('INVALID_TOKEN');
    }

    const device = await prisma.device.findUnique({
      where: { deviceUid: payload.deviceUid },
    });

    if (!device) {
      throw new Error('DEVICE_NOT_FOUND');
    }

    // التحقق من هاش التوكن
    const isValid = await AuthService.verifyTokenHash(authToken, device.authTokenHash);
    if (!isValid) {
      throw new Error('TOKEN_MISMATCH');
    }

    return { deviceUid: payload.deviceUid, device };
  },

  // ---- Queries ----

  async getAllDevices() {
    const devices = await prisma.device.findMany({
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceUid: true,
        model: true,
        manufacturer: true,
        androidVersion: true,
        agentVersion: true,
        serialNumber: true,
        enrolledAt: true,
        lastSeenAt: true,
      },
    });

    // إضافة حالة الاتصال الحية
    return devices.map((device) => ({
      ...device,
      isOnline: ConnectionRegistry.isAgentOnline(device.deviceUid),
    }));
  },

  async getDeviceByUid(deviceUid: string) {
    const device = await prisma.device.findUnique({
      where: { deviceUid },
      include: {
        commands: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        backupFiles: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!device) return null;

    return {
      ...device,
      isOnline: ConnectionRegistry.isAgentOnline(deviceUid),
      authTokenHash: undefined, // لا نُرجع الهاش للـ API
    };
  },

  async updateLastSeen(deviceUid: string): Promise<void> {
    await prisma.device.update({
      where: { deviceUid },
      data: { lastSeenAt: new Date() },
    });
  },

  async saveHeartbeat(deviceUid: string, heartbeatData: {
    batteryLevel: number;
    isCharging: boolean;
    chargingType: string | null;
    networkType: string;
    isConnected: boolean;
    wifiSignalLevel: number | null;
    mobileNetType: string | null;
    storageFreeBytes: bigint;
    storageTotalBytes: bigint;
    usedPercent: number;
    deviceUptimeMs?: bigint;
    agentUptimeMs?: bigint;
  }): Promise<void> {
    const device = await prisma.device.findUnique({ where: { deviceUid } });
    if (!device) return;

    await prisma.heartbeat.create({
      data: {
        deviceId: device.id,
        ...heartbeatData,
      },
    });

    // تحديث lastSeenAt
    await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });
  },

  // ---- Internal ----

  _generateDeviceJwt(deviceUid: string): string {
    return jwt.sign(
      { deviceUid, type: 'device' },
      config.jwtSecret,
      { expiresIn: config.jwtDeviceExpiry as jwt.SignOptions['expiresIn'] }
    );
  },
};
