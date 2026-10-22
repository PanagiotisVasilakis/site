import { inspect } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type UpdateManyArgs = { where: Record<string, unknown>; data: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
  updateMany: vi.fn<(args: UpdateManyArgs) => Promise<{ count: number }>>(),
  findUnique: vi.fn(),
}));

vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));
vi.mock('@/lib/prisma', () => ({
  prisma: { calendarSyncState: { updateMany: mocks.updateMany, findUnique: mocks.findUnique } },
}));

import { syncBookingCalendar } from '@/lib/availability/calendarSync';

type Trigger = Parameters<typeof syncBookingCalendar>[0]['trigger'];

const TOKEN = 'SENTINELTOKEN0000';
const FEED_URL = `https://ical.booking.com/v1/export?t=${TOKEN}`;
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

// 22:30 UTC on 24 October is 01:30 on 25 October in Athens (EEST, UTC+3), so
// the property's today differs from the UTC date.
const NOW = new Date('2026-10-24T22:30:00.000Z');
const TODAY = '2026-10-25';
const HORIZON_END = '2027-10-25'; // TODAY + 365 nights, exclusive

const CRLF = '\r\n';
const HEADER = [
  'BEGIN:VCALENDAR',
  'PRODID:-//Example//Calendar export//EN',
  'CALSCALE:GREGORIAN',
  'VERSION:2.0',
];

/** A calendar with one blocked DATE range per [DTSTART, DTEND) pair (YYYYMMDD). */
function calendar(...ranges: Array<[string, string]>): string {
  return [
    ...HEADER,
    ...ranges.flatMap(([start, end], index) => [
      'BEGIN:VEVENT',
      `DTEND;VALUE=DATE:${end}`,
      `DTSTART;VALUE=DATE:${start}`,
      `UID:sync-${index}@calendar.example`,
      'SUMMARY:Reserved',
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ].join(CRLF) + CRLF;
}

const FEED = calendar(
  ['20260101', '20260105'], // entirely before today: dropped
  ['20261020', '20261027'], // started before today: clipped to 25 and 26 October
  ['20261224', '20261227'],
  ['20261226', '20261228'], // overlaps the previous range: 26 December only once
  ['20271023', '20271028'], // crosses the horizon end: 23 and 24 October 2027
  ['20280101', '20280103'], // entirely after the horizon: dropped
);
const FEED_NIGHTS = [
  '2026-10-25', '2026-10-26',
  '2026-12-24', '2026-12-25', '2026-12-26', '2026-12-27',
  '2027-10-23', '2027-10-24',
];

const utcMidnight = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const afterNow = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

const LEASE_FREE = { OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: NOW } }] };
const DUE = {
  scheduled: { nextAttemptAt: { lte: NOW } },
  manual: { OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lt: afterNow(-1) } }] },
};

function claimCall(trigger: Trigger) {
  return {
    where: { id: 'booking', AND: [LEASE_FREE, DUE[trigger]] },
    data: { leaseOwner: expect.any(String), leaseExpiresAt: afterNow(1), lastAttemptAt: NOW },
  };
}

function leaseOwner(): string {
  const owner = mocks.updateMany.mock.calls[0][0].data.leaseOwner;
  if (typeof owner !== 'string' || owner.length === 0 || owner.length > 128) {
    throw new Error('the claim did not set a lease owner that fits the column');
  }
  return owner;
}

const results: unknown[] = [];

async function sync(trigger: Trigger) {
  const result = await syncBookingCalendar({ trigger });
  results.push(result);
  return result;
}

let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('BOOKING_ICAL_URL', FEED_URL);
  vi.stubGlobal('fetch', mocks.fetch);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  consoleSpies = CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
});

afterEach(() => {
  // Neither the URL nor its token may reach a result, a log line or the database.
  const observed = inspect([
    results,
    Object.values(mocks.logger).map((method) => method.mock.calls),
    mocks.updateMany.mock.calls,
    mocks.findUnique.mock.calls,
    consoleSpies.map((spy) => spy.mock.calls),
  ], { depth: 12 });
  results.length = 0;
  vi.useRealTimers();
  expect(observed).not.toContain(TOKEN);
  expect(observed).not.toContain('ical.booking.com');
  expect(observed).not.toContain('v1/export');
});

