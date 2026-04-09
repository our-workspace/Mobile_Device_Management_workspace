// src/db/init-db.ts
// Initialize database tables (replaces Prisma migrations)
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from './postgres';

export async function initializeDatabase(): Promise<void> {
  try {
    // Check if tables already exist
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'devices'
      );
    `);
    
    const tablesExist = tableCheck.rows[0].exists;
    
    if (tablesExist) {
      console.log('[DB] Tables already exist, skipping initialization');
      return;
    }
    
    console.log('[DB] Initializing database tables...');
    
    // Read and execute SQL script
    const sqlPath = join(__dirname, 'init.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    // Split SQL into individual statements and execute
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement) {
        await query(statement + ';');
      }
    }
    
    console.log('[DB] ✓ Database tables initialized successfully');
    console.log('[DB] ✓ Default admin created: admin / admin123');
    
  } catch (error) {
    console.error('[DB] Error initializing database:', error);
    throw error;
  }
}
