import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Vitest runs with the repository root as cwd.
const migrations = readdirSync('prisma/migrations', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const routeSource = readFileSync('src/app/api/health/ready/route.ts', 'utf8');

describe('readiness migration pin', () => {
  it('names the newest Prisma migration, so readiness fails against a database that lacks it', () => {
    const pinned = /const EXPECTED_MIGRATION = '([^']+)';/u.exec(routeSource)?.[1];

    expect(migrations.length).toBeGreaterThan(0);
    expect(pinned).toBe(migrations.at(-1));
  });
});
