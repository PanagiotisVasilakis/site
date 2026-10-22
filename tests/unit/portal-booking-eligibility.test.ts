import { describe, expect, it } from 'vitest';

import { PROPERTY_TIME_ZONE } from '@/data/stayPolicy';
import { propertyToday } from '@/lib/availability/calendarDate';
import {
  createPortalBookingEligibilityWindow,
  isPortalBookingEligible,
  isPortalBookingTemporallyEligible,
  portalBookingTemporalWhere,
} from '@/lib/portalBookingEligibility';

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function eligibilityFor(
  capturedNow: string,
  startDate: string,
  endDate: string,
): boolean {
  return isPortalBookingTemporallyEligible(
    { startDate: dateOnly(startDate), endDate: dateOnly(endDate) },
    createPortalBookingEligibilityWindow(new Date(capturedNow)),
  );
}

describe('portal booking temporal eligibility', () => {
  it('builds the inclusive seven-calendar-day query window from one captured UTC date', () => {
    const window = createPortalBookingEligibilityWindow(
      new Date('2030-06-15T23:59:59.999Z'),
    );

    expect(window).toEqual({
      businessToday: dateOnly('2030-06-15'),
      inclusiveMaximumStartDate: dateOnly('2030-06-22'),
    });
    expect(portalBookingTemporalWhere(window)).toEqual({
      startDate: { lte: dateOnly('2030-06-22') },
      endDate: { gte: dateOnly('2030-06-15') },
    });
  });

  it.each([
    ['starts today', '2030-06-15', '2030-06-18', true],
    ['starts in one day', '2030-06-16', '2030-06-18', true],
    ['starts in exactly seven days', '2030-06-22', '2030-06-29', true],
    ['starts in eight days', '2030-06-23', '2030-06-30', false],
    ['starts in thirty days', '2030-07-15', '2030-07-22', false],
    ['ended yesterday', '2030-06-01', '2030-06-14', false],
    ['ends today', '2030-06-01', '2030-06-15', true],
    ['is already in progress', '2030-06-12', '2030-06-18', true],
    ['has an inverted date range', '2030-06-18', '2030-06-17', false],
  ])('%s', (_label, startDate, endDate, expected) => {
    expect(eligibilityFor(
      '2030-06-15T12:34:56.789Z',
      startDate,
      endDate,
    )).toBe(expected);
  });

  it.each([
    [
      'crosses a month end',
      '2030-01-29T18:00:00.000Z',
      '2030-01-29',
      '2030-02-05',
    ],
    [
      'crosses a year end',
      '2030-12-28T18:00:00.000Z',
      '2030-12-28',
      '2031-01-04',
    ],
    [
      'crosses leap day',
      '2032-02-23T18:00:00.000Z',
      '2032-02-23',
      '2032-03-01',
    ],
  ])('%s using calendar arithmetic', (_label, capturedNow, today, maximumStart) => {
    expect(createPortalBookingEligibilityWindow(new Date(capturedNow))).toEqual({
      businessToday: dateOnly(today),
      inclusiveMaximumStartDate: dateOnly(maximumStart),
    });
  });

  it.each([
    ['European spring transition', '2030-03-31T00:30:00.000Z', '2030-04-07'],
    ['European autumn transition', '2030-10-27T00:30:00.000Z', '2030-11-03'],
  ])('keeps DATE boundaries independent of elapsed DST hours at the %s', (
    _label,
    capturedNow,
    maximumStart,
  ) => {
    const window = createPortalBookingEligibilityWindow(new Date(capturedNow));

    expect(window.inclusiveMaximumStartDate).toEqual(dateOnly(maximumStart));
    expect(window.inclusiveMaximumStartDate.getUTCHours()).toBe(0);
  });

  it('fails closed for invalid booking dates and rejects an invalid captured clock', () => {
    const window = createPortalBookingEligibilityWindow(
      new Date('2030-06-15T12:34:56.789Z'),
    );

    expect(isPortalBookingTemporallyEligible({
      startDate: new Date(Number.NaN),
      endDate: dateOnly('2030-06-18'),
    }, window)).toBe(false);
    expect(isPortalBookingTemporallyEligible({
      startDate: dateOnly('2030-06-15'),
      endDate: new Date(Number.NaN),
    }, window)).toBe(false);
    expect(() => createPortalBookingEligibilityWindow(new Date(Number.NaN))).toThrow(TypeError);
  });
});

