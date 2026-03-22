// src/websocket/AgentGateway.ts
// =====================================================================
// يدير اتصالات WebSocket مع الـ Android Agents
// =====================================================================
import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { v4 as uuidv4 } from 'uuid';
import { ConnectionRegistry } from './ConnectionRegistry';
import { DeviceService } from '../services/DeviceService';
import { CommandService } from '../services/CommandService';
import { ConnectionRegistry as Registry } from './ConnectionRegistry';
import type {
  AgentMessage,
  AgentHelloMessage,
  HeartbeatMessage,
  CommandAckMessage,
  CommandResultMessage,
  NotificationEventMessage,
  AgentHelloAckMessage,
  HeartbeatAckMessage,
  CommandResultAckMessage,
  ErrorMessage,
} from '../types/messages';
import prisma from '../db/prisma';

export function createAgentGateway(wss: WebSocketServer): void {
  wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
    const socketId = uuidv4();
    let authenticatedDeviceUid: string | null = null;

    console.log(`[AgentGW] New connection attempt (socketId: ${socketId})`);

    // Timeout للمصادقة: 10 ثوانٍ
    const authTimeout = setTimeout(() => {
      if (!authenticatedDeviceUid) {
        console.warn(`[AgentGW] Auth timeout for socket ${socketId}`);
        sendError(ws, 'AUTH_TIMEOUT', 'Authentication required within 10 seconds');
        ws.close(4001, 'Auth timeout');
      }
    }, 10_000);

    ws.on('message', async (data: Buffer) => {
      console.log(`[AgentGW] Received raw data from ${socketId}:`, data.toString());
      let message: AgentMessage;

      try {
        message = JSON.parse(data.toString()) as AgentMessage;
      } catch {
        sendError(ws, 'INVALID_JSON', 'Message must be valid JSON');
        return;
      }

      try {
        await handleMessage(ws, socketId, message, authenticatedDeviceUid, (uid) => {
          authenticatedDeviceUid = uid;
          clearTimeout(authTimeout);
        });
      } catch (err) {
        const error = err as Error;
        console.error(`[AgentGW] Error handling message from ${authenticatedDeviceUid}:`, error.message);
        sendError(ws, 'INTERNAL_ERROR', error.message);
      }
    });

    ws.on('close', async (code, reason) => {
      clearTimeout(authTimeout);
      if (authenticatedDeviceUid) {
        await ConnectionRegistry.unregisterAgent(socketId);

        // إبلاغ الـ Dashboard بانقطاع الجهاز
        Registry.broadcastToDashboards({
          event: 'device_offline',
          deviceUid: authenticatedDeviceUid,
          timestamp: new Date().toISOString(),
        });

        console.log(`[AgentGW] ${authenticatedDeviceUid} disconnected (${code})`);
      }
    });

    ws.on('error', (err) => {
      console.error(`[AgentGW] WebSocket error for ${authenticatedDeviceUid}:`, err.message);
    });
  });

  console.log('[AgentGW] Agent WebSocket Gateway initialized');
}

