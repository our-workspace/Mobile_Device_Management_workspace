// src/db/init-db.ts
// Initialize database tables (replaces Prisma migrations)
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from './postgres';

// List of all required tables
const REQUIRED_TABLES = [
  'admins',
  'devices',
  'commands',
  'heartbeats',
  'backup_files',
  'notification_logs'
];

export async function initializeDatabase(): Promise<void> {
  try {
    // Check which tables already exist
    const existingTablesResult = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = ANY($1);
    `, [REQUIRED_TABLES]);

    const existingTables = existingTablesResult.rows.map((r: { table_name: string }) => r.table_name);
    const missingTables = REQUIRED_TABLES.filter(t => !existingTables.includes(t));

    // If all tables exist, nothing to do
    if (missingTables.length === 0) {
      console.log('[DB] ✓ All tables already exist, skipping initialization');
      return;
    }

    // If some tables exist but not all, log a warning
    if (existingTables.length > 0) {
      console.log(`[DB] ⚠ Partial database state detected:`);
      console.log(`[DB]   Existing tables: ${existingTables.join(', ')}`);
      console.log(`[DB]   Missing tables: ${missingTables.join(', ')}`);
      console.log('[DB] Creating missing tables only...');
    } else {
      console.log('[DB] Initializing database tables for the first time...');
    }

    // Read SQL script
    const sqlPath = join(__dirname, 'init.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    // Extract CREATE TABLE statements for missing tables only
    for (const tableName of missingTables) {
      // Find CREATE TABLE statement for this table
      const createTableRegex = new RegExp(
        `CREATE TABLE ${tableName} \\([^;]+\\);`,
        'gs'
      );
      const match = sql.match(createTableRegex);

      if (match) {
        try {
          await query(match[0]);
          console.log(`[DB] ✓ Created table: ${tableName}`);
        } catch (err) {
          console.error(`[DB] ✗ Error creating table ${tableName}:`, err);
          throw err;
        }
      }
    }

    // Create indexes (skip if they might already exist)
    console.log('[DB] Creating indexes...');
    const indexStatements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.startsWith('CREATE INDEX'));

    for (const statement of indexStatements) {
      try {
        await query(statement + ';');
      } catch (err: any) {
        // Ignore "already exists" errors
        if (!err.message?.includes('already exists')) {
          console.warn(`[DB] Warning creating index:`, err.message);
        }
      }
    }

    // Insert default admin only if admins table was just created
    if (missingTables.includes('admins')) {
      const adminMatch = sql.match(/INSERT INTO admins[^;]+;/);
      if (adminMatch) {
        try {
          await query(adminMatch[0]);
          console.log('[DB] ✓ Default admin created: admin / admin123');
        } catch (err: any) {
          if (!err.message?.includes('duplicate key')) {
            console.warn(`[DB] Warning creating admin:`, err.message);
          }
        }
      }
    }

    console.log('[DB] ✓ Database initialization complete');

  } catch (error) {
    console.error('[DB] Error initializing database:', error);
    // Don't throw - let the app continue and maybe retry later
    console.log('[DB] ⚠ Continuing without full database setup...');
  }
}
