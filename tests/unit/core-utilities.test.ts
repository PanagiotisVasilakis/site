import { describe, expect, it, vi } from 'vitest';

import { ApiErrorCode } from '@/lib/apiErrorTypes';
import { dedupeById } from '@/lib/collections';
import { mapsHref, telHref } from '@/lib/contactLinks';
import { csvRow } from '@/lib/csv';
import { internalGet, internalPost } from '@/lib/internalFetch';
import { serializeJsonLd } from '@/lib/jsonLd';
import {
  formatTraceContextHeaders,
  parseTraceContextHeaders,
} from '@/lib/observability-contracts';
import { toSafeLocalPath } from '@/lib/safeLocalPath';
import { absUrl, normalizeExternalUrl, siteUrl } from '@/lib/site';
import { formatTravelChip } from '@/lib/travelFormat';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';

describe('core utility contracts', () => {
  it('deduplicates by id while preserving first-seen order and value', () => {
    expect(dedupeById([
      { id: 'first', value: 1 },
      { id: 'second', value: 2 },
      { id: 'first', value: 3 },
    ])).toEqual([
      { id: 'first', value: 1 },
      { id: 'second', value: 2 },
    ]);
  });

  it('builds safe phone and maps links', () => {
    expect(telHref('+30 (695) 123-4567')).toBe('tel:+306951234567');
    expect(telHref()).toBeUndefined();
    expect(mapsHref('Archimidous 21, Kalamata')).toContain('Archimidous%2021%2C%20Kalamata');
    expect(mapsHref(undefined, 37.04, 22.09)).toBe('https://maps.google.com/?q=37.04,22.09');
    expect(mapsHref()).toBeUndefined();
  });

  it.each([
    ['/en/check-in?from=portal#details', '/en/check-in?from=portal#details'],
    ['https://guest.test/en', '/en'],
    ['/el/about', '/el/about'],
  ])('accepts same-origin navigation %s', (input, expected) => {
    expect(toSafeLocalPath(input, 'https://guest.test/start')).toBe(expected);
  });

  it.each([
    ['//evil.test/path'],
    ['https://evil.test/path'],
    ['java' + 'script:alert(1)'],
    ['relative/path'],
    ['/safe%2f..%2fadmin'],
    ['/safe\\admin'],
    ['/safe\nadmin'],
  ])('rejects unsafe redirect input %s', (input) => {
    expect(toSafeLocalPath(input, 'https://guest.test/start')).toBeNull();
  });

  it('neutralizes spreadsheet formulas and escapes CSV quotes', () => {
    expect(csvRow(['normal', 'one,"two"', '=1+1', null])).toBe(
      '"normal","one,""two""","\'=1+1",""\n',
    );
  });

  it('serializes JSON-LD without executable HTML delimiters', () => {
    const serialized = serializeJsonLd({ value: '</script><img src=x>&' });
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(JSON.parse(serialized)).toEqual({ value: '</script><img src=x>&' });
  });

  it('builds canonical site URLs without rewriting unrelated origins', () => {
    expect(absUrl('en/apartment')).toBe(`${siteUrl}/en/apartment`);
    expect(absUrl('/el/about')).toBe(`${siteUrl}/el/about`);
    expect(normalizeExternalUrl('https://yourdomain.example/en')).toBe(`${siteUrl}/en`);
    expect(normalizeExternalUrl('https://external.example/path')).toBe('https://external.example/path');
    expect(normalizeExternalUrl()).toBeUndefined();
  });

  it.each([
    ['foot', 750, 1_800, '🚶', '750m • 30m'],
    ['driving', 12_400, 5_400, '🚗', '12km • 1h30m'],
    ['cycling', 1_250, 3_600, '🚲', '1.3km • 1h'],
  ] as const)('formats %s travel metrics', (mode, distance, duration, icon, text) => {
    expect(formatTravelChip(mode, distance, duration)).toContain(icon);
    expect(formatTravelChip(mode, distance, duration)).toContain(text);
  });

  it('returns an empty travel chip for incomplete metrics', () => {
    expect(formatTravelChip('foot')).toBe('');
    expect(formatTravelChip('foot', 100, 0)).toBe('');
  });

  it('parses and formats W3C and legacy trace context safely', () => {
    const traceId = 'a'.repeat(32);
    const spanId = 'b'.repeat(16);
    const context = parseTraceContextHeaders({ traceparent: `00-${traceId}-${spanId}-01` });
    expect(context).toEqual({ traceId, spanId, flags: 1 });
    expect(formatTraceContextHeaders({ traceId, spanId, flags: 300 })).toEqual({
      traceparent: `00-${traceId}-${spanId}-ff`,
      'x-trace-id': `${traceId}:${spanId}`,
    });
    expect(parseTraceContextHeaders({ 'x-trace-id': `${traceId}:${spanId}` })).toEqual({ traceId, spanId, flags: 1 });
  });

  it.each([
    `00-${'0'.repeat(32)}-${'b'.repeat(16)}-01`,
    `00-${'a'.repeat(32)}-${'0'.repeat(16)}-01`,
    `01-${'a'.repeat(32)}-${'b'.repeat(16)}-01`,
    'malformed',
  ])('rejects malformed trace context %s', (traceparent) => {
    expect(parseTraceContextHeaders({ traceparent })).toBeNull();
  });

  it('maps validation errors to bounded field-safe UI data', () => {
    const error = mapApiErrorToUI({
      error: {
        code: ApiErrorCode.VALIDATION_ERROR,
        details: {
          validationErrors: [
            { path: 'guest.phone', message: 'Invalid phone' },
            { path: 'guest.password' },
          ],
        },
      },
    });
    expect(error).toEqual(expect.objectContaining({
      fields: {
        'guest.phone': 'Invalid phone',
        'guest.password': 'Invalid value',
      },
      details: ['Invalid phone'],
    }));
  });

  it.each([
    [ApiErrorCode.UNAUTHORIZED, 'verify your identity'],
    [ApiErrorCode.NOT_FOUND, 'matching record'],
    [ApiErrorCode.RATE_LIMITED, 'Too many attempts'],
    [ApiErrorCode.FORBIDDEN, "don't have permission"],
    [ApiErrorCode.SERVICE_UNAVAILABLE, 'temporarily unavailable'],
  ])('maps %s to a stable message', (code, expected) => {
    expect(mapApiErrorToUI({ error: { code } }).summary).toContain(expected);
  });

  it('uses localized safe fallbacks for unknown errors', () => {
    expect(mapApiErrorToUI(null).summary).toContain('Something went wrong');
    expect(mapApiErrorToUI({ error: { code: ApiErrorCode.GATEWAY_TIMEOUT } }, 'el').summary).toContain('προσωρινά');
  });

  it('enforces relative internal fetches and JSON request semantics', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: 1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ value: 2 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(internalGet<{ value: number }>('/api/value')).resolves.toEqual({ value: 1 });
    await expect(internalPost<{ value: number }>('/api/value', { input: true })).resolves.toEqual({ value: 2 });
    await expect(internalGet('/api/failure')).rejects.toThrow('Request failed: 503');
    await expect(internalGet('https://external.test')).rejects.toThrow('relative path');
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/value', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ input: true }),
    }));
  });
});
