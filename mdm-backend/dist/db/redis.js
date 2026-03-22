"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisKeys = void 0;
exports.getRedis = getRedis;
exports.isRedisAvailable = isRedisAvailable;
exports.safeRedis = safeRedis;
// src/db/redis.ts
// Redis client singleton – with graceful fallback if Redis is unavailable
const ioredis_1 = __importDefault(require("ioredis"));
const config_1 = require("../config");
let redisClient = null;
let redisAvailable = true;
function getRedis() {
    if (!redisClient) {
        redisClient = new ioredis_1.default(config_1.config.redisUrl, {
            maxRetriesPerRequest: 1, // ← خفّضنا من 3 إلى 1 لتقصير وقت الانتظار
            enableOfflineQueue: false, // ← لا تراكم في queue عند الانقطاع
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
function isRedisAvailable() {
    return redisAvailable && redisClient?.status === 'ready';
}
/**
 * تنفّذ العملية على Redis بأمان؛ إذا فشلت لا تكسر الطلب
 */
async function safeRedis(fn) {
    if (!isRedisAvailable())
        return;
    try {
        await fn(getRedis());
    }
    catch (err) {
        console.warn('[Redis] Operation failed (ignored):', err.message);
    }
}
// Redis key helpers
exports.RedisKeys = {
    // إذا كان الجهاز أونلاين (TTL = heartbeatTtlSeconds)
    deviceOnline: (deviceUid) => `device:online:${deviceUid}`,
    // معرف اتصال داخلي (لتمييز الاتصالات في multi-instance مستقبلاً)
    deviceSocketId: (deviceUid) => `device:socket:${deviceUid}`,
    // أوامر معلّقة (قائمة IDs)
    devicePendingCmds: (deviceUid) => `device:pending_cmds:${deviceUid}`,
    // آخر heartbeat data (cached)
    deviceLastHeartbeat: (deviceUid) => `device:heartbeat:${deviceUid}`,
};
exports.default = getRedis;
//# sourceMappingURL=redis.js.map