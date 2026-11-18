import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let workDir = '';
let elkjsDir = '';
let otherDir = '';

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-licenses-test-'));
  elkjsDir = path.join(workDir, 'node_modules/elkjs');
  otherDir = path.join(workDir, 'node_modules/not-elkjs');
  fs.mkdirSync(elkjsDir, { recursive: true });
  fs.mkdirSync(otherDir, { recursive: true });
});

afterEach(() => {
  if (workDir) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

function runChecker(elkjsLicense: string, otherLicense: string) {
  fs.writeFileSync(path.join(elkjsDir, 'package.json'), JSON.stringify({ name: 'elkjs', version: '1.0.0', license: elkjsLicense }));
  fs.writeFileSync(path.join(otherDir, 'package.json'), JSON.stringify({ name: 'not-elkjs', version: '1.0.0', license: otherLicense }));
  fs.writeFileSync(
    path.join(workDir, 'package-lock.json'),
    JSON.stringify({
      packages: {
        '': { version: '0.0.0' },
        'node_modules/elkjs': { version: '1.0.0' },
        'node_modules/not-elkjs': { version: '1.0.0' },
      },
    }),
  );

  return spawnSync(path.resolve('node_modules/.bin/tsx'), [path.resolve('scripts/check-licenses.ts')], {
    cwd: workDir,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('scripts/check-licenses.ts', () => {
  it('accepts EPL-2.0 for elkjs only (per-package exception)', () => {
    const run = runChecker('EPL-2.0', 'MIT');
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  }, 30_000);

  it('still rejects EPL-2.0 for any other package', () => {
    const run = runChecker('EPL-2.0', 'EPL-2.0');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('not-elkjs@1.0.0 (disallowed license: EPL-2.0)');
    expect(run.stderr).not.toContain('  - elkjs@');
  }, 30_000);

  it('does not extend the elkjs exception to other licenses', () => {
    const run = runChecker('GPL-3.0-only', 'MIT');
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('elkjs@1.0.0 (disallowed license: GPL-3.0-only)');
  }, 30_000);
});
