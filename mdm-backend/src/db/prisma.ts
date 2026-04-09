// src/db/prisma.ts
// Re-export from db.ts for compatibility (replaces Prisma)
import db from './db';

export const prisma = db;
export default db;
