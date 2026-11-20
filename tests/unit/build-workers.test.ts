import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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

  it('copies the bundled workers into the unified runner stage of Dockerfile.security', () => {
    const dockerfile = readFileSync('docker/Dockerfile.security', 'utf8');
    const stages = [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+(\S+)$/gmu)].map((match) => match[1]);
    expect(stages).toEqual(['builder', 'runner']);
    const runnerStage = dockerfile.split(/^FROM\s+\S+\s+AS\s+runner$/mu)[1];
    expect(runnerStage).toContain('COPY --from=builder --chown=nextjs:nodejs /app/dist/workers ./dist/workers');
  });

  it('copies every module the start script imports into the runner stage of Dockerfile.security', () => {
    const dockerfile = readFileSync('docker/Dockerfile.security', 'utf8');
    const runnerStage = dockerfile.split(/^FROM\s+\S+\s+AS\s+runner$/mu)[1];

    // Static imports only: the start script loads server.js with a dynamic import at run time.
    const files = new Set<string>();
    const packages = new Set<string>();
    const queue = ['scripts/start-standalone.mjs'];
    for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
      if (files.has(file)) continue;
      files.add(file);
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gmu)) {
        const specifier = match[1];
        if (specifier.startsWith('node:')) continue;
        if (specifier.startsWith('.')) {
          queue.push(path.posix.join(path.posix.dirname(file), specifier));
        } else {
          packages.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
        }
      }
    }
    expect([...files]).toEqual(expect.arrayContaining(['scripts/start-standalone.mjs', 'src/lib/runtime-env-schema.js', 'src/lib/runtime-credentials.js']));
    expect([...packages]).toContain('zod');

    for (const file of files) expect(runnerStage).toContain(`COPY --from=builder --chown=nextjs:nodejs /app/${file} ./${file}`);
    for (const name of packages) expect(runnerStage).toContain(`COPY --from=builder --chown=nextjs:nodejs /app/node_modules/${name} ./node_modules/${name}`);
  });
});