describe('syncBookingCalendar: configuration', () => {
  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('returns not_configured without touching the database or the network when the URL is %s', async (_label, value) => {
    vi.stubEnv('BOOKING_ICAL_URL', value);

    await expect(sync('scheduled')).resolves.toEqual({ status: 'not_configured' });
    await expect(sync('manual')).resolves.toEqual({ status: 'not_configured' });

    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(Object.values(mocks.logger).flatMap((method) => method.mock.calls)).toEqual([]);
  });
});

describe('syncBookingCalendar: success', () => {
  it('claims the lease, then stores the exact clipped nights and releases the lease in one write', async () => {
    mocks.fetch.mockResolvedValue(new Response(FEED, { status: 200 }));

    await expect(sync('scheduled')).resolves.toEqual({ status: 'synced', blockedNights: FEED_NIGHTS.length });

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0][0]).toBe(FEED_URL);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany.mock.calls[0][0]).toEqual(claimCall('scheduled'));
    expect(mocks.updateMany.mock.calls[1][0]).toEqual({
      where: { id: 'booking', leaseOwner: leaseOwner() },
      data: {
        blockedNights: FEED_NIGHTS.map(utcMidnight),
        horizonStart: utcMidnight(TODAY),
        horizonEnd: utcMidnight(HORIZON_END),
        lastSuccessAt: NOW,
        nextAttemptAt: afterNow(30),
        consecutiveFailures: 0,
        lastErrorCode: null,
        lastHttpStatus: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.logger.info).toHaveBeenCalledWith(expect.any(String), { status: 'synced', blockedNights: FEED_NIGHTS.length });
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  it('claims a manual sync by the last attempt time and stores an empty calendar as no blocked nights', async () => {
    mocks.fetch.mockResolvedValue(new Response(calendar(), { status: 200 }));

    await expect(sync('manual')).resolves.toEqual({ status: 'synced', blockedNights: 0 });

    expect(mocks.updateMany.mock.calls[0][0]).toEqual(claimCall('manual'));
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({
      blockedNights: [],
      horizonStart: utcMidnight(TODAY),
      horizonEnd: utcMidnight(HORIZON_END),
    });
  });

  // Decision O47: only the admin's 'Sync now' may replace stored future nights with an empty calendar.
  it('stores an empty calendar on a manual run although the snapshot holds future nights', async () => {
    mocks.fetch.mockResolvedValue(new Response(calendar(), { status: 200 }));
    mocks.findUnique.mockResolvedValue({ blockedNights: [utcMidnight('2026-12-24')] });

    await expect(sync('manual')).resolves.toEqual({ status: 'synced', blockedNights: 0 });

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({ blockedNights: [], lastSuccessAt: NOW, lastErrorCode: null });
  });

  // 24 October is already past at the property (01:30 on 25 October in Athens), although it is still the UTC date.
  it.each<[string, string[]]>([
    ['only past nights', ['2026-10-23', '2026-10-24']],
    ['no nights', []],
  ])('stores an empty calendar on a scheduled run when the snapshot holds %s', async (_label, stored) => {
    mocks.fetch.mockResolvedValue(new Response(calendar(), { status: 200 }));
    mocks.findUnique.mockResolvedValue({ blockedNights: stored.map(utcMidnight) });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'synced', blockedNights: 0 });

    expect(mocks.findUnique).toHaveBeenCalledExactlyOnceWith({ where: { id: 'booking' }, select: { blockedNights: true } });
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({
      blockedNights: [],
      lastSuccessAt: NOW,
      consecutiveFailures: 0,
      lastErrorCode: null,
    });
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  it('uses a new lease owner for every run', async () => {
    mocks.fetch.mockImplementation(async () => new Response(calendar(), { status: 200 }));

    await sync('scheduled');
    await sync('scheduled');

    const owners = mocks.updateMany.mock.calls.filter((_call, index) => index % 2 === 0).map(([args]) => args.data.leaseOwner);
    expect(owners).toHaveLength(2);
    expect(owners[0]).not.toBe(owners[1]);
  });

  it('writes nothing more when the lease was lost before the snapshot write', async () => {
    mocks.fetch.mockResolvedValue(new Response(FEED, { status: 200 }));
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'lease_lost' });

    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.any(String), { status: 'lease_lost' });
  });
});