// The window is a UTC calendar-date policy (docs/testing.md), not a Kalamata one. These cases pin what that means for a
// guest in Kalamata around local midnight, in summer (UTC+3) and winter (UTC+2), so that a change of the reference clock
// is always a decision taken for every flow at once and never a side effect.
describe('portal booking eligibility around midnight in the property time zone', () => {
  it.each([
    ['summer, one second before local midnight', '2030-06-15T20:59:59.000Z', '2030-06-15', '2030-06-15'],
    ['summer, local midnight', '2030-06-15T21:00:00.000Z', '2030-06-16', '2030-06-15'],
    ['summer, one second before 03:00 local', '2030-06-15T23:59:59.000Z', '2030-06-16', '2030-06-15'],
    ['summer, 03:00 local, when the UTC date changes', '2030-06-16T00:00:00.000Z', '2030-06-16', '2030-06-16'],
    ['winter, one second before local midnight', '2030-01-15T21:59:59.000Z', '2030-01-15', '2030-01-15'],
    ['winter, local midnight', '2030-01-15T22:00:00.000Z', '2030-01-16', '2030-01-15'],
    ['winter, one second before 02:00 local', '2030-01-15T23:59:59.000Z', '2030-01-16', '2030-01-15'],
    ['winter, 02:00 local, when the UTC date changes', '2030-01-16T00:00:00.000Z', '2030-01-16', '2030-01-16'],
    ['the evening before the spring clock change', '2030-03-30T22:00:00.000Z', '2030-03-31', '2030-03-30'],
    ['the evening of the spring clock change, already UTC+3', '2030-03-31T21:00:00.000Z', '2030-04-01', '2030-03-31'],
    ['the evening before the autumn clock change', '2030-10-26T21:00:00.000Z', '2030-10-27', '2030-10-26'],
    ['the evening of the autumn clock change, back at UTC+2', '2030-10-27T22:00:00.000Z', '2030-10-28', '2030-10-27'],
  ])('%s: Athens is on %s, the window\'s date is %s', (_label, instant, athensDate, windowDate) => {
    const captured = new Date(instant);

    expect(propertyToday(PROPERTY_TIME_ZONE, captured)).toBe(athensDate);
    expect(createPortalBookingEligibilityWindow(captured).businessToday).toEqual(dateOnly(windowDate));
  });

  it('keeps access until the UTC date changes after the check-out date: 2 to 3 hours after local midnight, never longer', () => {
    // The stay ends on 2030-06-15 (summer) and on 2030-01-15 (winter).
    expect(eligibilityFor('2030-06-15T21:30:00.000Z', '2030-06-10', '2030-06-15')).toBe(true); // 00:30 on 06-16 in Kalamata
    expect(eligibilityFor('2030-06-15T23:59:59.000Z', '2030-06-10', '2030-06-15')).toBe(true); // 02:59:59
    expect(eligibilityFor('2030-06-16T00:00:00.000Z', '2030-06-10', '2030-06-15')).toBe(false); // 03:00
    expect(eligibilityFor('2030-01-15T22:30:00.000Z', '2030-01-10', '2030-01-15')).toBe(true); // 00:30 on 01-16
    expect(eligibilityFor('2030-01-15T23:59:59.000Z', '2030-01-10', '2030-01-15')).toBe(true); // 01:59:59
    expect(eligibilityFor('2030-01-16T00:00:00.000Z', '2030-01-10', '2030-01-15')).toBe(false); // 02:00
  });

  it('opens the window before check-in when the UTC date reaches the seventh day: 2 to 3 hours after local midnight', () => {
    // Check-in on 2030-06-22 (summer) and on 2030-01-22 (winter): the window opens on the 15th at 00:00 UTC.
    expect(eligibilityFor('2030-06-14T23:59:59.000Z', '2030-06-22', '2030-06-25')).toBe(false); // 02:59:59 on 06-15 in Kalamata
    expect(eligibilityFor('2030-06-15T00:00:00.000Z', '2030-06-22', '2030-06-25')).toBe(true); // 03:00
    expect(eligibilityFor('2030-01-14T23:59:59.000Z', '2030-01-22', '2030-01-25')).toBe(false); // 01:59:59 on 01-15
    expect(eligibilityFor('2030-01-15T00:00:00.000Z', '2030-01-22', '2030-01-25')).toBe(true); // 02:00
  });

  it('does not open earlier because Kalamata is already on the next date', () => {
    // 2030-06-15T21:30Z is 00:30 on 06-16 in Kalamata, where a stay from 06-23 is exactly seven days away.
    expect(eligibilityFor('2030-06-15T21:30:00.000Z', '2030-06-23', '2030-06-26')).toBe(false);
    expect(eligibilityFor('2030-06-15T21:30:00.000Z', '2030-06-22', '2030-06-26')).toBe(true);
  });
});

describe('isPortalBookingEligible', () => {
  const window = createPortalBookingEligibilityWindow(new Date('2030-07-10T12:00:00.000Z'));
  const owned = {
    userId: 'user-1',
    accessStatus: 'VERIFIED',
    startDate: new Date('2030-07-09T00:00:00.000Z'),
    endDate: new Date('2030-07-12T00:00:00.000Z'),
  };

  it('accepts an owned, verified booking inside the window', () => {
    expect(isPortalBookingEligible(owned, 'user-1', window)).toBe(true);
  });

  it.each([
    ['another user', { userId: 'user-2' }],
    ['an unclaimed booking', { userId: null }],
    ['a pending booking', { accessStatus: 'PENDING' }],
    ['a stay that ended', { startDate: new Date('2030-07-01T00:00:00.000Z'), endDate: new Date('2030-07-05T00:00:00.000Z') }],
  ])('refuses %s', (_label, overrides) => {
    expect(isPortalBookingEligible({ ...owned, ...overrides }, 'user-1', window)).toBe(false);
  });
});
