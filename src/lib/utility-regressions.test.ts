import { act, renderHook } from '@testing-library/react';
import { ApiErrorCode } from '@/lib/apiErrorTypes';
import { absUrl, normalizeExternalUrl, siteUrl } from '@/lib/site';
import { serializeJsonLd } from '@/lib/jsonLd';
import { formatTravelChip } from '@/lib/travelFormat';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';
import { internalGet, internalPost } from '@/lib/internalFetch';
import { createStorageAdapter } from '@/lib/storageAdapter';
import { useFavorites } from '@/lib/favorites';

describe('small shared utility regressions', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANALYTICS_STORAGE;
    delete (globalThis as typeof globalThis & { ANALYTICS_KV?: unknown }).ANALYTICS_KV;
    localStorage.clear();
  });

  it('builds canonical URLs and replaces only the seeded placeholder origin', () => {
    expect(absUrl('en/apartment')).toBe(`${siteUrl}/en/apartment`);
    expect(normalizeExternalUrl('https://yourdomain.example/en')).toBe(`${siteUrl}/en`);
    expect(normalizeExternalUrl('https://external.example/path')).toBe('https://external.example/path');
    expect(normalizeExternalUrl()).toBeUndefined();
  });

  it('escapes script terminators and HTML-sensitive characters in JSON-LD', () => {
    const serialized = serializeJsonLd({ name: '</script><img>&' });
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(serialized)).toEqual({ name: '</script><img>&' });
  });

  it('formats travel distance and duration boundaries', () => {
    expect(formatTravelChip('foot', 750, 1_800)).toContain('🚶');
    expect(formatTravelChip('driving', 12_400, 5_400)).toContain('12km • 1h30m');
    expect(formatTravelChip('cycling')).toBe('');
  });

  it('maps validation and availability failures to localized safe UI data', () => {
    const validation = mapApiErrorToUI({
      error: {
        code: ApiErrorCode.VALIDATION_ERROR,
        details: { validationErrors: [{ path: 'guest.email', message: 'Invalid email' }] },
      },
    });
    expect(validation).toEqual(expect.objectContaining({
      fields: { 'guest.email': 'Invalid email' },
      details: ['Invalid email'],
    }));
    expect(mapApiErrorToUI({ error: { code: ApiErrorCode.SERVICE_UNAVAILABLE } }, 'el').summary)
      .toContain('προσωρινά');
    expect(mapApiErrorToUI(null).summary).toContain('Something went wrong');
  });

  it('enforces relative internal requests and propagates non-success status', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ value: 2 }) })
      .mockResolvedValueOnce({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(internalGet<{ value: number }>('/api/value')).resolves.toEqual({ value: 1 });
    await expect(internalPost<{ value: number }>('/api/value', { input: true })).resolves.toEqual({ value: 2 });
    await expect(internalGet('/api/failure')).rejects.toThrow('Request failed: 503');
    await expect(internalGet('https://external.test')).rejects.toThrow('relative path');
  });

  it('provides safe no-op and KV analytics persistence adapters', () => {
    process.env.ANALYTICS_STORAGE = 'none';
    const noop = createStorageAdapter();
    expect(noop.load()).toEqual({ hits: [], vitals: [], firstSeen: {} });
    expect(noop.save({ hits: [], vitals: [], firstSeen: {} })).toBeUndefined();
    expect(noop.backup?.()).toBeUndefined();
    expect(noop.restore?.('anything')).toBeNull();
    expect(noop.listBackups?.()).toEqual([]);

    const put = vi.fn();
    (globalThis as typeof globalThis & { ANALYTICS_KV?: { get: () => string; put: typeof put } }).ANALYTICS_KV = {
      get: () => JSON.stringify({ hits: [], vitals: [], firstSeen: { '/': 1 } }),
      put,
    };
    process.env.ANALYTICS_STORAGE = 'kv';
    const kv = createStorageAdapter();
    expect(kv.load().firstSeen).toEqual({ '/': 1 });
    kv.save({ hits: [], vitals: [], firstSeen: { '/': 1 } });
    expect(put).toHaveBeenCalledWith('analytics:data:v1', expect.any(String));
  });

  it('synchronizes favorite toggles with local storage', () => {
    localStorage.setItem('favorites:v1', JSON.stringify(['first']));
    const { result } = renderHook(() => useFavorites());
    expect(result.current.isFavorite('first')).toBe(true);
    act(() => result.current.toggle('second'));
    expect(result.current.isFavorite('second')).toBe(true);
    expect(JSON.parse(localStorage.getItem('favorites:v1') || '[]')).toContain('second');
  });
});
