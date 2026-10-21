import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SYNTHETIC_PRODUCTION_ENVIRONMENT } from '../../scripts/lib/release-gates.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const PLACEHOLDER_PEPPER = 'replace-me-with-a-long-random-pepper-value';

// Stands in for the standalone server.js: a module without side effects that the gate may import.
const SERVER_STAND_IN = 'scripts/lib/release-gates.mjs';

// A complete, valid production environment with the given variables replaced; `undefined` removes one.
function start(overrides: Record<string, string | undefined>) {
  const environment: Record<string, string> = { ...SYNTHETIC_PRODUCTION_ENVIRONMENT };
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) delete environment[name];
    else environment[name] = value;
  }
  return spawnSync(process.execPath, ['scripts/start-standalone.mjs', SERVER_STAND_IN], {
    cwd: REPOSITORY_ROOT,
    env: environment as NodeJS.ProcessEnv,
    encoding: 'utf8',
    shell: false,
  });
}

describe('standalone start-up gate', () => {
  it('validates as production when NODE_ENV is unset, as `npm start` runs it', () => {
    const result = start({ NODE_ENV: undefined, SECURITY_PEPPER: PLACEHOLDER_PEPPER });

    expect(result.status).toBe(78);
    expect(result.stderr).toContain('SECURITY_PEPPER');
    expect(result.stdout).not.toContain('Environment validation passed');
    expect(`${result.stdout}${result.stderr}`).not.toContain(PLACEHOLDER_PEPPER);
  });

  it.each(['development', 'test'])('does not let NODE_ENV=%s weaken the gate', (nodeEnv) => {
    const result = start({ NODE_ENV: nodeEnv, SECURITY_PEPPER: PLACEHOLDER_PEPPER });

    expect(result.status).toBe(78);
    expect(result.stdout).not.toContain('Environment validation passed');
  });

  it('requires the origin proxy attestation secret when NODE_ENV is unset', () => {
    const result = start({ NODE_ENV: undefined, ORIGIN_PROXY_SHARED_SECRET: undefined });

    expect(result.status).toBe(78);
    expect(result.stderr).toContain('ORIGIN_PROXY_SHARED_SECRET');
  });

  it('starts when a valid production environment leaves NODE_ENV unset', () => {
    const result = start({ NODE_ENV: undefined });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Environment validation passed');
  });
});
