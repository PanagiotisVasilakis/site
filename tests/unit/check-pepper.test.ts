import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPT = path.resolve('scripts/check-pepper.js');
let workDir = '';

function run(envFile: string): { status: number | null; stderr: string } {
  fs.writeFileSync(path.join(workDir, '.env.local'), envFile);
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.SECURITY_PEPPER;
  delete childEnv.CLAIM_TOKEN_PEPPER;
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: workDir,
    env: childEnv,
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

describe('check-pepper predev warning', () => {
  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-pepper-test-'));
  });
  afterEach(() => {
    if (workDir) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  });

  it('treats an empty SECURITY_PEPPER or CLAIM_TOKEN_PEPPER followed by other lines as missing', () => {
    const { status, stderr } = run('SECURITY_PEPPER=\nCLAIM_TOKEN_PEPPER=def\nFOO=bar\n');

    expect(status).toBe(0);
    expect(stderr).toContain('SECURITY_PEPPER not found');

    const second = run('CLAIM_TOKEN_PEPPER=\nSECURITY_PEPPER=abc\n');

    expect(second.stderr).toContain('CLAIM_TOKEN_PEPPER not found');
  });

  it('accepts non-empty values', () => {
    const { status, stderr } = run('SECURITY_PEPPER=abc\nCLAIM_TOKEN_PEPPER=def\n');

    expect(status).toBe(0);
    expect(stderr).toBe('');
  });
});
