import { describe, expect, it } from 'vitest';

import { BOOKING_COM_LISTING_URL } from '@/data/contact';
import { isBookingComListingUrl } from '@/lib/contactLinks';
import { whatsappHref } from '@/lib/whatsapp';

describe('whatsappHref', () => {
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

describe('isBookingComListingUrl', () => {
  it.each([
    BOOKING_COM_LISTING_URL,
    'https://booking.com/Share-AiCapK',
    'https://www.booking.com/Share-AiCapK?aid=123',
  ])('accepts %s', (url) => {
    expect(isBookingComListingUrl(url)).toBe(true);
  });

  it.each([
    '',
    'not a url',
    'http://www.booking.com/Share-AiCapK',
    'https://www.booking.com.evil.test/Share-AiCapK',
    'https://example.com/Share-AiCapK',
    'https://user:pass@www.booking.com/Share-AiCapK',
    'https://www.booking.com:8443/Share-AiCapK',
    'https://www.booking.com/',
    'https://www.booking.com/Share-',
    'https://www.booking.com/Share-AiCapK/extra',
  ])('rejects %j', (url) => {
    expect(isBookingComListingUrl(url)).toBe(false);
  });
});
