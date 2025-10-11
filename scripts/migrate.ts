#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { initializeDatabase, getDatabase } from '../src/lib/database.js';

async function runMigrations() {
  try {
    // Initialize database
    await initializeDatabase();
    const db = await getDatabase();
    
    // Create migrations table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      )
    `);
    
    // Read migration files
    const migrationsDir = path.join(process.cwd(), 'migrations');
    
    // Check if migrations directory exists
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found');
      process.exit(0);
    }
    
    // Get list of migration files
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    // Get already applied migrations
  const appliedRows: Array<{ name: string }> = await db.all('SELECT name FROM migrations ORDER BY id');
  const appliedMigrations = appliedRows.map((row) => row.name);
    
    console.log(`Found ${migrationFiles.length} migrations, ${appliedMigrations.length} already applied`);
    
    // Apply pending migrations
    let appliedCount = 0;
    for (const file of migrationFiles) {
      if (!appliedMigrations.includes(file)) {
        console.log(`Applying migration: ${file}`);
        
        const migrationPath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(migrationPath, 'utf8');
        
        // Split SQL by semicolons to execute statements individually
        const statements = sql.split(';').filter(stmt => stmt.trim() !== '');
        
        for (const statement of statements) {
          if (statement.trim() !== '') {
            await db.exec(statement);
          }
        }
        
        // Record migration as applied
        await db.run(
          'INSERT INTO migrations (name, applied_at) VALUES (?, ?)',
          file,
          Date.now()
        );
        
        console.log(`Applied migration: ${file}`);
        appliedCount++;
      }
    }
    
    console.log(`Applied ${appliedCount} migrations successfully`);
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations();
}