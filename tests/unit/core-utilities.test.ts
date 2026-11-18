import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BOOKING_COM_LISTING_URL } from '@/data/contact';
import { ApiErrorCode } from '@/lib/apiErrorTypes';
import { isBookingComListingUrl, mapsHref, telHref } from '@/lib/contactLinks';
import { serializeJsonLd } from '@/lib/jsonLd';
import { toSafeLocalPath } from '@/lib/safeLocalPath';
import { absUrl, siteUrl } from '@/lib/site';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';
import { whatsappHref } from '@/lib/whatsapp';

describe('core utility contracts', () => {
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
    ['/.//evil.example'],
    ['/a/..//evil.example/x?y=1#z'],
  ])('rejects unsafe redirect input %s', (input) => {
    expect(toSafeLocalPath(input, 'https://guest.test/start')).toBeNull();
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

  it('names the real rate-limit wait in English and Greek (R-443)', () => {
    const rateLimited = { error: { code: ApiErrorCode.RATE_LIMITED } };

    expect(mapApiErrorToUI(rateLimited, 'en').summary).toBe('Too many attempts. Please wait up to an hour and try again.');
    expect(mapApiErrorToUI(rateLimited, 'el').summary).toBe('Πάρα πολλές προσπάθειες. Περιμένετε έως μία ώρα και δοκιμάστε ξανά.');
  });

  it('uses localized safe fallbacks for unknown errors', () => {
    expect(mapApiErrorToUI(null).summary).toContain('Something went wrong');
    expect(mapApiErrorToUI({ error: { code: ApiErrorCode.GATEWAY_TIMEOUT } }, 'el').summary).toContain('προσωρινά');
  });
});

describe('application URL configuration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('uses only NEXT_PUBLIC_SITE_URL for an explicitly configured origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'guest.example');
    vi.stubEnv('VERCEL_URL', 'legacy.example');

    const { siteUrl: configuredSiteUrl } = await import('@/lib/site');

    expect(configuredSiteUrl).toBe('https://guest.example');
  });

  it('does not treat VERCEL_URL as an application origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_URL', 'legacy.example');

    const { siteUrl: fallbackSiteUrl } = await import('@/lib/site');

    expect(fallbackSiteUrl).toBe('http://localhost:3000');
  });
});

describe('whatsappHref', () => {
  it('encodes the prefilled text and rejects blank phones', () => {
    expect(whatsappHref('+30 695 581 0051', 'Check-in: 7 Oct & check-out: 10 Oct?'))
      .toBe('https://wa.me/306955810051?text=Check-in%3A%207%20Oct%20%26%20check-out%3A%2010%20Oct%3F');
    expect(whatsappHref('+30 695 581 0051', 'Άφιξη'))
      .toBe(`https://wa.me/306955810051?text=${encodeURIComponent('Άφιξη')}`);
    expect(whatsappHref('+30 695 581 0051', '')).toBe('https://wa.me/306955810051');
    expect(() => whatsappHref('+ -')).toThrow(RangeError);
  });
});

describe('isBookingComListingUrl', () => {
  it.each([
    BOOKING_COM_LISTING_URL,
    'https://booking.com/Share-AiCapK',
    'https://www.booking.com/Share-AiCapK?aid=123',
  ])('accepts %s', (url) => {
    expect(isBookingComListingUrl(url)).toBe(true);
  });

  it.each([
    'not a url',
    'http://www.booking.com/Share-AiCapK',
    'https://www.booking.com.evil.test/Share-AiCapK',
    'https://user:pass@www.booking.com/Share-AiCapK',
    'https://www.booking.com:8443/Share-AiCapK',
    'https://www.booking.com/',
    'https://www.booking.com/Share-',
    'https://www.booking.com/Share-AiCapK/extra',
  ])('rejects %j', (url) => {
    expect(isBookingComListingUrl(url)).toBe(false);
  });
});
