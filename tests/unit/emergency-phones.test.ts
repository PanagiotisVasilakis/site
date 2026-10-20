import { describe, expect, it } from 'vitest';

import { telHref } from '@/lib/contactLinks';
import { getItemsByCategory } from '@/lib/data';

/** A dialable tel: URI: an international number (+ and 8-15 digits) or a 3-4 digit Greek short code. */
const TEL_URI = /^tel:(\+\d{8,15}|\d{3,4})$/u;
const GREEK = /\p{Script=Greek}/u;

const emergency = getItemsByCategory('phones').filter((item) => item.tags?.includes('emergency'));

// Owner decision of 2026-10-14: the taxi and hospital numbers are the Kalamata numbers the site already had; the taxi entry keeps its alternate numbers +30 27210 26565 and +30 27210 90999. The other names follow circular 19567/25-09-2025 (the corrected re-issue of 19231/19.09.2025).
// TODO(owner): before launch confirm 1571 (astynomia.gr: 24h, EL/EN/FR/DE; read only as excerpts) against the sourceUrls in src/data/items/phones.json.
describe('emergency phones content (R3-L10; list of circular 19567/25-09-2025)', () => {
  it('lists 112, 166, 199, 100, 108, 1056, 1571, the Poison Centre, the hospital and the taxi', () => {
    const numbers = emergency.map((item) => telHref(item.phone));
    for (const number of ['tel:112', 'tel:166', 'tel:199', 'tel:100', 'tel:108', 'tel:1056', 'tel:1571', 'tel:+302107793777']) {
      expect(numbers, number).toContain(number);
    }
    // The hospital and the taxi carry no 'emergency' tag, so they are checked across all phone items.
    const allNumbers = getItemsByCategory('phones').map((item) => telHref(item.phone));
    for (const number of ['tel:+302721363000', 'tel:+302721021112']) {
      expect(allNumbers, number).toContain(number);
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
