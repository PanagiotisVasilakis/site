import { formatDateRange, getNights, validateDateRange } from '@/lib/dateUtils';

describe('date utility calendar semantics', () => {
  it('counts calendar nights instead of rounding elapsed DST hours', () => {
    const from = new Date('2026-10-24T12:00:00+03:00');
    const to = new Date('2026-10-25T12:00:00+02:00');

    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(25);
    expect(getNights({ from, to })).toBe(1);
  });

  it('formats Greek dates with the Greek locale', () => {
    const value = formatDateRange({
      from: new Date(2030, 8, 10),
      to: new Date(2030, 8, 12),
    }, 'el');

    expect(value).toMatch(/Σεπ/i);
    expect(value).not.toMatch(/Sep\b/i);
  });

  it('returns localized validation errors', () => {
    const from = new Date(2030, 8, 12);
    const to = new Date(2030, 8, 10);
    expect(validateDateRange({ from, to }, 'el')).toEqual({
      valid: false,
      error: 'Η αναχώρηση πρέπει να είναι μετά την άφιξη',
    });
  });
});
