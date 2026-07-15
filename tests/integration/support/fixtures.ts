import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/generated/prisma/client';

import { withVerifiedDisposableDatabase } from './database-safety';
import type {
  DisposableDatabaseTarget,
  GuardedDatabaseOperation,
} from './database-safety';

export const SYNTHETIC_FIXTURE = {
  userId: '10000000-0000-4000-8000-000000000001',
  bookingId: '20000000-0000-4000-8000-000000000001',
  email: 'integration-guest@example.invalid',
  phoneE164: '+12025550100',
  provider: 'integration-fixture',
  externalReference: 'synthetic-booking-001',
  createdAt: new Date('2030-01-01T00:00:00.000Z'),
  startDate: new Date('2030-06-01T00:00:00.000Z'),
  endDate: new Date('2030-06-08T00:00:00.000Z'),
} as const;

export async function seedDeterministicFixtures(
  target: DisposableDatabaseTarget,
): Promise<void> {
  await withVerifiedDisposableDatabase(target, 'seed', async (client) => {
    await client.query('BEGIN');
    try {
      await client.query({
        text: `
          INSERT INTO users (
            id, email, phone_e164, password_hash, country_origin, created_at, updated_at
          ) VALUES ($1, $2, $3, NULL, 'ABROAD', $4, $4)
        `,
        values: [
          SYNTHETIC_FIXTURE.userId,
          SYNTHETIC_FIXTURE.email,
          SYNTHETIC_FIXTURE.phoneE164,
          SYNTHETIC_FIXTURE.createdAt,
        ],
      });
      await client.query({
        text: `
          INSERT INTO bookings (
            id, source, reference, start_date, end_date, user_id, provider,
            external_reference, access_status, claimed_at, created_at, updated_at
          ) VALUES ($1, 'EXTERNAL', NULL, $2, $3, $4, $5, $6, 'VERIFIED', $7, $7, $7)
        `,
        values: [
          SYNTHETIC_FIXTURE.bookingId,
          SYNTHETIC_FIXTURE.startDate,
          SYNTHETIC_FIXTURE.endDate,
          SYNTHETIC_FIXTURE.userId,
          SYNTHETIC_FIXTURE.provider,
          SYNTHETIC_FIXTURE.externalReference,
          SYNTHETIC_FIXTURE.createdAt,
        ],
      });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  });
}

export async function withTestPrismaClient<T>(
  target: DisposableDatabaseTarget,
  action: (client: PrismaClient) => Promise<T>,
  operation: GuardedDatabaseOperation = 'verification',
): Promise<T> {
  return withVerifiedDisposableDatabase(target, operation, async () => {
    const adapter = new PrismaPg({
      connectionString: target.databaseUrl,
      connectionTimeoutMillis: 3_000,
      statement_timeout: 5_000,
      query_timeout: 5_000,
      ssl: false,
    });
    const client = new PrismaClient({ adapter });
    try {
      return await action(client);
    } finally {
      await client.$disconnect();
    }
  });
}