async function handleMessage(
  ws: WebSocket,
  socketId: string,
  message: AgentMessage,
  currentDeviceUid: string | null,
  setAuthenticated: (uid: string) => void
): Promise<void> {
  // المصادقة مطلوبة لكل رسالة إلا agent_hello
  if (message.type !== 'agent_hello' && !currentDeviceUid) {
    sendError(ws, 'NOT_AUTHENTICATED', 'Send agent_hello first', message.msgId);
    return;
  }

  switch (message.type) {
    case 'agent_hello':
      await handleAgentHello(ws, socketId, message as AgentHelloMessage, setAuthenticated);
      break;

    case 'heartbeat':
      await handleHeartbeat(ws, message as HeartbeatMessage, currentDeviceUid!);
      break;

    case 'command_ack':
      await handleCommandAck(message as CommandAckMessage);
      break;

    case 'command_result':
      await handleCommandResult(ws, message as CommandResultMessage);
      break;

    case 'notification_event':
      await handleNotificationEvent(message as NotificationEventMessage);
      break;

    default:
      sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${(message as any).type}`);
  }
}

// ---- Handlers ----

async function handleAgentHello(
  ws: WebSocket,
  socketId: string,
  message: AgentHelloMessage,
  setAuthenticated: (uid: string) => void
): Promise<void> {
  const { deviceUid, authToken, lastKnownCommandId } = message.payload;

  // التحقق من التوكن
  try {
    await DeviceService.verifyDeviceToken(authToken);
  } catch (err) {
    const error = err as Error;
    sendError(ws, 'AUTH_FAILED', error.message, message.msgId);
    ws.close(4003, 'Authentication failed');
    return;
  }

  // تسجيل الاتصال
  await ConnectionRegistry.registerAgent(deviceUid, ws, socketId);
  setAuthenticated(deviceUid);

  // تحديث lastSeenAt
  await DeviceService.updateLastSeen(deviceUid);

  // جلب الأوامر المعلّقة
  const pendingCommands = await CommandService.getPendingCommandsForDevice(deviceUid);

  // الرد بـ hello_ack
  const ack: AgentHelloAckMessage = {
    type: 'agent_hello_ack',
    msgId: uuidv4(),
    timestamp: new Date().toISOString(),
    payload: {
      pendingCommands,
      heartbeatIntervalSeconds: 30,
    },
  };
  ws.send(JSON.stringify(ack));

  // إبلاغ الـ Dashboard
  Registry.broadcastToDashboards({
    event: 'device_online',
    deviceUid,
    timestamp: new Date().toISOString(),
  });

  console.log(`[AgentGW] ${deviceUid} authenticated. Pending commands: ${pendingCommands.length}`);
}

async function handleHeartbeat(
  ws: WebSocket,
  message: HeartbeatMessage,
  deviceUid: string
): Promise<void> {
  const { battery, network, storage, uptime } = message.payload;

  // تجديد TTL في Redis
  await ConnectionRegistry.refreshHeartbeatTtl(deviceUid);

  // حفظ في DB
  await DeviceService.saveHeartbeat(deviceUid, {
    batteryLevel: battery.level,
    isCharging: battery.isCharging,
    chargingType: battery.chargingType,
    networkType: network.type,
    isConnected: network.isConnected,
    wifiSignalLevel: network.wifiSignalLevel,
    mobileNetType: network.mobileNetworkType,
    storageFreeBytes: BigInt(storage.freeBytes),
    storageTotalBytes: BigInt(storage.totalBytes),
    usedPercent: storage.usedPercent,
    deviceUptimeMs: uptime?.deviceUptimeMs ? BigInt(uptime.deviceUptimeMs) : undefined,
    agentUptimeMs: uptime?.agentUptimeMs ? BigInt(uptime.agentUptimeMs) : undefined,
  });

  // إبلاغ الـ Dashboard بالـ heartbeat
  Registry.broadcastToDashboards({
    event: 'heartbeat',
    deviceUid,
    data: { battery, network, storage },
    timestamp: message.timestamp,
  });

  // الرد
  const ack: HeartbeatAckMessage = {
    type: 'heartbeat_ack',
    msgId: uuidv4(),
    timestamp: new Date().toISOString(),
    payload: { serverTime: new Date().toISOString() },
  };
  ws.send(JSON.stringify(ack));
}

async function handleCommandAck(message: CommandAckMessage): Promise<void> {
  const { commandId, status } = message.payload;
  await CommandService.markAcknowledged(commandId);
  console.log(`[AgentGW] Command ack: ${commandId} → ${status}`);
}

async function handleCommandResult(
  ws: WebSocket,
  message: CommandResultMessage
): Promise<void> {
  const { commandId, status, result, error, executionTimeMs } = message.payload;

  await CommandService.markCompleted(
    commandId,
    status === 'success' ? 'SUCCESS' : 'FAILURE',
    result,
    error?.code,
    error?.message
  );

  // الرد بـ result_ack
  const ack: CommandResultAckMessage = {
    type: 'command_result_ack',
    msgId: uuidv4(),
    timestamp: new Date().toISOString(),
    payload: { commandId, received: true },
  };
  ws.send(JSON.stringify(ack));

  // إبلاغ الـ Dashboard
  Registry.broadcastToDashboards({
    event: 'command_result',
    commandId,
    commandType: message.payload.commandType,
    status,
    result,
    error,
    executionTimeMs,
    timestamp: message.timestamp,
  });

  console.log(`[AgentGW] Command result: ${commandId} → ${status} (${executionTimeMs}ms)`);
}

async function handleNotificationEvent(message: NotificationEventMessage): Promise<void> {
  const { deviceUid, notifications } = message.payload;

  // جلب device id
  const device = await prisma.device.findUnique({ where: { deviceUid } });
  if (!device) return;

  // حفظ الإشعارات
  if (notifications.length > 0) {
    await prisma.notificationLog.createMany({
      data: notifications.map((n) => ({
        deviceId: device.id,
        packageName: n.packageName,
        appName: n.appName,
        title: n.title,
        text: n.text,
        category: n.category,
        postedAt: new Date(n.postedAt),
      })),
      skipDuplicates: true,
    });
  }

  // إبلاغ الـ Dashboard
  Registry.broadcastToDashboards({
    event: 'notifications',
    deviceUid,
    notifications,
    timestamp: message.timestamp,
  });
}

// ---- Helpers ----

function sendError(
  ws: WebSocket,
  code: string,
  messageText: string,
  relatedMsgId?: string
): void {
  const error: ErrorMessage = {
    type: 'error',
    msgId: uuidv4(),
    timestamp: new Date().toISOString(),
    payload: { code, message: messageText, relatedMsgId },
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(error));
  }
}
