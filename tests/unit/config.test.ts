import { afterEach, describe, expect, it, vi } from 'vitest';

describe('application URL configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses only NEXT_PUBLIC_SITE_URL for an explicitly configured origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'guest.example');
    vi.stubEnv('VERCEL_URL', 'legacy.example');

    const { config } = await import('@/lib/config');

    expect(config.absoluteSiteUrl()).toBe('https://guest.example');
  });

  it('does not treat VERCEL_URL as an application origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_URL', 'legacy.example');

    const { config } = await import('@/lib/config');

    expect(config.absoluteSiteUrl()).toBe('http://localhost:3000');
  });
});
