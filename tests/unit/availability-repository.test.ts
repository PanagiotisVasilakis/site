import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    calendarSyncState: { findUnique: mocks.findUnique },
    ratePeriod: { findMany: mocks.findMany },
  },
}));

import { readPublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

// 22:30 UTC on 24 October is 01:30 on 25 October in Athens (EEST, UTC+3).
const NOW = new Date('2026-10-24T22:30:00.000Z');
const TODAY = '2026-10-25';
const HORIZON_END = '2027-10-25'; // TODAY + 365 nights, exclusive
const HOUR_MS = 3_600_000;
const FEED_URL = 'https://www.airbnb.com/calendar/ical/12345678.ics?s=token';

const utc = (date: string) => new Date(`${date}T00:00:00.000Z`);

function syncState(overrides: Record<string, unknown> = {}) {
  return {
    blockedNights: [utc('2026-10-25'), utc('2026-10-27'), utc('2027-10-23')],
    horizonStart: utc('2026-10-24'),
    // One night short of the page's horizon: the sync ran on the previous property day.
    horizonEnd: utc('2027-10-24'),
    lastSuccessAt: new Date(NOW.getTime() - HOUR_MS),
    ...overrides,
  };
}

const rateRows = [
  { startDate: utc('2026-10-01'), endDate: utc('2026-11-01'), nightlyPriceCents: 8000, minimumNights: 2 },
  { startDate: utc('2026-11-01'), endDate: utc('2027-04-01'), nightlyPriceCents: 6500, minimumNights: 1 },
];

beforeEach(() => {
  vi.stubEnv('AIRBNB_ICAL_URL', FEED_URL);
  mocks.findUnique.mockReturnValue(Promise.resolve(syncState()));
  mocks.findMany.mockReturnValue(Promise.resolve(rateRows));
  mocks.transaction.mockImplementation((operations: Promise<unknown>[]) => Promise.all(operations));
});

describe('readPublicAvailability', () => {
  it('reads the sync state and the overlapping rate periods in one transaction', async () => {
    await readPublicAvailability(NOW);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.transaction.mock.calls[0][0]).toHaveLength(2);
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { id: 'airbnb' },
      select: { blockedNights: true, horizonStart: true, horizonEnd: true, lastSuccessAt: true },
    });
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { startDate: { lt: utc(HORIZON_END) }, endDate: { gt: utc(TODAY) } },
      orderBy: { startDate: 'asc' },
      select: { startDate: true, endDate: true, nightlyPriceCents: true, minimumNights: true },
    });
  });

  it('encodes one character per night from the property date today', async () => {
    const result = await readPublicAvailability(NOW);

    expect(result.today).toBe(TODAY);
    expect(result.horizonEnd).toBe(HORIZON_END);
    expect(result.status).toBe('fresh');
    expect(result.lastSyncedAt).toBe(new Date(NOW.getTime() - HOUR_MS).toISOString());
    expect(result.nights).toHaveLength(365);
    expect(result.nights.slice(0, 4)).toBe('bobo'); // 25 blocked, 26 open, 27 blocked, 28 open
    expect(result.nights[363]).toBe('b'); // 2027-10-23
    expect(result.nights[364]).toBe('u'); // 2027-10-24: after the synced horizon
    expect(result.nights.replace(/[obu]/g, '')).toBe('');
    expect(result.nights.match(/b/g)).toHaveLength(3);
  });

  it('marks nights outside the synced horizon as unknown at both ends', async () => {
    mocks.findUnique.mockReturnValue(Promise.resolve(syncState({
      blockedNights: [],
      horizonStart: utc('2026-10-27'),
      horizonEnd: utc('2026-10-29'),
    })));

    const { nights } = await readPublicAvailability(NOW);

    expect(nights.slice(0, 5)).toBe('uuoou');
    expect(nights.slice(4)).toBe('u'.repeat(361));
  });

  it('returns the rate periods as ISO dates with an exclusive end', async () => {
    const { rates } = await readPublicAvailability(NOW);

    expect(rates).toEqual([
      { start: '2026-10-01', end: '2026-11-01', nightlyPriceCents: 8000, minimumNights: 2 },
      { start: '2026-11-01', end: '2027-04-01', nightlyPriceCents: 6500, minimumNights: 1 },
    ]);
  });

  it('is fresh exactly 12 hours after the last successful sync', async () => {
    mocks.findUnique.mockReturnValue(Promise.resolve(syncState({ lastSuccessAt: new Date(NOW.getTime() - 12 * HOUR_MS) })));

    const result = await readPublicAvailability(NOW);

    expect(result.status).toBe('fresh');
    expect(result.nights.startsWith('bobo')).toBe(true);
  });

  it('is stale one millisecond later and then shows no night as known', async () => {
    const lastSuccessAt = new Date(NOW.getTime() - 12 * HOUR_MS - 1);
    mocks.findUnique.mockReturnValue(Promise.resolve(syncState({ lastSuccessAt })));

    const result = await readPublicAvailability(NOW);

    expect(result.status).toBe('stale');
    expect(result.lastSyncedAt).toBe(lastSuccessAt.toISOString());
    expect(result.nights).toBe('u'.repeat(365));
    expect(result.rates).toHaveLength(2);
  });

  it('is stale when the configured calendar has never synced', async () => {
    mocks.findUnique.mockReturnValue(Promise.resolve(syncState({
      blockedNights: [],
      horizonStart: null,
      horizonEnd: null,
      lastSuccessAt: null,
    })));

    const result = await readPublicAvailability(NOW);

    expect(result.status).toBe('stale');
    expect(result.lastSyncedAt).toBeNull();
    expect(result.nights).toBe('u'.repeat(365));
  });

  it('shows every night as unknown but still quotes prices when the calendar is not configured', async () => {
    vi.stubEnv('AIRBNB_ICAL_URL', '');

    const result = await readPublicAvailability(NOW);

    expect(result.status).toBe('not_configured');
    expect(result.lastSyncedAt).toBeNull();
    expect(result.nights).toBe('u'.repeat(365));
    expect(result.rates).toHaveLength(2);
  });

  it('fails when the calendar_sync_state row is missing', async () => {
    mocks.findUnique.mockReturnValue(Promise.resolve(null));

    await expect(readPublicAvailability(NOW)).rejects.toThrow('The calendar_sync_state row is missing');
  });

  it('propagates database errors', async () => {
    mocks.transaction.mockRejectedValue(new Error('connection refused'));

    await expect(readPublicAvailability(NOW)).rejects.toThrow('connection refused');
  });
});