// AC-02: one malformed event in the past, or a cancelled one, must not fail the whole sync; a malformed event that
// could affect today or later still does, because dropping it could show a booked night as free.
describe('syncBookingCalendar: events the parser sets aside', () => {
  /** A calendar of events given as their property lines. */
  function feedOf(...events: string[][]): string {
    return [...HEADER, ...events.flatMap((properties) => ['BEGIN:VEVENT', ...properties, 'END:VEVENT']), 'END:VCALENDAR'].join(CRLF) + CRLF;
  }

  const BOOKED_DECEMBER = ['DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261227'];
  const DECEMBER_NIGHTS = ['2026-12-24', '2026-12-25', '2026-12-26'];
  const PAST_MALFORMED = ['DTSTART:20250101T140000Z', 'DTEND:20250104T100000Z'];
  const CANCELLED_MALFORMED = ['STATUS:CANCELLED', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261101'];

  it('stores the nights of the valid events when only past or cancelled events are malformed', async () => {
    mocks.fetch.mockResolvedValue(new Response(feedOf(PAST_MALFORMED, CANCELLED_MALFORMED, BOOKED_DECEMBER), { status: 200 }));

    await expect(sync('scheduled')).resolves.toEqual({ status: 'synced', blockedNights: DECEMBER_NIGHTS.length });

    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({
      blockedNights: DECEMBER_NIGHTS.map(utcMidnight),
      lastSuccessAt: NOW,
      consecutiveFailures: 0,
      lastErrorCode: null,
    });
    expect(mocks.logger.warn).not.toHaveBeenCalled();
  });

  // 22 October is before the cutoff of 23 October (two days before the property's 25 October) but not before the
  // 22 October cutoff that the UTC date, 24 October, would give.
  it('judges the past by the date at the property, not the UTC date', async () => {
    const endedOn22 = ['DTSTART:20261015T140000Z', 'DTEND:20261022T100000Z'];
    mocks.fetch.mockResolvedValue(new Response(feedOf(endedOn22, BOOKED_DECEMBER), { status: 200 }));

    await expect(sync('scheduled')).resolves.toEqual({ status: 'synced', blockedNights: DECEMBER_NIGHTS.length });
  });

  it.each([
    ['a future event', ['DTSTART:20261101T140000Z', 'DTEND:20261104T100000Z'], 'unsupported_value'],
    ['an event under way today', ['DTSTART:20261020T140000Z', 'DTEND:20261030T100000Z'], 'unsupported_value'],
    ['an event that ended at the cutoff', ['DTSTART:20261015T140000Z', 'DTEND:20261023T100000Z'], 'unsupported_value'],
    ['a future event with an end before its start', ['DTSTART;VALUE=DATE:20261104', 'DTEND;VALUE=DATE:20261101'], 'invalid_range'],
    ['a recurring event from the past', ['DTSTART;VALUE=DATE:20250101', 'DTEND;VALUE=DATE:20250104', 'RRULE:FREQ=WEEKLY'], 'unsupported_recurrence'],
  ])('still fails the sync for %s that does not validate, and keeps the stored nights', async (_label, event, code) => {
    mocks.fetch.mockResolvedValue(new Response(feedOf(PAST_MALFORMED, BOOKED_DECEMBER, event), { status: 200 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 1 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'failed', code });

    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({
      lastFailureAt: NOW,
      lastErrorCode: code,
      consecutiveFailures: { increment: 1 },
      nextAttemptAt: afterNow(45),
    });
    expect(mocks.updateMany.mock.calls[1][0].data).not.toHaveProperty('blockedNights');
    expect(mocks.logger.info).not.toHaveBeenCalled();
  });

  // The state machine is unchanged: a feed that holds nothing but set-aside events is an empty calendar.
  it('treats a feed of set-aside events as empty: stored on a manual run, empty_feed on a scheduled run that would clear future nights', async () => {
    const onlySetAside = feedOf(PAST_MALFORMED, CANCELLED_MALFORMED);
    mocks.fetch.mockImplementation(async () => new Response(onlySetAside, { status: 200 }));

    await expect(sync('manual')).resolves.toEqual({ status: 'synced', blockedNights: 0 });
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({ blockedNights: [], lastErrorCode: null });

    mocks.updateMany.mockClear();
    mocks.findUnique
      .mockResolvedValueOnce({ blockedNights: DECEMBER_NIGHTS.map(utcMidnight) })
      .mockResolvedValueOnce({ consecutiveFailures: 0 });
    await expect(sync('scheduled')).resolves.toEqual({ status: 'failed', code: 'empty_feed' });
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({ lastErrorCode: 'empty_feed' });
    expect(mocks.updateMany.mock.calls[1][0].data).not.toHaveProperty('blockedNights');
  });
});

describe('syncBookingCalendar: not claimed', () => {
  it.each([
    ['scheduled', 'skipped'],
    ['manual', 'too_soon'],
  ] as const)('a %s run that is not due returns %s without fetching', async (trigger, status) => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ leaseExpiresAt: null });

    await expect(sync(trigger)).resolves.toEqual({ status });

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany.mock.calls[0][0]).toEqual(claimCall(trigger));
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 'booking' }, select: { leaseExpiresAt: true } });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(['scheduled', 'manual'] as const)('a %s run returns busy while another run holds the lease', async (trigger) => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ leaseExpiresAt: NOW });

    await expect(sync(trigger)).resolves.toEqual({ status: 'busy' });

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('treats an expired lease as free when explaining why the claim failed', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue({ leaseExpiresAt: new Date(NOW.getTime() - 1) });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'skipped' });
  });

  it('throws when the seeded state row is missing', async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.findUnique.mockResolvedValue(null);

    await expect(syncBookingCalendar({ trigger: 'scheduled' })).rejects.toThrow('calendar_sync_state');

    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});

