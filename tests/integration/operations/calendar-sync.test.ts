import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { AVAILABILITY_HORIZON_DAYS, PROPERTY_TIME_ZONE } from '@/data/stayPolicy';
import type { PrismaClient } from '@/generated/prisma/client';
import { addDays, propertyToday, toDbDate, type IsoDate } from '@/lib/availability/calendarDate';

import type { DisposableDatabaseTarget } from '../support/database-safety';
import {
  createIsolatedDatabase,
  dropIsolatedDatabase,
} from '../support/database-lifecycle';
import { withTestPrismaClient } from '../support/fixtures';
import { applyMigrationsFromEmpty } from '../support/migrations';
import { readDisposablePostgresRuntime } from '../support/runtime';

const runtime = readDisposablePostgresRuntime();
const managedEnvironment = [
  'AIRBNB_ICAL_URL',
  'ALERT_WEBHOOK_REQUIRED',
  'ALERT_WEBHOOK_URL',
  'DATABASE_URL',
] as const;
type ManagedEnvironmentName = typeof managedEnvironment[number];

const TOKEN = 'SENTINELTOKEN0000';
const FEED_URL = `https://www.airbnb.com/calendar/ical/12345678.ics?s=${TOKEN}`;
const STALE_RULE = 'Stale availability calendar';
const CRLF = '\r\n';

let target: DisposableDatabaseTarget | undefined;
let applicationPrisma: PrismaClient | undefined;
const originalEnvironment = new Map<ManagedEnvironmentName, string | undefined>();

function requireTarget(): DisposableDatabaseTarget {
  if (!target) throw new Error('Calendar sync database was not initialized.');
  return target;
}

const icalDate = (date: IsoDate) => date.replaceAll('-', '');

/** A calendar blocking [today, today+2) and [today+10, today+13), relative to the property's today. */
function feed(today: IsoDate): string {
  const events = [[0, 2], [10, 13]].flatMap(([start, end], index) => [
    'BEGIN:VEVENT',
    `DTEND;VALUE=DATE:${icalDate(addDays(today, end))}`,
    `DTSTART;VALUE=DATE:${icalDate(addDays(today, start))}`,
    `UID:integration-${index}@airbnb.com`,
    'SUMMARY:Reserved',
    'END:VEVENT',
  ]);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events, 'END:VCALENDAR'].join(CRLF) + CRLF;
}

function expectedNights(today: IsoDate): Date[] {
  return [0, 1, 10, 11, 12].map((offset) => toDbDate(addDays(today, offset)));
}

async function readState() {
  return withTestPrismaClient(requireTarget(), async (prisma) => prisma.calendarSyncState.findUniqueOrThrow({
    where: { id: 'airbnb' },
  }));
}

async function updateState(data: { nextAttemptAt?: Date; lastSuccessAt?: Date }) {
  await withTestPrismaClient(requireTarget(), async (prisma) => {
    await prisma.calendarSyncState.update({ where: { id: 'airbnb' }, data });
  }, 'seed');
}

async function openStaleAlerts() {
  return withTestPrismaClient(requireTarget(), async (prisma) => prisma.alert.findMany({
    where: { rule: { name: STALE_RULE }, status: 'OPEN' },
    select: { value: true },
  }));
}

