import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Fixed, git-ignored scratch directory: the script reads `.env.local` in its cwd.
const WORK_DIR = '.runtime/check-pepper-test';

function run(envFile: string): { status: number | null; stderr: string } {
  fs.writeFileSync(`${WORK_DIR}/.env.local`, envFile);
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.SECURITY_PEPPER;
  delete childEnv.CLAIM_TOKEN_PEPPER;
  const result = spawnSync(process.execPath, ['../../scripts/check-pepper.js'], {
    cwd: WORK_DIR,
    env: childEnv,
    encoding: 'utf8',
  });
  return { status: result.status, stderr: result.stderr };
}

describe('check-pepper predev warning', () => {
  beforeEach(() => {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
    fs.mkdirSync(WORK_DIR, { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(WORK_DIR, { recursive: true, force: true });
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
