import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { enterScratchDir, leaveScratchDir } from './support/scratch-dir';

const SCRIPT = path.resolve('scripts/ensure-pepper.js');
const ENV_FILE = '.env.local';

// A scratch directory of its own per test, entered as the cwd: the script writes `.env.local` there.
let workDir = '';

function run(env: Record<string, string> = {}): string {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) if (key.startsWith('POSTGRES_')) delete childEnv[key];
  return execFileSync(process.execPath, [SCRIPT], {
    cwd: workDir,
    env: { ...childEnv, ...env },
    encoding: 'utf8',
  });
}

describe('ensure-pepper local environment bootstrap', () => {
  beforeEach(() => {
    workDir = enterScratchDir('ensure-pepper-test');
  });
  afterEach(() => {
    leaveScratchDir(workDir);
  });

  it('creates .env.local with the docker-compose database URL and development secrets', () => {
    const output = run();

    const env = fs.readFileSync(ENV_FILE, 'utf8');
    expect(env).toMatch(/^DATABASE_URL=postgresql:\/\/devuser:devpass@localhost:5433\/site_dev$/m);
    expect(env).toMatch(/^SECURITY_PEPPER=[0-9a-f]{64}$/m);
    expect(env).toMatch(/^CLAIM_TOKEN_PEPPER=[0-9a-f]{64}$/m);
    expect(env).toMatch(/^ORIGIN_PROXY_SHARED_SECRET=[0-9a-f]{64}$/m);
    const pepper = /^SECURITY_PEPPER=(.+)$/m.exec(env)?.[1] ?? '';
    expect(output).toContain('Generated DATABASE_URL');
    expect(output).not.toContain(pepper);
    expect(fs.statSync(ENV_FILE).mode & 0o777).toBe(0o600);
  });

  it('follows the POSTGRES_* overrides that docker-compose uses', () => {
    run({ POSTGRES_USER: 'me', POSTGRES_PASSWORD: 'p@ss', POSTGRES_DB: 'guide', POSTGRES_PORT: '6543' });

    expect(fs.readFileSync(ENV_FILE, 'utf8'))
      .toMatch(/^DATABASE_URL=postgresql:\/\/me:p%40ss@localhost:6543\/guide$/m);
  });

  it('keeps an existing DATABASE_URL and is idempotent', () => {
    fs.writeFileSync(ENV_FILE, 'DATABASE_URL=postgresql://custom@db:5432/app\n');

    run();
    const first = fs.readFileSync(ENV_FILE, 'utf8');
    const output = run();

    expect(first.match(/^DATABASE_URL=/gm)).toHaveLength(1);
    expect(first).toContain('DATABASE_URL=postgresql://custom@db:5432/app');
    expect(fs.readFileSync(ENV_FILE, 'utf8')).toBe(first);
    expect(output).toContain('no action taken');
  });

  it('generates SECURITY_PEPPER when the existing line is empty', () => {
    fs.writeFileSync(ENV_FILE, 'SECURITY_PEPPER=\n');

    const output = run();

    expect(fs.readFileSync(ENV_FILE, 'utf8')).toMatch(/^SECURITY_PEPPER=[0-9a-f]{64}$/m);
    expect(output).toContain('Generated SECURITY_PEPPER');
  });

  it('generates SECURITY_PEPPER when the empty line is followed by other lines', () => {
    fs.writeFileSync(ENV_FILE, 'SECURITY_PEPPER=\nFOO=bar\n');

    const output = run();

    expect(fs.readFileSync(ENV_FILE, 'utf8')).toMatch(/^SECURITY_PEPPER=[0-9a-f]{64}$/m);
    expect(output).toContain('Generated SECURITY_PEPPER');
  });

  it('generates DATABASE_URL, CLAIM_TOKEN_PEPPER and ORIGIN_PROXY_SHARED_SECRET when empty lines are followed by other lines', () => {
    fs.writeFileSync(
      ENV_FILE,
      'DATABASE_URL=\nCLAIM_TOKEN_PEPPER=\nORIGIN_PROXY_SHARED_SECRET=\nFOO=bar\n',
    );

    run();

    const env = fs.readFileSync(ENV_FILE, 'utf8');
    expect(env).toMatch(/^DATABASE_URL=postgresql:\/\/devuser:devpass@localhost:5433\/site_dev$/m);
    expect(env).toMatch(/^CLAIM_TOKEN_PEPPER=[0-9a-f]{64}$/m);
    expect(env).toMatch(/^ORIGIN_PROXY_SHARED_SECRET=[0-9a-f]{64}$/m);
  });

  it('keeps a non-empty SECURITY_PEPPER', () => {
    fs.writeFileSync(ENV_FILE, 'SECURITY_PEPPER=abc\n');

    const output = run();

    const env = fs.readFileSync(ENV_FILE, 'utf8');
    expect(env.match(/^SECURITY_PEPPER=/gm)).toHaveLength(1);
    expect(env).toMatch(/^SECURITY_PEPPER=abc$/m);
    expect(output).not.toContain('Generated SECURITY_PEPPER');
  });
});
