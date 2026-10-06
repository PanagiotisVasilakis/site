import { describe, expect, it } from 'vitest';

import { describeMonths, fill, formatStayDate, formatStayRange, nightsLabel } from '@/components/availability/format';
import type { IsoDate } from '@/lib/availability/calendarDate';

describe('availability text formatting', () => {
  it('fills known placeholders and keeps unknown ones', () => {
    expect(fill('{nights} × {price}', { nights: '3 nights', price: '€80' })).toBe('3 nights × €80');
    expect(fill('{a} and {missing}', { a: 1 })).toBe('1 and {missing}');
    expect(fill('{toString}', {})).toBe('{toString}');
  });

  it('describes month ranges, including ones that wrap the year', () => {
    expect(describeMonths([4, 5, 6, 7, 8, 9, 10], 'en')).toBe('April–October');
    expect(describeMonths([11, 12, 1, 2, 3], 'en')).toBe('November–March');
    expect(describeMonths([11, 12, 1, 2, 3], 'el')).toBe('Νοέμβριος–Μάρτιος');
    expect(describeMonths([7], 'en')).toBe('July');
    expect(describeMonths([1, 2, 7, 12], 'en')).toBe('July, December–February');
    expect(describeMonths([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'en')).toBe('January–December');
    expect(describeMonths([], 'en')).toBe('');
    expect(describeMonths([0, 13, 2.5], 'en')).toBe('');
  });

  it('describes month ranges with short names for the stay summary', () => {
    expect(describeMonths([4, 5, 6, 7, 8, 9, 10], 'en', 'short')).toBe('Apr–Oct');
    expect(describeMonths([11, 12, 1, 2, 3], 'el', 'short')).toBe('Νοέ–Μάρ');
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
