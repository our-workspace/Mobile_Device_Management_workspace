// src/config/index.ts
import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  // publicHost: العنوان الذي يُرجعه السيرفر للـ Agent في wsUrl
  // يجب أن يكون IP الشبكة المحلية وليس localhost
  publicHost: process.env.PUBLIC_HOST || 'localhost',
  publicUrl: process.env.PUBLIC_URL || '',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/mdm_db',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6380',

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me-in-production-32chars',
  jwtDeviceExpiry: process.env.JWT_DEVICE_EXPIRY || '365d',
  jwtAdminExpiry: process.env.JWT_ADMIN_EXPIRY || '24h',

  // Enrollment
  enrollmentToken: process.env.ENROLLMENT_TOKEN || 'dev-enrollment-secret',

  // File Storage
  fileStoragePath: process.env.FILE_STORAGE_PATH || './uploads',
  fileStorageMode: (process.env.FILE_STORAGE_MODE || 'local') as 'local' | 's3',

  // S3 (optional)
  s3Bucket: process.env.S3_BUCKET,
  s3Region: process.env.S3_REGION || 'us-east-1',

  // Heartbeat
  heartbeatTtlSeconds: parseInt(process.env.HEARTBEAT_TTL_SECONDS || '90', 10),
  heartbeatIntervalSeconds: parseInt(process.env.HEARTBEAT_INTERVAL_SECONDS || '30', 10),

  // WebSocket paths
  wsAgentPath: '/ws/agent',
  wsDashboardPath: '/ws/dashboard',
} as const;

export type Config = typeof config;
