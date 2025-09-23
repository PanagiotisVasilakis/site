/**
 * Database Migration Script
 * Handles migration from file-based storage to PostgreSQL
 */

import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { guestStore } from '@/lib/guestDataStore';
import { logger } from '@/lib/logger-enterprise';

interface MigrationConfig {
  dryRun?: boolean;
  batchSize?: number;
  skipDataMigration?: boolean;
}

export class DatabaseMigrator {
  private pool: Pool;
  private config: MigrationConfig;

  constructor(connectionString: string, config: MigrationConfig = {}) {
    this.pool = new Pool({ connectionString });
    this.config = {
      dryRun: false,
      batchSize: 100,
      skipDataMigration: false,
      ...config,
    };
  }

  async migrate(): Promise<void> {
    logger.info('Starting database migration', { config: this.config });

    try {
      // 1. Run schema migrations
      await this.runSchemaMigrations();

      // 2. Migrate data from file store to PostgreSQL
      if (!this.config.skipDataMigration) {
        await this.migrateData();
      }

      // 3. Verify migration
      await this.verifyMigration();

      logger.info('Database migration completed successfully');
    } catch (error) {
      logger.error('Database migration failed', { error });
      throw error;
    }
  }

  private async runSchemaMigrations(): Promise<void> {
    logger.info('Running schema migrations');

    const migrationsDir = path.join(process.cwd(), 'migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      logger.info(`Running migration: ${file}`);
      
      if (!this.config.dryRun) {
        await this.pool.query(sql);
      }
    }
  }

  private async migrateData(): Promise<void> {
    logger.info('Migrating data from file store');

    // Check if file store exists
    const fileStorePath = path.join(process.cwd(), 'secure-data.enc.json');
    if (!fs.existsSync(fileStorePath)) {
      logger.info('No file store found, skipping data migration');
      return;
    }

    // Read data from file store
    const users = await this.getAllUsers();
    const identities = await this.getAllIdentities();
    const bookings = await this.getAllBookings();
    const access = await this.getAllAccess();
    const checkins = await this.getAllCheckins();

    // Migrate in batches
    await this.migrateUsers(users);
    await this.migrateIdentities(identities);
    await this.migrateBookings(bookings);
    await this.migrateAccess(access);
    await this.migrateCheckins(checkins);
  }

  private async migrateUsers(users: any[]): Promise<void> {
    logger.info(`Migrating ${users.length} users`);

    for (let i = 0; i < users.length; i += this.config.batchSize!) {
      const batch = users.slice(i, i + this.config.batchSize!);
      
      if (!this.config.dryRun) {
        for (const user of batch) {
          await this.pool.query(
            `INSERT INTO users (id, email, phone_enc, phone_hmac, country_origin, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [user.id, user.email, user.phone_enc, user.phone_hmac, user.country_origin, user.created_at, user.updated_at]
          );
        }
      }
      
      logger.info(`Migrated users batch ${Math.floor(i / this.config.batchSize!) + 1}`);
    }
  }

  private async migrateIdentities(identities: any[]): Promise<void> {
    logger.info(`Migrating ${identities.length} identities`);

    for (let i = 0; i < identities.length; i += this.config.batchSize!) {
      const batch = identities.slice(i, i + this.config.batchSize!);
      
      if (!this.config.dryRun) {
        for (const identity of batch) {
          await this.pool.query(
            `INSERT INTO identities (user_id, type, value_hash, salt, last4_mask, verified_at)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, type) DO NOTHING`,
            [identity.user_id, identity.type, identity.value_hash, identity.salt, identity.last4_mask, identity.verified_at]
          );
        }
      }
      
      logger.info(`Migrated identities batch ${Math.floor(i / this.config.batchSize!) + 1}`);
    }
  }

  private async migrateBookings(bookings: any[]): Promise<void> {
    logger.info(`Migrating ${bookings.length} bookings`);

    for (let i = 0; i < bookings.length; i += this.config.batchSize!) {
      const batch = bookings.slice(i, i + this.config.batchSize!);
      
      if (!this.config.dryRun) {
        for (const booking of batch) {
          await this.pool.query(
            `INSERT INTO bookings (id, source, reference, last_name_hash, last_name_salt, 
                                 last_name_token, last_name_token_nows, start_date, end_date, 
                                 user_id, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [booking.id, booking.source, booking.reference, booking.last_name_hash, 
             booking.last_name_salt, booking.last_name_token, booking.last_name_token_nows,
             booking.start_date, booking.end_date, booking.user_id, booking.created_at]
          );
        }
      }
      
      logger.info(`Migrated bookings batch ${Math.floor(i / this.config.batchSize!) + 1}`);
    }
  }

