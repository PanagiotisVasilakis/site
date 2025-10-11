import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { logger } from '@/lib/logger';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

export async function initializeDatabase(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (db) {
    return db;
  }

  try {
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    db = await open({
      filename: path.join(dataDir, 'app.db'),
      driver: sqlite3.Database
    });

    // Enable WAL mode for better concurrency
    await db.exec('PRAGMA journal_mode = WAL;');
    
    // Enable foreign key constraints
    await db.exec('PRAGMA foreign_keys = ON;');
    
    // Enable synchronous mode for durability
    await db.exec('PRAGMA synchronous = NORMAL;');
    
    logger.info('Database initialized successfully');
    return db;
  } catch (error) {
    logger.error('Failed to initialize database', error);
    throw error;
  }
}

export async function getDatabase(): Promise<Database<sqlite3.Database, sqlite3.Statement>> {
  if (!db) {
    return await initializeDatabase();
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.close();
    db = null;
    logger.info('Database connection closed');
  }
}