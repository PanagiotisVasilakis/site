import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enterScratchDir, leaveScratchDir } from './support/scratch-dir';

const SCRIPT = path.resolve('scripts/check-pepper.js');
const ENV_FILE = '.env.local';

// A scratch directory of its own per test, entered as the cwd: the script reads `.env.local` there.
let workDir = '';

function run(envFile: string): { status: number | null; stderr: string } {
  fs.writeFileSync(ENV_FILE, envFile);
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
    workDir = enterScratchDir('check-pepper-test');
  });
  afterEach(() => {
    leaveScratchDir(workDir);
  });

  it('treats an empty SECURITY_PEPPER followed by other lines as missing', () => {
    const { status, stderr } = run('SECURITY_PEPPER=\nCLAIM_TOKEN_PEPPER=def\nFOO=bar\n');

    expect(status).toBe(0);
    expect(stderr).toContain('SECURITY_PEPPER not found');
  });

  it('treats an empty CLAIM_TOKEN_PEPPER followed by other lines as missing', () => {
    const { stderr } = run('CLAIM_TOKEN_PEPPER=\nSECURITY_PEPPER=abc\n');

    expect(stderr).toContain('CLAIM_TOKEN_PEPPER not found');
  });

  it('accepts non-empty values', () => {
    const { status, stderr } = run('SECURITY_PEPPER=abc\nCLAIM_TOKEN_PEPPER=def\n');

    expect(status).toBe(0);
    expect(stderr).toBe('');
  });
});
