// src/db/db.ts
// Compatibility layer replacing Prisma Client with raw SQL
import { query, withTransaction } from './postgres';
import { QueryResult } from 'pg';

// Type definitions matching Prisma schema
type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
type CommandStatus = 'PENDING' | 'QUEUED' | 'SENT' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE' | 'CANCELLED';
type Priority = 'low' | 'normal' | 'high';
type Role = 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';
type FileType = 'sms' | 'contacts' | 'files';
type StorageProvider = 'local' | 's3';

export interface Device {
  id: string;
  deviceUid: string;
  androidId: string;
  serialNumber: string | null;
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkVersion: number;
  agentVersion: string;
  authTokenHash: string;
  enrolledAt: Date;
  lastSeenAt: Date | null;
  status: DeviceStatus;
}

export interface Admin {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: Role;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface Command {
  id: string;
  commandId: string;
  deviceId: string;
  adminId: string | null;
  commandType: string;
  params: any;
  priority: Priority;
  timeoutSeconds: number;
  status: CommandStatus;
  acknowledgedAt: Date | null;
  completedAt: Date | null;
  result: any;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: Date;
  device?: Device;
  admin?: Admin;
}

export interface Heartbeat {
  id: string;
  deviceId: string;
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
  deviceUptimeMs: bigint | null;
  agentUptimeMs: bigint | null;
  recordedAt: Date;
}

export interface BackupFile {
  id: string;
  deviceId: string;
  commandId: string | null;
  fileType: FileType;
  fileKey: string;
  fileName: string;
  fileSizeBytes: bigint;
  recordCount: number | null;
  storageProvider: StorageProvider;
  mimeType: string;
  createdAt: Date;
}

export interface NotificationLog {
  id: string;
  deviceId: string;
  packageName: string;
  appName: string;
  title: string | null;
  text: string | null;
  category: string | null;
  postedAt: Date;
  receivedAt: Date;
}

// Helper to convert snake_case DB columns to camelCase objects
function snakeToCamel(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(snakeToCamel);
  
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = snakeToCamel(value);
  }
  return result;
}

// Helper to convert camelCase to snake_case for SQL
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Build WHERE clause from filter object
function buildWhereClause(filter: Record<string, any>, startIndex = 1): { clause: string; values: any[] } {
  const conditions: string[] = [];
  const values: any[] = [];
  let index = startIndex;
  
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined || value === null) continue;
    const column = camelToSnake(key);
    
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Handle operators like { in: [...] }, { not: null }, etc.
      if (value.in && Array.isArray(value.in)) {
        const placeholders = value.in.map(() => `$${index++}`).join(',');
        conditions.push(`${column} IN (${placeholders})`);
        values.push(...value.in);
      } else if (value.not === null) {
        conditions.push(`${column} IS NOT NULL`);
      }
    } else {
      conditions.push(`${column} = $${index++}`);
      values.push(value);
    }
  }
  
  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

