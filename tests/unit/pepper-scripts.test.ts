import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('check-pepper predev warning', () => {
  const SCRIPT = path.resolve('scripts/check-pepper.js');
  let workDir = '';

  function run(envFile: string): { status: number | null; stderr: string } {
    fs.writeFileSync(path.join(workDir, '.env.local'), envFile);
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    delete childEnv.SECURITY_PEPPER;
    delete childEnv.CLAIM_TOKEN_PEPPER;
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: workDir, env: childEnv, encoding: 'utf8' });
    return { status: result.status, stderr: result.stderr };
  }

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-pepper-test-'));
  });
  afterEach(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('treats an empty SECURITY_PEPPER or CLAIM_TOKEN_PEPPER followed by other lines as missing', () => {
    const first = run('SECURITY_PEPPER=\nCLAIM_TOKEN_PEPPER=def\nFOO=bar\n');
    expect(first.status).toBe(0);
    expect(first.stderr).toContain('SECURITY_PEPPER not found');

    const second = run('CLAIM_TOKEN_PEPPER=\nSECURITY_PEPPER=abc\n');
    expect(second.stderr).toContain('CLAIM_TOKEN_PEPPER not found');
  });

  it('accepts non-empty values', () => {
    const result = run('SECURITY_PEPPER=abc\nCLAIM_TOKEN_PEPPER=def\n');
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });
});

describe('ensure-pepper local environment bootstrap', () => {
  const SCRIPT = path.resolve('scripts/ensure-pepper.js');
  let workDir = '';
  let envFilePath = '';

  function run(env: Record<string, string> = {}): string {
    const childEnv: NodeJS.ProcessEnv = { ...process.env };
    for (const key of Object.keys(childEnv)) if (key.startsWith('POSTGRES_')) delete childEnv[key];
    return execFileSync(process.execPath, [SCRIPT], {
      cwd: workDir,
      env: { ...childEnv, ...env },
      encoding: 'utf8',
    });
  }

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ensure-pepper-test-'));
    envFilePath = path.join(workDir, '.env.local');
  });
  afterEach(() => {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
  });

  it('creates .env.local with the docker-compose database URL and development secrets', () => {
    const output = run();

    const env = fs.readFileSync(envFilePath, 'utf8');
    expect(env).toMatch(/^DATABASE_URL=postgresql:\/\/devuser:devpass@localhost:5433\/site_dev$/m);
    expect(env).toMatch(/^SECURITY_PEPPER=[0-9a-f]{64}$/m);
    expect(env).toMatch(/^CLAIM_TOKEN_PEPPER=[0-9a-f]{64}$/m);
    expect(env).toMatch(/^ORIGIN_PROXY_SHARED_SECRET=[0-9a-f]{64}$/m);
    const pepper = /^SECURITY_PEPPER=(.+)$/m.exec(env)?.[1] ?? '';
    expect(output).toContain('Generated DATABASE_URL');
    expect(output).not.toContain(pepper);
    expect(fs.statSync(envFilePath).mode & 0o777).toBe(0o600);
  });

  it('follows the POSTGRES_* overrides that docker-compose uses', () => {
    run({ POSTGRES_USER: 'me', POSTGRES_PASSWORD: 'p@ss', POSTGRES_DB: 'guide', POSTGRES_PORT: '6543' });

    expect(fs.readFileSync(envFilePath, 'utf8'))
      .toMatch(/^DATABASE_URL=postgresql:\/\/me:p%40ss@localhost:6543\/guide$/m);
  });

  it('keeps an existing DATABASE_URL and is idempotent', () => {
    fs.writeFileSync(envFilePath, 'DATABASE_URL=postgresql://custom@db:5432/app\n');

    run();
    const first = fs.readFileSync(envFilePath, 'utf8');
    const output = run();

    expect(first.match(/^DATABASE_URL=/gm)).toHaveLength(1);
    expect(first).toContain('DATABASE_URL=postgresql://custom@db:5432/app');
    expect(fs.readFileSync(envFilePath, 'utf8')).toBe(first);
    expect(output).toContain('no action taken');
  });

  it('generates each empty secret line when other lines follow', () => {
    fs.writeFileSync(
      envFilePath,
      'SECURITY_PEPPER=\nDATABASE_URL=\nCLAIM_TOKEN_PEPPER=\nORIGIN_PROXY_SHARED_SECRET=\nFOO=bar\n',
    );

    const output = run();

    const env = fs.readFileSync(envFilePath, 'utf8');
    expect(env).toMatch(/^SECURITY_PEPPER=[0-9a-f]{64}$/m);
    expect(output).toContain('Generated SECURITY_PEPPER');
    expect(env).toMatch(/^DATABASE_URL=postgresql:\/\/devuser:devpass@localhost:5433\/site_dev$/m);
    expect(env).toMatch(/^CLAIM_TOKEN_PEPPER=[0-9a-f]{64}$/m);
    expect(env).toMatch(/^ORIGIN_PROXY_SHARED_SECRET=[0-9a-f]{64}$/m);
  });

  it('keeps a non-empty SECURITY_PEPPER', () => {
    fs.writeFileSync(envFilePath, 'SECURITY_PEPPER=abc\n');

    const output = run();

    const env = fs.readFileSync(envFilePath, 'utf8');
    expect(env.match(/^SECURITY_PEPPER=/gm)).toHaveLength(1);
    expect(env).toMatch(/^SECURITY_PEPPER=abc$/m);
    expect(output).not.toContain('Generated SECURITY_PEPPER');
  });
});
