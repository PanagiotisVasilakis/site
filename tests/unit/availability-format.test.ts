import { describe, expect, it } from 'vitest';

import { fill, formatStayDate, formatStayRange, nightsLabel } from '@/components/availability/format';
import type { IsoDate } from '@/lib/availability/calendarDate';

describe('availability text formatting', () => {
  it('fills known placeholders and keeps unknown ones', () => {
    expect(fill('{nights} × {price}', { nights: '3 nights', price: '€80' })).toBe('3 nights × €80');
    expect(fill('{a} and {missing}', { a: 1 })).toBe('1 and {missing}');
    expect(fill('{toString}', {})).toBe('{toString}');
  });

  it('formats a stay as a compact range with an en dash', () => {
    const d = (value: string) => value as IsoDate;
    expect(formatStayRange(d('2026-10-18'), d('2026-10-23'), 'en')).toBe('18–23 Oct');
    expect(formatStayRange(d('2026-10-30'), d('2026-11-02'), 'en')).toBe('30 Oct – 2 Nov');
    expect(formatStayRange(d('2026-12-30'), d('2027-01-02'), 'en')).toBe('30 Dec 2026 – 2 Jan 2027');
    expect(formatStayRange(d('2026-10-18'), d('2026-10-23'), 'el')).toBe('18–23 Οκτ');
  });

  it('formats stay dates and night counts in both languages', () => {
    expect(formatStayDate('2026-10-23' as IsoDate, 'en')).toBe('Fri 23 Oct 2026');
    expect(formatStayDate('2026-10-23' as IsoDate, 'el')).toBe('Παρ 23 Οκτ 2026');
    const forms = { one: '{count} night', other: '{count} nights' };
    expect(nightsLabel(1, forms, 'en')).toBe('1 night');
    expect(nightsLabel(2, forms, 'el')).toBe('2 nights');
  });
});
