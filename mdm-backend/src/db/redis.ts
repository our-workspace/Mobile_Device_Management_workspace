// src/db/redis.ts
// Redis client singleton – with graceful fallback if Redis is unavailable
import Redis from 'ioredis';
import { config } from '../config';

let redisClient: Redis | null = null;
let redisAvailable = true;

export function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 1,          // ← خفّضنا من 3 إلى 1 لتقصير وقت الانتظار
      enableOfflineQueue: false,         // ← لا تراكم في queue عند الانقطاع
      retryStrategy(times) {
        if (times > 3) {
          redisAvailable = false;
          return null; // stop retrying
        }
        return Math.min(times * 500, 3000);
      },
      lazyConnect: true,
    });

    redisClient.on('connect', () => {
      redisAvailable = true;
      console.log('[Redis] Connected ✅');
    });

    redisClient.on('error', (err) => {
      if (redisAvailable) {
        console.warn('[Redis] Unavailable – running in degraded mode (in-memory only):', err.message);
        redisAvailable = false;
      }
    });

    redisClient.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });
  }
  return redisClient;
}

/** هل Redis متصل حالياً؟ */
export function isRedisAvailable(): boolean {
  return redisAvailable && redisClient?.status === 'ready';
}

/**
 * تنفّذ العملية على Redis بأمان؛ إذا فشلت لا تكسر الطلب
 */
export async function safeRedis(fn: (redis: Redis) => Promise<void>): Promise<void> {
  if (!isRedisAvailable()) return;
  try {
    await fn(getRedis());
  } catch (err) {
    console.warn('[Redis] Operation failed (ignored):', (err as Error).message);
  }
}

// Redis key helpers
export const RedisKeys = {
  // إذا كان الجهاز أونلاين (TTL = heartbeatTtlSeconds)
  deviceOnline: (deviceUid: string) => `device:online:${deviceUid}`,

  // معرف اتصال داخلي (لتمييز الاتصالات في multi-instance مستقبلاً)
  deviceSocketId: (deviceUid: string) => `device:socket:${deviceUid}`,

  // أوامر معلّقة (قائمة IDs)
  devicePendingCmds: (deviceUid: string) => `device:pending_cmds:${deviceUid}`,

  // آخر heartbeat data (cached)
  deviceLastHeartbeat: (deviceUid: string) => `device:heartbeat:${deviceUid}`,
} as const;

export default getRedis;
