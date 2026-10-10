import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { PrismaClient } from '@/generated/prisma/client';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';

const runtime = readDisposablePostgresRuntime();
const managedEnvironment = ['DATABASE_URL'] as const;
type ManagedEnvironmentName = typeof managedEnvironment[number];

const id = (n: number) => `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Microsecond timestamps that collapse to the same JavaScript millisecond
// (.123), plus exact ties, so only database-side comparisons order them.
const ROWS: Array<[number, string]> = [
  [1, '2030-06-15T10:00:00.123456Z'],
  [2, '2030-06-15T10:00:00.123456Z'],
  [3, '2030-06-15T10:00:00.123456Z'],
  [4, '2030-06-15T10:00:00.123999Z'],
  [5, '2030-06-15T10:00:00.123999Z'],
  [6, '2030-06-15T10:00:00.123001Z'],
  [7, '2030-06-15T09:59:59.999999Z'],
];
// (created_at desc, id desc)
const EXPECTED_ORDER = [5, 4, 3, 2, 1, 6, 7].map(id);

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Pagination database was not initialized.');
  return target;
}

async function seed(): Promise<void> {
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    for (const [n, createdAt] of ROWS) {
      await prisma.$executeRaw`
        INSERT INTO check_in_requests (id, requested_time, status, created_at, updated_at)
        VALUES (${id(n)}::uuid, '16:00', 'PENDING', ${createdAt}::timestamptz, ${createdAt}::timestamptz)
      `;
    }
  }, 'seed');
}

async function approve(rowId: string): Promise<void> {
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    await prisma.$executeRaw`UPDATE check_in_requests SET status = 'APPROVED' WHERE id = ${rowId}::uuid`;
  }, 'seed');
}

describe.sequential('admin list keyset pagination on PostgreSQL', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'admin_list_pagination');
    await applyMigrationsFromEmpty(target);
    for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
    process.env.DATABASE_URL = target.databaseUrl;
    applicationPrisma = (await import('@/lib/prisma')).prisma;
  });

  afterEach(async () => {
    if (target) {
      await withTestPrismaClient(requireTarget(), async (prisma) => {
        await prisma.checkInRequest.deleteMany();
      }, 'cleanup');
    }
  });

  afterAll(async () => {
    try {
      await applicationPrisma?.$disconnect();
      applicationPrisma = undefined;
    } finally {
      for (const name of managedEnvironment) {
        const value = originalEnvironment.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (target) await dropIsolatedDatabase(target);
      target = undefined;
    }
  });

  it('returns every row exactly once in (createdAt desc, id desc) order across pages', async () => {
    await seed();
    const { checkInRequestRepository } = await import('@/lib/prisma-repositories/checkInRequestRepository');

    const seen: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 10; guard += 1) {
      const page = await checkInRequestRepository.list({ limit: 2, cursor });
      seen.push(...page.requests.map((request) => request.id));
      pageSizes.push(page.requests.length);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    expect(seen).toEqual(EXPECTED_ORDER);
    expect(pageSizes).toEqual([2, 2, 2, 1]);
  });

  it('does not skip a row when the cursor row leaves the filter between pages', async () => {
    await seed();
    const { checkInRequestRepository } = await import('@/lib/prisma-repositories/checkInRequestRepository');

    const first = await checkInRequestRepository.list({ status: 'PENDING', limit: 2 });
    expect(first.requests.map((request) => request.id)).toEqual([id(5), id(4)]);
    expect(first.nextCursor).toBe(id(4));

    await approve(id(4));

    const second = await checkInRequestRepository.list({ status: 'PENDING', limit: 2, cursor: first.nextCursor! });
    expect(second.requests.map((request) => request.id)).toEqual([id(3), id(2)]);
    const third = await checkInRequestRepository.list({ status: 'PENDING', limit: 2, cursor: second.nextCursor! });
    expect(third.requests.map((request) => request.id)).toEqual([id(1), id(6)]);
    const last = await checkInRequestRepository.list({ status: 'PENDING', limit: 2, cursor: third.nextCursor! });
    expect(last.requests.map((request) => request.id)).toEqual([id(7)]);
    expect(last.nextCursor).toBeNull();
  });
});
