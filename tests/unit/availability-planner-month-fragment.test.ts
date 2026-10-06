import { describe, expect, it } from 'vitest';

import { parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';
import { readMonthFragment } from '@/components/availability/plannerState';

function iso(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error(`test fixture is not an ISO date: ${value}`);
  return parsed;
}

const TODAY = iso('2026-10-05');
const HORIZON_END = iso('2027-10-01');

describe('readMonthFragment', () => {
  it.each([
    ['#m=2026-10', '2026-10-01'],
    ['#m=2027-09', '2027-09-01'],
    ['m=2027-06', '2027-06-01'],
  ])('opens %s on %s', (hash, expected) => {
    expect(readMonthFragment(hash, TODAY, HORIZON_END)).toBe(expected);
  });

  it.each([
    // Before today's month.
    '#m=2026-09',
    '#m=2025-12',
    // From the horizon end on (no night left in that month).
    '#m=2027-10',
    '#m=2028-06',
    // Malformed.
    '#m=2027-13',
    '#m=2027-00',
    '#m=2027-6',
    '#m=27-06',
    '#m=2027-06-15',
    '#m=',
    '#checkin=2026-10-07',
    '',
  ])('ignores %s', (hash) => {
    expect(readMonthFragment(hash, TODAY, HORIZON_END)).toBeNull();
  });

  it('opens the horizon-end month while it still has a night before a mid-month horizon end', () => {
    expect(readMonthFragment('#m=2027-10', TODAY, iso('2027-10-15'))).toBe('2027-10-01');
    expect(readMonthFragment('#m=2027-11', TODAY, iso('2027-10-15'))).toBeNull();
  });
});
