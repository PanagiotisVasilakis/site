import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

interface Manifest {
  dependencies?: Record<string, string>;
  overrides?: Record<string, unknown>;
}

interface Lockfile {
  packages: Record<string, { version: string; dev?: boolean }>;
}

// Vitest runs with the repository root as cwd.
const rootManifest = JSON.parse(readFileSync('package.json', 'utf8')) as Manifest;
const rootLock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as Lockfile;
const manifest = JSON.parse(readFileSync('docker/migrate/package.json', 'utf8')) as Manifest;
const lock = JSON.parse(readFileSync('docker/migrate/package-lock.json', 'utf8')) as Lockfile;

// Root overrides that replace vulnerable versions reached through the Prisma CLI's dependency chain.
const PRISMA_CHAIN_OVERRIDES = ['deepmerge-ts', 'fast-uri', 'mysql2'];

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

  it('copies the root overrides of the Prisma CLI dependency chain', () => {
    for (const name of PRISMA_CHAIN_OVERRIDES) {
      expect(rootManifest.overrides?.[name], name).toEqual(expect.any(String));
      expect(manifest.overrides?.[name], name).toBe(rootManifest.overrides?.[name]);
    }
  });

  it('resolves every package it shares with the root lockfile to the root version', () => {
    // Compared by node_modules path: every migrate package must exist in the root lock at the same
    // version, so the image ships a subset of the tree the root install tests.
    // Regenerate from a copy of the root lock; npm then keeps the root resolutions and
    // prunes the rest:
    //   cp package-lock.json docker/migrate/package-lock.json
    //   (cd docker/migrate && npm install --package-lock-only --ignore-scripts)
    // A path only the migrate lock has would escape the version check below.
    expect(Object.keys(lock.packages).filter((path) => path !== '' && !(path in rootLock.packages))).toEqual([]);
    const drift = Object.entries(lock.packages)
      .filter(([path, entry]) => path !== '' && path in rootLock.packages && entry.version !== rootLock.packages[path].version)
      .map(([path, entry]) => `${path}: ${entry.version} (root ${rootLock.packages[path].version})`);
    expect(drift).toEqual([]);
  });
});
