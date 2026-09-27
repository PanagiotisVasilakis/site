import { afterEach, describe, expect, it, vi } from 'vitest';

async function productionConnectSrc(): Promise<string[]> {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  const { getSecurityConfig } = await import('@/lib/security-config');
  return getSecurityConfig().csp.directives.connectSrc;
}

describe('CSP connect-src for the routing service', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('allows the OSRM origin the map is configured to call', async () => {
    vi.stubEnv('NEXT_PUBLIC_OSRM_BASE_URL', 'https://osrm.example.org/routing/');

    const connectSrc = await productionConnectSrc();

    expect(connectSrc).toEqual(["'self'", 'https://osrm.example.org']);
  });

  it('keeps the public OSRM demo server as the default', async () => {
    vi.stubEnv('NEXT_PUBLIC_OSRM_BASE_URL', '');

    expect(await productionConnectSrc()).toEqual(["'self'", 'https://router.project-osrm.org']);
  });
});
