import { describe, expect, it } from 'vitest';

import { telHref } from '@/lib/contactLinks';
import { getItemsByCategory } from '@/lib/data';

/** A dialable tel: URI: an international number (+ and 8-15 digits) or a 3-4 digit Greek short code. */
const TEL_URI = /^tel:(\+\d{8,15}|\d{3,4})$/u;
const GREEK = /\p{Script=Greek}/u;

const emergency = getItemsByCategory('phones').filter((item) => item.tags?.includes('emergency'));

describe('emergency phones content (R3-L10, L. 5170/2025 list)', () => {
  it('lists 112, 166, 199, 100, 108, 1056 and the Poison Centre', () => {
    const numbers = emergency.map((item) => telHref(item.phone));
    for (const number of ['tel:112', 'tel:166', 'tel:199', 'tel:100', 'tel:108', 'tel:1056', 'tel:+302107793777']) {
      expect(numbers, number).toContain(number);
    }
  });

  it('gives every emergency entry an English and a Greek name and a dialable number', () => {
    expect(emergency.length).toBeGreaterThan(0);
    for (const item of emergency) {
      const english = item.name_en ?? item.name;
      expect(english.trim(), item.id).not.toBe('');
      expect(english, item.id).not.toMatch(GREEK);
      expect(item.name_el?.trim(), item.id).toBeTruthy();
      expect(item.name_el, item.id).toMatch(GREEK);
      expect(item.name_el, item.id).toBe(item.name_el?.normalize('NFC'));
      expect(telHref(item.phone), item.id).toMatch(TEL_URI);
    }
  });

  it('keeps one entry per number', () => {
    const numbers = emergency.map((item) => telHref(item.phone));
    expect(new Set(numbers).size).toBe(numbers.length);
  });
});