// Database operations object (Prisma-compatible API)
export const db = {
  // Device operations
  device: {
    async findUnique({ where }: { where: Partial<Device> }): Promise<Device | null> {
      const { clause, values } = buildWhereClause(where);
      const result = await query<Device>(`SELECT * FROM devices ${clause} LIMIT 1`, values);
      return result.rows[0] ? snakeToCamel(result.rows[0]) : null;
    },
    
    async findMany({ where, orderBy, take, select }: { 
      where?: Partial<Device>; 
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
      select?: Record<string, boolean>;
    } = {}): Promise<Device[]> {
      let sql = 'SELECT * FROM devices';
      const { clause, values } = buildWhereClause(where || {});
      sql += clause;
      
      if (orderBy) {
        const [key, direction] = Object.entries(orderBy)[0];
        sql += ` ORDER BY ${camelToSnake(key)} ${direction.toUpperCase()}`;
      }
      
      if (take) {
        sql += ` LIMIT ${take}`;
      }
      
      const result = await query<Device>(sql, values);
      return result.rows.map(snakeToCamel);
    },
    
    async create({ data }: { data: Partial<Device> }): Promise<Device> {
      const columns = Object.keys(data).map(camelToSnake).join(', ');
      const values = Object.values(data);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      
      const sql = `INSERT INTO devices (${columns}) VALUES (${placeholders}) RETURNING *`;
      const result = await query<Device>(sql, values);
      return snakeToCamel(result.rows[0]);
    },
    
    async update({ where, data }: { where: Partial<Device>; data: Partial<Device> }): Promise<Device> {
      const whereClause = buildWhereClause(where);
      const setEntries = Object.entries(data).filter(([_, v]) => v !== undefined);
      const setColumns = setEntries.map(([k]) => `${camelToSnake(k)} = ?`).join(', ');
      const setValues = setEntries.map(([_, v]) => v);
      
      let paramIndex = 1;
      const setClause = setColumns.replace(/\?/g, () => `$${paramIndex++}`);
      const whereClauseStr = whereClause.clause.replace(/\$\d+/g, (match) => {
        const num = parseInt(match.slice(1));
        return `$${num + setEntries.length}`;
      });
      
      const sql = `UPDATE devices SET ${setClause} ${whereClauseStr} RETURNING *`;
      const result = await query<Device>(sql, [...setValues, ...whereClause.values]);
      return snakeToCamel(result.rows[0]);
    },
  },
  
  // Admin operations
  admin: {
    async findUnique({ where }: { where: Partial<Admin> }): Promise<Admin | null> {
      const { clause, values } = buildWhereClause(where);
      const result = await query<Admin>(`SELECT * FROM admins ${clause} LIMIT 1`, values);
      return result.rows[0] ? snakeToCamel(result.rows[0]) : null;
    },
    
    async create({ data }: { data: Partial<Admin> }): Promise<Admin> {
      const columns = Object.keys(data).map(camelToSnake).join(', ');
      const values = Object.values(data);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      
      const sql = `INSERT INTO admins (${columns}) VALUES (${placeholders}) RETURNING *`;
      const result = await query<Admin>(sql, values);
      return snakeToCamel(result.rows[0]);
    },
    
    async update({ where, data }: { where: Partial<Admin>; data: Partial<Admin> }): Promise<Admin> {
      const whereClause = buildWhereClause(where);
      const setEntries = Object.entries(data).filter(([_, v]) => v !== undefined);
      const setValues = setEntries.map(([_, v]) => v);
      
      let paramIndex = 1;
      const setClause = setEntries
        .map(([k]) => `${camelToSnake(k)} = $${paramIndex++}`)
        .join(', ');
      
      const whereClauseStr = whereClause.clause
        ? whereClause.clause.replace(/\$(\d+)/g, (_, num) => `$${parseInt(num) + setEntries.length}`)
        : '';
      
      const sql = `UPDATE admins SET ${setClause} ${whereClauseStr} RETURNING *`;
      const result = await query<Admin>(sql, [...setValues, ...whereClause.values]);
      return snakeToCamel(result.rows[0]);
    },
  },
  
  // Command operations
  command: {
    async findUnique({ where }: { where: Partial<Command> }): Promise<Command | null> {
      const { clause, values } = buildWhereClause(where);
      const result = await query<Command>(`SELECT * FROM commands ${clause} LIMIT 1`, values);
      return result.rows[0] ? snakeToCamel(result.rows[0]) : null;
    },
    
    async findMany({ where, orderBy, take, include }: { 
      where?: Partial<Command>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
      include?: { device?: boolean; admin?: boolean };
    } = {}): Promise<Command[]> {
      let sql = 'SELECT * FROM commands';
      const { clause, values } = buildWhereClause(where || {});
      sql += clause;
      
      if (orderBy) {
        const [key, direction] = Object.entries(orderBy)[0];
        sql += ` ORDER BY ${camelToSnake(key)} ${direction.toUpperCase()}`;
      }
      
      if (take) {
        sql += ` LIMIT ${take}`;
      }
      
      const result = await query<Command>(sql, values);
      return result.rows.map(snakeToCamel);
    },
    
    async create({ data }: { data: Partial<Command> }): Promise<Command> {
      const columns = Object.keys(data).map(camelToSnake).join(', ');
      const values = Object.values(data);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      
      const sql = `INSERT INTO commands (${columns}) VALUES (${placeholders}) RETURNING *`;
      const result = await query<Command>(sql, values);
      return snakeToCamel(result.rows[0]);
    },
    
    async update({ where, data }: { where: Partial<Command>; data: Partial<Command> }): Promise<Command> {
      const whereClause = buildWhereClause(where);
      const setEntries = Object.entries(data).filter(([_, v]) => v !== undefined);
      const setValues = setEntries.map(([_, v]) => v);
      
      let paramIndex = 1;
      const setClause = setEntries
        .map(([k]) => `${camelToSnake(k)} = $${paramIndex++}`)
        .join(', ');
      
      const whereClauseStr = whereClause.clause
        ? whereClause.clause.replace(/\$(\d+)/g, (_, num) => `$${parseInt(num) + setEntries.length}`)
        : '';
      
      const sql = `UPDATE commands SET ${setClause} ${whereClauseStr} RETURNING *`;
      const result = await query<Command>(sql, [...setValues, ...whereClause.values]);
      return snakeToCamel(result.rows[0]);
    },
  },
  
  // Heartbeat operations
  heartbeat: {
    async create({ data }: { data: Partial<Heartbeat> }): Promise<Heartbeat> {
      const columns = Object.keys(data).map(camelToSnake).join(', ');
      const values = Object.values(data);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      
      const sql = `INSERT INTO heartbeats (${columns}) VALUES (${placeholders}) RETURNING *`;
      const result = await query<Heartbeat>(sql, values);
      return snakeToCamel(result.rows[0]);
    },
  },
  
  // BackupFile operations
  backupFile: {
    async findMany({ where, orderBy, take }: { 
      where?: Partial<BackupFile>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    } = {}): Promise<BackupFile[]> {
      let sql = 'SELECT * FROM backup_files';
      const { clause, values } = buildWhereClause(where || {});
      sql += clause;
      
      if (orderBy) {
        const [key, direction] = Object.entries(orderBy)[0];
        sql += ` ORDER BY ${camelToSnake(key)} ${direction.toUpperCase()}`;
      }
      
      if (take) {
        sql += ` LIMIT ${take}`;
      }
      
      const result = await query<BackupFile>(sql, values);
      return result.rows.map(snakeToCamel);
    },
    
    async create({ data }: { data: Partial<BackupFile> }): Promise<BackupFile> {
      const columns = Object.keys(data).map(camelToSnake).join(', ');
      const values = Object.values(data);
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      
      const sql = `INSERT INTO backup_files (${columns}) VALUES (${placeholders}) RETURNING *`;
      const result = await query<BackupFile>(sql, values);
      return snakeToCamel(result.rows[0]);
    },
  },
  
  // NotificationLog operations
  notificationLog: {
    async createMany({ data }: { data: Partial<NotificationLog>[] }): Promise<{ count: number }> {
      if (data.length === 0) return { count: 0 };
      
      const columns = Object.keys(data[0]).map(camelToSnake).join(', ');
      const values: any[] = [];
      const rows: string[] = [];
      let paramIndex = 1;
      
      for (const row of data) {
        const rowValues = Object.values(row);
        const placeholders = rowValues.map(() => `$${paramIndex++}`).join(',');
        rows.push(`(${placeholders})`);
        values.push(...rowValues);
      }
      
      const sql = `INSERT INTO notification_logs (${columns}) VALUES ${rows.join(', ')} ON CONFLICT DO NOTHING`;
      const result = await query(sql, values);
      return { count: result.rowCount || 0 };
    },
    
    async findMany({ where, orderBy, take }: { 
      where?: Partial<NotificationLog>;
      orderBy?: Record<string, 'asc' | 'desc'>;
      take?: number;
    } = {}): Promise<NotificationLog[]> {
      let sql = 'SELECT * FROM notification_logs';
      const { clause, values } = buildWhereClause(where || {});
      sql += clause;
      
      if (orderBy) {
        const [key, direction] = Object.entries(orderBy)[0];
        sql += ` ORDER BY ${camelToSnake(key)} ${direction.toUpperCase()}`;
      }
      
      if (take) {
        sql += ` LIMIT ${take}`;
      }
      
      const result = await query<NotificationLog>(sql, values);
      return result.rows.map(snakeToCamel);
    },
    
    async count({ where }: { where?: Partial<NotificationLog> } = {}): Promise<number> {
      let sql = 'SELECT COUNT(*) FROM notification_logs';
      const { clause, values } = buildWhereClause(where || {});
      sql += clause;
      
      const result = await query<{ count: string }>(sql, values);
      return parseInt(result.rows[0].count);
    },
  },
  
  // Raw query for health checks
  async $queryRaw<T = any>(strings: TemplateStringsArray, ...values: any[]): Promise<T[]> {
    const text = strings.join('?');
    const result = await query<T>(text, values);
    return result.rows;
  },
  
  // Disconnect (for compatibility with Prisma)
  async $disconnect(): Promise<void> {
    const { closePool } = await import('./postgres');
    await closePool();
  },
};

// Default export for compatibility
export default db;