describe('syncBookingCalendar: failures', () => {
  function failureWrite(code: string, httpStatus: number | null, backoffMinutes: number) {
    return {
      where: { id: 'booking', leaseOwner: leaseOwner() },
      data: {
        lastFailureAt: NOW,
        lastErrorCode: code,
        lastHttpStatus: httpStatus,
        consecutiveFailures: { increment: 1 },
        nextAttemptAt: afterNow(backoffMinutes),
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    };
  }

  // Decision O64: a failed manual run records the error and leaves the backoff alone.
  function manualFailureWrite(code: string, httpStatus: number | null) {
    return {
      where: { id: 'booking', leaseOwner: leaseOwner() },
      data: {
        lastFailureAt: NOW,
        lastErrorCode: code,
        lastHttpStatus: httpStatus,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    };
  }

  it('records an HTTP failure, keeps the stored nights and backs off', async () => {
    mocks.fetch.mockResolvedValue(new Response('unavailable', { status: 503 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 2 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'failed', code: 'http_status', httpStatus: 503 });

    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { id: 'booking' }, select: { consecutiveFailures: true } });
    // Two earlier failures: doubling would give 120 minutes; the cap keeps it at 45.
    expect(mocks.updateMany.mock.calls[1][0]).toEqual(failureWrite('http_status', 503, 45));
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.any(String), {
      status: 'failed',
      code: 'http_status',
      httpStatus: 503,
      consecutiveFailures: 3,
    });
    expect(mocks.logger.info).not.toHaveBeenCalled();
  });

  // The Response constructor rejects these statuses; fetch passes non-standard ones such as 999 through, and 99 pins the lower bound of the column CHECK.
  it.each([99, 600, 999])('records a non-standard HTTP status %i by its code alone (the column allows 100-599)', async (status) => {
    mocks.fetch.mockResolvedValue(Object.defineProperty(new Response(null, { status: 500 }), 'status', { value: status }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 0 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'failed', code: 'http_status' });

    expect(mocks.updateMany.mock.calls[1][0]).toEqual(failureWrite('http_status', null, 30));
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.any(String), {
      status: 'failed',
      code: 'http_status',
      httpStatus: null,
      consecutiveFailures: 1,
    });
  });

  it('records a network failure without the upstream error text', async () => {
    mocks.fetch.mockRejectedValue(new TypeError(`fetch failed for ${FEED_URL}`));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 0 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'failed', code: 'network' });

    expect(mocks.updateMany.mock.calls[1][0]).toEqual(failureWrite('network', null, 30));
  });

  // Decision O64: only scheduled runs feed the backoff, so a few failed 'Sync now' clicks cannot park
  // the automatic sync for hours.
  it('records a failed manual run without moving consecutiveFailures or nextAttemptAt', async () => {
    mocks.fetch.mockResolvedValue(new Response('unavailable', { status: 503 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 2 });

    await expect(sync('manual')).resolves.toEqual({ status: 'failed', code: 'http_status', httpStatus: 503 });

    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany.mock.calls[0][0]).toEqual(claimCall('manual'));
    const write = mocks.updateMany.mock.calls[1][0];
    expect(write).toEqual(manualFailureWrite('http_status', 503));
    expect(write.data).not.toHaveProperty('consecutiveFailures');
    expect(write.data).not.toHaveProperty('nextAttemptAt');
    // The log line does not claim an increment: the count stays at the stored 2.
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.any(String), {
      status: 'failed',
      code: 'http_status',
      httpStatus: 503,
      consecutiveFailures: 2,
    });
  });

  it('records a parse failure and keeps the stored nights', async () => {
    const dateTimeEvent = [...HEADER, 'BEGIN:VEVENT', 'DTSTART:20261101T120000Z', 'END:VEVENT', 'END:VCALENDAR'].join(CRLF);
    mocks.fetch.mockResolvedValue(new Response(dateTimeEvent, { status: 200 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 1 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'failed', code: 'unsupported_value' });

    expect(mocks.updateMany.mock.calls[1][0]).toEqual(failureWrite('unsupported_value', null, 45));
  });

  // The parser's line number is not feed content; it is the only pointer to what it rejected.
  it.each<[string, string[], string, number | null]>([
    ['a rejected property', [...HEADER, 'BEGIN:VEVENT', 'DTSTART:20261101T120000Z', 'END:VEVENT', 'END:VCALENDAR'], 'unsupported_value', 6],
    ['a calendar that is never closed (no line)', [...HEADER], 'unbalanced', null],
  ])('logs the parser code and line for %s', async (_label, lines, code, line) => {
    mocks.fetch.mockResolvedValue(new Response(lines.join(CRLF), { status: 200 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 0 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'failed', code });

    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.any(String), { code, line });
  });

  // Decision O47: a scheduled run never replaces stored future nights with an empty calendar.
  it.each<[string, string[]]>([
    ['a night today', ['2026-10-25']],
    ['past and later nights', ['2026-10-24', '2026-12-24']],
  ])('records empty_feed for an empty calendar on a scheduled run and keeps a snapshot with %s', async (_label, stored) => {
    mocks.fetch.mockResolvedValue(new Response(calendar(), { status: 200 }));
    // The guard reads the stored nights first, then recordFailure reads the failure count.
    mocks.findUnique
      .mockResolvedValueOnce({ blockedNights: stored.map(utcMidnight) })
      .mockResolvedValueOnce({ consecutiveFailures: 1 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'failed', code: 'empty_feed' });

    expect(mocks.findUnique.mock.calls).toEqual([
      [{ where: { id: 'booking' }, select: { blockedNights: true } }],
      [{ where: { id: 'booking' }, select: { consecutiveFailures: true } }],
    ]);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.updateMany.mock.calls[1][0]).toEqual(failureWrite('empty_feed', null, 45));
    expect(mocks.logger.warn).toHaveBeenCalledWith(expect.any(String), {
      status: 'failed',
      code: 'empty_feed',
      httpStatus: null,
      consecutiveFailures: 2,
    });
    expect(mocks.logger.info).not.toHaveBeenCalled();
  });

  // 0, 1 and 2 earlier failures (30, 45, 45 minutes) are asserted by the network, parse and
  // HTTP 503 tests above. The cap retries a failing feed at +30, +60, +105 and +150 minutes after
  // the last success, so a recovered feed is picked up before the 180-minute stale alert opens
  // (decision O63).
  it.each([
    [3, 45],
    [2_147_483_647, 45],
  ])('after %i earlier consecutive failures the next attempt is %i minutes later', async (earlier, minutes) => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 500 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: earlier });

    await sync('scheduled');

    expect(mocks.updateMany.mock.calls[1][0].data.nextAttemptAt).toEqual(afterNow(minutes));
  });

  it('writes nothing more when the lease was lost before the failure write', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 500 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 0 });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    await expect(sync('scheduled')).resolves.toEqual({ status: 'lease_lost' });

    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });

  it('throws when the state row disappears before the failure write', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 500 }));
    mocks.findUnique.mockResolvedValue(null);

    await expect(syncBookingCalendar({ trigger: 'scheduled' })).rejects.toThrow('calendar_sync_state');

    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('syncBookingCalendar: database errors propagate', () => {
  it('from the claim, before any fetch', async () => {
    mocks.updateMany.mockRejectedValue(new Error('database unavailable'));

    await expect(syncBookingCalendar({ trigger: 'scheduled' })).rejects.toThrow('database unavailable');

    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('from the snapshot write, which is not recorded as a sync failure', async () => {
    mocks.fetch.mockResolvedValue(new Response(FEED, { status: 200 }));
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error('database unavailable'));

    await expect(syncBookingCalendar({ trigger: 'scheduled' })).rejects.toThrow('database unavailable');

    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('from the failure write, which is not retried', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 500 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 0 });
    mocks.updateMany.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(new Error('database unavailable'));

    await expect(syncBookingCalendar({ trigger: 'scheduled' })).rejects.toThrow('database unavailable');

    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
  });
});

