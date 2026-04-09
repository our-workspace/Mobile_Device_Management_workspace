// src/db/postgres.ts
// PostgreSQL client using pg (replaces Prisma)
import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';

// Parse DATABASE_URL
const parseConnectionString = (url: string) => {
  const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  if (!match) throw new Error('Invalid DATABASE_URL format');
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5],
  };
};

const dbConfig = parseConnectionString(config.databaseUrl);

// Create connection pool
export const pool = new Pool({
  user: dbConfig.user,
  host: dbConfig.host,
  database: dbConfig.database,
  password: dbConfig.password,
  port: dbConfig.port,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Helper function for queries
export async function query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
  return pool.query(text, params);
}

// Get a client from the pool for transactions
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// Transaction helper
export async function withTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  await pool.end();
}

// Test connection
export async function testConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
