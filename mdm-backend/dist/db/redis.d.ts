import Redis from 'ioredis';
export declare function getRedis(): Redis;
/** هل Redis متصل حالياً؟ */
export declare function isRedisAvailable(): boolean;
/**
 * تنفّذ العملية على Redis بأمان؛ إذا فشلت لا تكسر الطلب
 */
export declare function safeRedis(fn: (redis: Redis) => Promise<void>): Promise<void>;
export declare const RedisKeys: {
    readonly deviceOnline: (deviceUid: string) => string;
    readonly deviceSocketId: (deviceUid: string) => string;
    readonly devicePendingCmds: (deviceUid: string) => string;
    readonly deviceLastHeartbeat: (deviceUid: string) => string;
};
export default getRedis;