describe('syncBookingCalendar: guards with replaced modules', () => {
  afterEach(() => {
    vi.doUnmock('@/data/stayPolicy');
    vi.doUnmock('@/lib/availability/icalParser');
    vi.resetModules();
  });

  // The database allows at most 400 stored nights (calendar_sync_state_blocked_nights_check).
  it.each([
    [400, { status: 'synced', blockedNights: 400 }],
    [401, { status: 'failed', code: 'too_many_nights' }],
  ])('with a horizon of %i nights the result is %o', async (horizonDays, expected) => {
    vi.resetModules();
    vi.doMock('@/data/stayPolicy', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/data/stayPolicy')>(),
      AVAILABILITY_HORIZON_DAYS: horizonDays,
    }));
    const { syncBookingCalendar: syncWithHorizon } = await import('@/lib/availability/calendarSync');
    mocks.fetch.mockResolvedValue(new Response(calendar(['20261001', '20280101']), { status: 200 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 0 });

    const result = await syncWithHorizon({ trigger: 'scheduled' });
    results.push(result);

    expect(result).toEqual(expected);
    expect(mocks.updateMany).toHaveBeenCalledTimes(2);
    const { data } = mocks.updateMany.mock.calls[1][0];
    if (expected.status === 'synced') {
      expect(data.blockedNights).toHaveLength(400);
    } else {
      expect(data).not.toHaveProperty('blockedNights');
      expect(data.lastErrorCode).toBe('too_many_nights');
    }
  });

  it('records an unexpected error as a failure without its message', async () => {
    vi.resetModules();
    vi.doMock('@/lib/availability/icalParser', async (importOriginal) => ({
      ...await importOriginal<typeof import('@/lib/availability/icalParser')>(),
      parseBlockedRanges: () => {
        throw new Error(`parser crashed on ${FEED_URL}`);
      },
    }));
    const { syncBookingCalendar: syncWithBrokenParser } = await import('@/lib/availability/calendarSync');
    mocks.fetch.mockResolvedValue(new Response(FEED, { status: 200 }));
    mocks.findUnique.mockResolvedValue({ consecutiveFailures: 0 });

    const result = await syncWithBrokenParser({ trigger: 'scheduled' });
    results.push(result);

    expect(result).toEqual({ status: 'failed', code: 'unexpected' });
    expect(mocks.updateMany.mock.calls[1][0].data).toMatchObject({ lastErrorCode: 'unexpected', lastHttpStatus: null });
    // The log names the error class only: the thrown message carries the feed URL.
    expect(mocks.logger.warn).toHaveBeenCalledWith('Booking.com calendar sync failed unexpectedly', { errorName: 'Error' });
  });
});
