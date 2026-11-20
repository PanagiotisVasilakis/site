import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { REPOSITORY_ROOT, readDisposablePostgresRuntime } from '../support/runtime';

const runtime = readDisposablePostgresRuntime();

let target: DisposableDatabaseTarget | undefined;
let outdir: string | undefined;

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Worker bundle database was not initialized.');
  return target;
}

describe.sequential('bundled outbox worker on PostgreSQL', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'worker_bundle');
    await applyMigrationsFromEmpty(target);
    // Inside the repository so the bundler accepts the directory; it is removed in afterAll.
    outdir = mkdtempSync(path.join(REPOSITORY_ROOT, 'tmp-build-workers-'));
    execFileSync(process.execPath, [path.join(REPOSITORY_ROOT, 'scripts', 'build-workers.mjs'), outdir], {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
    });
  });

  afterAll(async () => {
    try {
      if (outdir) rmSync(outdir, { recursive: true, force: true });
    } finally {
      if (target) await dropIsolatedDatabase(target);
      target = undefined;
      outdir = undefined;
    }
  });

  it('drains an empty outbox and exits 0', () => {
    if (!outdir) throw new Error('Worker bundle directory was not built.');
    const run = spawnSync(process.execPath, [path.join(outdir, 'drain-outbox.mjs')], {
      cwd: os.tmpdir(),
      env: {
        NODE_ENV: 'production',
        PATH: process.env.PATH,
        LOG_CONSOLE: 'false',
        ALERT_WEBHOOK_REQUIRED: '0',
        DATABASE_URL: requireTarget().databaseUrl,
      },
      encoding: 'utf8',
      timeout: 60_000,
    });

    expect(run.status, run.stderr).toBe(0);
    const lines = run.stdout.trim().split('\n');
    expect(JSON.parse(lines[lines.length - 1])).toMatchObject({ worker: 'outbox' });
  });
});
