import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

// Vitest runs with the repository root as cwd. The bundler refuses locations outside the
// repository, and `dist/` is its default output, so use a sibling temporary directory.
const outdir = mkdtempSync('tmp-build-workers-');

afterAll(() => rmSync(outdir, { recursive: true, force: true }));

describe('worker bundles for the production image', () => {
  it('bundles both workers into self-contained modules that fail closed without a database', () => {
    const report = execFileSync('node', ['scripts/build-workers.mjs', outdir], { encoding: 'utf8' });

    // One line per output: "<path relative to the repository> <bytes> bytes sha256:<digest>".
    const outputs = report.trim().split('\n').map((line) => {
      const match = /^(\S+) (\d+) bytes sha256:([0-9a-f]{64})$/u.exec(line);
      expect(match, line).not.toBeNull();
      return { file: path.basename(match![1]), bytes: Number(match![2]) };
    });
    expect(outputs.map((output) => output.file).sort()).toEqual(['drain-outbox.mjs', 'run-operational-maintenance.mjs']);
    for (const output of outputs) expect(output.bytes).toBeGreaterThan(1_000_000);

    for (const [file, worker] of [['drain-outbox.mjs', 'outbox'], ['run-operational-maintenance.mjs', 'operations']]) {
      // No repository, no node_modules, no DATABASE_URL: the bundle must start on its own and stop with an error.
      const run = spawnSync('node', [path.resolve(outdir, file)], {
        cwd: os.tmpdir(),
        env: { NODE_ENV: 'production', PATH: process.env.PATH, LOG_CONSOLE: 'false', ALERT_WEBHOOK_REQUIRED: '0' },
        encoding: 'utf8',
        timeout: 30_000,
      });
      expect(run.status).toBe(1);
      const events = run.stderr.trim().split('\n').map((line) => JSON.parse(line) as { worker: string; status: string; error: string });
      expect(events).toEqual([{ worker, status: 'failed', error: expect.stringContaining('DATABASE_URL') }]);
    }
  }, 60_000);
});