describe.sequential('Airbnb calendar sync on PostgreSQL', () => {
  beforeAll(async () => {
    target = await createIsolatedDatabase(runtime, 'calendar_sync');
    await applyMigrationsFromEmpty(target);
    for (const name of managedEnvironment) originalEnvironment.set(name, process.env[name]);
    delete process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_WEBHOOK_REQUIRED;
    process.env.AIRBNB_ICAL_URL = FEED_URL;
    process.env.DATABASE_URL = target.databaseUrl;
    applicationPrisma = (await import('@/lib/prisma')).prisma;
  });

  afterEach(async () => {
    if (target) {
      await withTestPrismaClient(requireTarget(), async (prisma) => {
        await prisma.$transaction([
          prisma.alert.deleteMany(),
          prisma.alertRule.deleteMany(),
          // Back to the state the migration seeds.
          prisma.calendarSyncState.update({
            where: { id: 'airbnb' },
            data: {
              blockedNights: [],
              horizonStart: null,
              horizonEnd: null,
              lastSuccessAt: null,
              lastAttemptAt: null,
              nextAttemptAt: new Date(),
              lastFailureAt: null,
              lastErrorCode: null,
              lastHttpStatus: null,
              consecutiveFailures: 0,
              leaseOwner: null,
              leaseExpiresAt: null,
            },
          }),
        ]);
      }, 'cleanup');
    }
  });

  afterAll(async () => {
    try {
      await applicationPrisma?.$disconnect();
      applicationPrisma = undefined;
    } finally {
      for (const name of managedEnvironment) {
        const value = originalEnvironment.get(name);
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      if (target) await dropIsolatedDatabase(target);
      target = undefined;
    }
  });

  it('lets exactly one of two concurrent runs fetch and store the calendar', async () => {
    const today = propertyToday(PROPERTY_TIME_ZONE, new Date());
    let release: () => void = () => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    // The lease holder waits in the download until released, so the other run finishes first.
    const fetchMock = vi.fn(async () => {
      await released;
      return new Response(feed(today), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const { syncAirbnbCalendar } = await import('@/lib/availability/calendarSync');

    const runs = [syncAirbnbCalendar({ trigger: 'scheduled' }), syncAirbnbCalendar({ trigger: 'scheduled' })];
    await expect(Promise.race(runs)).resolves.toEqual({ status: 'busy' });
    release();
    const results = await Promise.all(runs);

    expect(results).toContainEqual({ status: 'synced', blockedNights: 5 });
    expect(results).toContainEqual({ status: 'busy' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const state = await readState();
    expect(state.blockedNights).toEqual(expectedNights(today));
    expect(state.horizonStart).toEqual(toDbDate(today));
    expect(state.horizonEnd).toEqual(toDbDate(addDays(today, AVAILABILITY_HORIZON_DAYS)));
    expect(state).toMatchObject({
      consecutiveFailures: 0,
      lastErrorCode: null,
      lastHttpStatus: null,
      lastFailureAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
    });
    expect(state.lastSuccessAt).toBeInstanceOf(Date);
    expect(state.nextAttemptAt.getTime() - state.lastSuccessAt!.getTime()).toBe(30 * 60_000);
  });

  it('keeps the last good nights when later syncs fail, and backs off', async () => {
    const today = propertyToday(PROPERTY_TIME_ZONE, new Date());
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchMock);
    const { syncAirbnbCalendar } = await import('@/lib/availability/calendarSync');

    fetchMock.mockResolvedValueOnce(new Response(feed(today), { status: 200 }));
    await expect(syncAirbnbCalendar({ trigger: 'scheduled' })).resolves.toEqual({ status: 'synced', blockedNights: 5 });
    const synced = await readState();

    await updateState({ nextAttemptAt: new Date(Date.now() - 60_000) });
    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    await expect(syncAirbnbCalendar({ trigger: 'scheduled' })).resolves.toEqual({ status: 'failed', code: 'http_status', httpStatus: 503 });
    const afterHttpFailure = await readState();

    await updateState({ nextAttemptAt: new Date(Date.now() - 60_000) });
    const dateTimeEvent = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'DTSTART:20301101T120000Z', 'END:VEVENT', 'END:VCALENDAR'].join(CRLF);
    fetchMock.mockResolvedValueOnce(new Response(dateTimeEvent, { status: 200 }));
    await expect(syncAirbnbCalendar({ trigger: 'scheduled' })).resolves.toEqual({ status: 'failed', code: 'unsupported_value' });
    const afterParseFailure = await readState();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const state of [afterHttpFailure, afterParseFailure]) {
      expect(state.blockedNights).toEqual(expectedNights(today));
      expect(state.horizonStart).toEqual(synced.horizonStart);
      expect(state.horizonEnd).toEqual(synced.horizonEnd);
      expect(state.lastSuccessAt).toEqual(synced.lastSuccessAt);
      expect(state).toMatchObject({ leaseOwner: null, leaseExpiresAt: null });
      expect(state.lastFailureAt).toBeInstanceOf(Date);
    }
    expect(afterHttpFailure).toMatchObject({ consecutiveFailures: 1, lastErrorCode: 'http_status', lastHttpStatus: 503 });
    expect(afterHttpFailure.nextAttemptAt.getTime() - afterHttpFailure.lastFailureAt!.getTime()).toBe(30 * 60_000);
    expect(afterParseFailure).toMatchObject({ consecutiveFailures: 2, lastErrorCode: 'unsupported_value', lastHttpStatus: null });
    expect(afterParseFailure.nextAttemptAt.getTime() - afterParseFailure.lastFailureAt!.getTime()).toBe(45 * 60_000);
  });

  it('opens the stale calendar alert for an old last success and resolves it after a fresh one', async () => {
    const { evaluateOperationalAlerts } = await import('@/lib/operationalMonitor');

    await updateState({ lastSuccessAt: new Date(Date.now() - 4 * 60 * 60_000) });
    await evaluateOperationalAlerts();

    const opened = await openStaleAlerts();
    expect(opened).toHaveLength(1);
    expect(opened[0].value).toBeGreaterThanOrEqual(240);
    expect(opened[0].value).toBeLessThan(245);

    await updateState({ lastSuccessAt: new Date() });
    await expect(evaluateOperationalAlerts()).resolves.toMatchObject({ resolved: 1 });
    expect(await openStaleAlerts()).toEqual([]);
  });
});
