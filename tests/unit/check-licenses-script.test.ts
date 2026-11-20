import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

describe('check-licenses script', () => {
  const SCRIPT = path.join(process.cwd(), 'scripts', 'check-licenses.ts');
  const TSX = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const workDirs: string[] = [];

  function run(packages: Record<string, unknown>, installed: Record<string, Record<string, unknown>>) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'license-check-test-'));
    workDirs.push(dir);

    fs.writeFileSync(
      path.join(dir, 'package-lock.json'),
      JSON.stringify({ lockfileVersion: 3, packages: { '': { name: 'fixture' }, ...packages } }),
    );
    for (const [name, manifest] of Object.entries(installed)) {
      const packageDir = path.join(dir, 'node_modules', name);
      fs.mkdirSync(packageDir, { recursive: true });
      fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name, ...manifest }));
    }

    return spawnSync(TSX, [SCRIPT], { cwd: dir, env: { PATH: process.env.PATH, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 30_000 });
  }

  afterEach(() => {
    for (const dir of workDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when a non-optional locked package is not installed', () => {
    const result = run(
      {
        'node_modules/left-pad': { version: '1.3.0' },
        'node_modules/ms': { version: '2.1.3' },
      },
      { ms: { version: '2.1.3', license: 'MIT' } },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('left-pad');
    expect(result.stderr).toContain('not installed');
  }, 30_000);

  it('skips a missing optional package when another package was checked', () => {
    const result = run(
      {
        'node_modules/fsevents': { version: '2.3.3', optional: true },
        'node_modules/ms': { version: '2.1.3' },
      },
      { ms: { version: '2.1.3', license: 'MIT' } },
    );

    expect(result.status).toBe(0);
  }, 30_000);

  it('fails when only optional packages are listed and none was checked', () => {
    const result = run({ 'node_modules/fsevents': { version: '2.3.3', optional: true } }, {});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('No installed package was checked');
  }, 30_000);

  it('reports a missing devOptional package', () => {
    const result = run(
      {
        'node_modules/dev-tool': { version: '1.0.0', devOptional: true },
        'node_modules/ms': { version: '2.1.3' },
      },
      { ms: { version: '2.1.3', license: 'MIT' } },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('dev-tool');
    expect(result.stderr).toContain('not installed');
  }, 30_000);

  it('accepts an SPDX OR expression with one allowed alternative', () => {
    const result = run(
      { 'node_modules/dual-licensed': { version: '1.0.0' } },
      { 'dual-licensed': { version: '1.0.0', license: '(MIT OR GPL-3.0-only)' } },
    );

    expect(result.status).toBe(0);
  }, 30_000);

  it('rejects an SPDX AND expression when one side is not allowed', () => {
    const result = run(
      { 'node_modules/dual-licensed': { version: '1.0.0' } },
      { 'dual-licensed': { version: '1.0.0', license: '(MIT AND GPL-3.0-only)' } },
    );

    expect(result.status).toBe(1);
  }, 30_000);
});
