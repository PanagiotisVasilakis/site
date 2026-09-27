import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Lockfile {
  dependencies?: Record<string, string>;
  packages: Record<string, { version: string; dev?: boolean }>;
}

// Vitest runs with the repository root as cwd.
const rootLock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as Lockfile;
const manifest = JSON.parse(readFileSync('docker/migrate/package.json', 'utf8')) as Lockfile;
const lock = JSON.parse(readFileSync('docker/migrate/package-lock.json', 'utf8')) as Lockfile;

describe('migrate image manifest (docker/migrate)', () => {
  it('pins the Prisma CLI and dotenv to the versions the application is locked to', () => {
    expect(manifest.dependencies).toEqual({
      dotenv: rootLock.packages['node_modules/dotenv'].version,
      prisma: rootLock.packages['node_modules/prisma'].version,
    });
    // The CLI must match the generated client that the web image runs.
    expect(rootLock.packages['node_modules/prisma'].version).toBe(rootLock.packages['node_modules/@prisma/client'].version);
  });

  it('has a lockfile that resolves exactly those versions with no dev dependencies', () => {
    expect(lock.packages['node_modules/prisma'].version).toBe(manifest.dependencies?.prisma);
    expect(lock.packages['node_modules/dotenv'].version).toBe(manifest.dependencies?.dotenv);
    expect(Object.values(lock.packages).some((entry) => entry.dev)).toBe(false);
  });
});
