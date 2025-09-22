import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { internalFetch } from './internalFetchClient';

describe('internalFetch', () => {
  const originalFetch = global.fetch;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch as any;
  });

  it('logs warn on non-OK response', async () => {
  global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized', url: '/api/test' } as any);
    const res = await internalFetch('/api/test');
    expect(res.ok).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('logs debug (not error) for aborts', async () => {
    const abortErr = new DOMException('Aborted', 'AbortError');
  global.fetch = vi.fn().mockRejectedValue(abortErr as any);
    await expect(internalFetch('/api/test')).rejects.toBe(abortErr);
    expect(debugSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs error for network failures', async () => {
    const netErr = new Error('Network down');
  global.fetch = vi.fn().mockRejectedValue(netErr as any);
    await expect(internalFetch('/api/test')).rejects.toBe(netErr);
    expect(errorSpy).toHaveBeenCalled();
  });
});
