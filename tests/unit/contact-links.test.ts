import { describe, expect, it, vi } from 'vitest';

const flags = vi.hoisted(() => ({ datesVerified: false }));

vi.mock('@/data/contact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/contact')>()),
  get AIRBNB_DATE_PARAMS_VERIFIED() {
    return flags.datesVerified;
  },
}));

import { AIRBNB_LISTING_URL } from '@/data/contact';
import type { IsoDate } from '@/lib/availability/calendarDate';
import { airbnbListingHref, isAirbnbListingUrl } from '@/lib/contactLinks';
import { whatsappHref } from '@/lib/whatsapp';

const stay = { checkIn: '2026-10-07' as IsoDate, checkOut: '2026-10-10' as IsoDate };

describe('whatsappHref', () => {
  it('keeps only the digits of the phone number', () => {
    expect(whatsappHref('+30 695 581 0051')).toBe('https://wa.me/306955810051');
  });

  it('encodes the prefilled text', () => {
    expect(whatsappHref('+30 695 581 0051', 'Check-in: 7 Oct & check-out: 10 Oct?'))
      .toBe('https://wa.me/306955810051?text=Check-in%3A%207%20Oct%20%26%20check-out%3A%2010%20Oct%3F');
    expect(whatsappHref('+30 695 581 0051', 'Άφιξη')).toBe(`https://wa.me/306955810051?text=${encodeURIComponent('Άφιξη')}`);
  });

  it('adds no text parameter for empty text', () => {
    expect(whatsappHref('+30 695 581 0051', '')).toBe('https://wa.me/306955810051');
  });

  it('rejects a phone number without digits', () => {
    expect(() => whatsappHref('+ -')).toThrow(RangeError);
  });
});

describe('isAirbnbListingUrl', () => {
  it.each([
    'https://www.airbnb.com/rooms/12345678',
    'https://airbnb.com/rooms/12345678',
    'https://www.airbnb.gr/rooms/12345678',
    'https://airbnb.gr/rooms/12345678',
    'https://www.airbnb.com/rooms/12345678?source_impression_id=p3_1',
  ])('accepts %s', (url) => {
    expect(isAirbnbListingUrl(url)).toBe(true);
  });

  it.each([
    '',
    'not a url',
    'http://www.airbnb.com/rooms/12345678',
    'https://www.airbnb.com.evil.test/rooms/12345678',
    'https://evil.test/rooms/12345678',
    'https://user:pass@www.airbnb.com/rooms/12345678',
    'https://www.airbnb.com:8443/rooms/12345678',
    'https://www.airbnb.com/',
    'https://www.airbnb.com/rooms/abc',
    'https://www.airbnb.com/rooms/12345678/extra',
    'ftp://www.airbnb.com/rooms/12345678',
  ])('rejects %j', (url) => {
    expect(isAirbnbListingUrl(url)).toBe(false);
  });

  it('is empty until the owner supplies the listing (the button stays hidden)', () => {
    expect(AIRBNB_LISTING_URL).toBe('');
    expect(isAirbnbListingUrl(AIRBNB_LISTING_URL)).toBe(false);
  });
});

describe('airbnbListingHref', () => {
  const listing = 'https://www.airbnb.com/rooms/12345678?source_impression_id=p3_1';

  it('returns the listing URL unchanged while the date parameters are unverified', () => {
    flags.datesVerified = false;
    expect(airbnbListingHref(listing, stay)).toBe(listing);
    expect(airbnbListingHref(listing)).toBe(listing);
  });

  it('adds the stay dates only once the date parameters are verified', () => {
    flags.datesVerified = true;
    try {
      expect(airbnbListingHref(listing, stay))
        .toBe('https://www.airbnb.com/rooms/12345678?source_impression_id=p3_1&check_in=2026-10-07&check_out=2026-10-10');
      expect(airbnbListingHref(listing)).toBe(listing);
    } finally {
      flags.datesVerified = false;
    }
  });
});