  private async migrateAccess(access: any[]): Promise<void> {
    logger.info(`Migrating ${access.length} access records`);

    for (let i = 0; i < access.length; i += this.config.batchSize!) {
      const batch = access.slice(i, i + this.config.batchSize!);
      
      if (!this.config.dryRun) {
        for (const accessRecord of batch) {
          await this.pool.query(
            `INSERT INTO booking_access (user_id, booking_id, status, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, booking_id) DO NOTHING`,
            [accessRecord.user_id, accessRecord.booking_id, accessRecord.status, 
             accessRecord.created_at, accessRecord.updated_at]
          );
        }
      }
      
      logger.info(`Migrated access batch ${Math.floor(i / this.config.batchSize!) + 1}`);
    }
  }

  private async migrateCheckins(checkins: any[]): Promise<void> {
    logger.info(`Migrating ${checkins.length} checkin completions`);

    for (let i = 0; i < checkins.length; i += this.config.batchSize!) {
      const batch = checkins.slice(i, i + this.config.batchSize!);
      
      if (!this.config.dryRun) {
        for (const checkin of batch) {
          await this.pool.query(
            `INSERT INTO checkin_completions (booking_id, arrival_time, special_requests, accepted_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (booking_id) DO NOTHING`,
            [checkin.booking_id, checkin.arrival_time, checkin.special_requests, checkin.accepted_at]
          );
        }
      }
      
      logger.info(`Migrated checkins batch ${Math.floor(i / this.config.batchSize!) + 1}`);
    }
  }

  private async verifyMigration(): Promise<void> {
    logger.info('Verifying migration');

    const counts = await this.pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM identities) as identities,
        (SELECT COUNT(*) FROM bookings) as bookings,
        (SELECT COUNT(*) FROM booking_access) as access,
        (SELECT COUNT(*) FROM checkin_completions) as checkins
    `);

    logger.info('Migration verification complete', counts.rows[0]);
  }

  private async getAllUsers(): Promise<any[]> {
    // This would use the existing guestStore to read all users
    // Implementation depends on your current file store structure
    return []; // Placeholder
  }

  private async getAllIdentities(): Promise<any[]> {
    return []; // Placeholder
  }

  private async getAllBookings(): Promise<any[]> {
    return []; // Placeholder
  }

  private async getAllAccess(): Promise<any[]> {
    return []; // Placeholder
  }

  private async getAllCheckins(): Promise<any[]> {
    return []; // Placeholder
  }

  async cleanup(): Promise<void> {
    await this.pool.end();
  }
}

// CLI interface
export async function runMigration() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const config: MigrationConfig = {
    dryRun: process.argv.includes('--dry-run'),
    batchSize: parseInt(process.env.MIGRATION_BATCH_SIZE || '100'),
    skipDataMigration: process.argv.includes('--schema-only'),
  };

  const migrator = new DatabaseMigrator(connectionString, config);

  try {
    await migrator.migrate();
    logger.info('Migration completed successfully');
  } catch (error) {
    logger.error('Migration failed', { error });
    process.exit(1);
  } finally {
    await migrator.cleanup();
  }
}

// Run if called directly
if (require.main === module) {
  runMigration();
}