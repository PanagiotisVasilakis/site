import { describe, expect, it, vi } from 'vitest';

describe('crypto secret bootstrap policy', () => {
  it('generates one process-local pepper in development when none is configured', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('SECURITY_PEPPER', '');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cryptoModule = await import('@/lib/crypto');
    const signed = cryptoModule.hashSensitive('value');
    expect(cryptoModule.verifySensitive('value', signed.salt, signed.hash)).toBe(true);
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('fails module initialization when production has no pepper', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', '');
    vi.stubEnv('SECURITY_PEPPER', '');
    await expect(import('@/lib/crypto')).rejects.toThrow('SECURITY_PEPPER');
  });

  it('allows an ephemeral build-phase pepper without weakening runtime production', async () => {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    vi.stubEnv('SECURITY_PEPPER', '');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const cryptoModule = await import('@/lib/crypto');
    expect(cryptoModule.hashSensitive('build-value').hash).toMatch(/^[a-f0-9]{64}$/);
    expect(warning).not.toHaveBeenCalled();
  });
});
