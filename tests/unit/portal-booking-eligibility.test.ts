import { describe, expect, it } from 'vitest';

import {
  createPortalBookingEligibilityWindow,
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
