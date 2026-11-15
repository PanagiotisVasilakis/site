import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Fixed, git-ignored scratch directory: the checker reads ./package-lock.json and
// ./node_modules/<pkg>/package.json from its cwd.
const WORK_DIR = '.runtime/check-licenses-test';
const ELKJS_DIR = `${WORK_DIR}/node_modules/elkjs`;
const OTHER_DIR = `${WORK_DIR}/node_modules/not-elkjs`;

beforeEach(() => {
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
  fs.mkdirSync(ELKJS_DIR, { recursive: true });
  fs.mkdirSync(OTHER_DIR, { recursive: true });
});

afterEach(() => {
  fs.rmSync(WORK_DIR, { recursive: true, force: true });
});

function runChecker(elkjsLicense: string, otherLicense: string) {
  fs.writeFileSync(`${ELKJS_DIR}/package.json`, JSON.stringify({ name: 'elkjs', version: '1.0.0', license: elkjsLicense }));
  fs.writeFileSync(`${OTHER_DIR}/package.json`, JSON.stringify({ name: 'not-elkjs', version: '1.0.0', license: otherLicense }));
  fs.writeFileSync(
    `${WORK_DIR}/package-lock.json`,
    JSON.stringify({
      packages: {
        '': { version: '0.0.0' },
        'node_modules/elkjs': { version: '1.0.0' },
        'node_modules/not-elkjs': { version: '1.0.0' },
      },
    }),
  );

  return spawnSync(path.resolve('node_modules/.bin/tsx'), [path.resolve('scripts/check-licenses.ts')], {
    cwd: WORK_DIR,
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
