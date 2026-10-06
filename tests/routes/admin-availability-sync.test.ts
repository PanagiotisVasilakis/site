import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isAdminRequest: vi.fn(),
  findUnique: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/prisma', () => ({ prisma: { calendarSyncState: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/availability/calendarSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/availability/calendarSync')>()),
  syncAirbnbCalendar: mocks.sync,
}));

import { GET, POST } from '@/app/api/admin/availability-sync/route';

const NOW = new Date('2026-09-28T10:00:00.000Z');
const SENTINEL = 'SENTINELtoken0123456789abcdef';
const FEED_URL = `https://www.airbnb.com/calendar/ical/12345678.ics?s=${SENTINEL}`;
const SAME_ORIGIN = { host: 'localhost:3000', origin: 'http://localhost:3000' };
const JSON_HEADERS = { 'content-type': 'application/json', ...SAME_ORIGIN };
const HOUR = 3_600_000;

const day = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function stateRow(overrides: Record<string, unknown> = {}) {
  return {
    blockedNights: [day('2026-10-01'), day('2026-10-02'), day('2026-12-24')],
    horizonStart: day('2026-09-28'),
    horizonEnd: day('2027-09-28'),
    lastSuccessAt: ago(HOUR),
    lastAttemptAt: ago(HOUR),
    lastFailureAt: ago(5 * HOUR),
    lastErrorCode: null,
    lastHttpStatus: null,
    consecutiveFailures: 0,
    nextAttemptAt: ago(-0.5 * HOUR),
    ...overrides,
  };
}

function status(headers: Record<string, string> = SAME_ORIGIN): Promise<Response> {
  return GET(new NextRequest('http://0.0.0.0:3000/api/admin/availability-sync', { headers }), {
    params: Promise.resolve({}),
  });
}

function syncNow(body: unknown = {}, headers: Record<string, string> = {}): Promise<Response> {
  return POST(new NextRequest('http://0.0.0.0:3000/api/admin/availability-sync', {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), { params: Promise.resolve({}) });
}

describe('admin availability-sync API', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('AIRBNB_ICAL_URL', FEED_URL);
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.findUnique.mockResolvedValue(stateRow());
    mocks.sync.mockResolvedValue({ status: 'synced', blockedNights: 3 });
  });

  afterEach(() => vi.useRealTimers());

  describe('GET', () => {
    it('answers 401 without an admin session and reads nothing', async () => {
      mocks.isAdminRequest.mockResolvedValue(false);

      const response = await status();

      expect(response.status).toBe(401);
      expect(mocks.findUnique).not.toHaveBeenCalled();
    });

    it('reports the sync state with ISO instants, ISO horizon dates and a count of nights', async () => {
      const response = await status();

      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual({
        configured: true,
        lastSuccessAt: '2026-09-28T09:00:00.000Z',
        lastAttemptAt: '2026-09-28T09:00:00.000Z',
        lastFailureAt: '2026-09-28T05:00:00.000Z',
        lastErrorCode: null,
        lastHttpStatus: null,
        consecutiveFailures: 0,
        nights: 3,
        horizonStart: '2026-09-28',
        horizonEnd: '2027-09-28',
        nextAttemptAt: '2026-09-28T10:30:00.000Z',
        stale: false,
      });
      expect(mocks.findUnique.mock.calls[0][0].where).toEqual({ id: 'airbnb' });
    });

    it('reports the last failure code and HTTP status', async () => {
      mocks.findUnique.mockResolvedValue(stateRow({
        lastFailureAt: ago(HOUR / 2),
        lastErrorCode: 'http_status',
        lastHttpStatus: 503,
        consecutiveFailures: 2,
      }));

      const { data } = await (await status()).json();

      expect(data).toMatchObject({
        lastFailureAt: '2026-09-28T09:30:00.000Z',
        lastErrorCode: 'http_status',
        lastHttpStatus: 503,
        consecutiveFailures: 2,
      });
    });

    it.each([
      ['a success exactly 3 hours ago (the alert threshold)', true, { lastSuccessAt: ago(3 * HOUR) }, false],
      ['a success more than 3 hours ago', true, { lastSuccessAt: ago(3 * HOUR + 1) }, true],
      ['no success yet', true, { lastSuccessAt: null, horizonStart: null, horizonEnd: null, blockedNights: [] }, true],
      ['no calendar configured and no success', false, { lastSuccessAt: null }, false],
      ['no calendar configured and an old success', false, { lastSuccessAt: ago(48 * HOUR) }, false],
    ])('stale with %s is %s', async (_label, configured, overrides, stale) => {
      if (!configured) vi.stubEnv('AIRBNB_ICAL_URL', '');
      mocks.findUnique.mockResolvedValue(stateRow(overrides));

      const { data } = await (await status()).json();

      expect(data.configured).toBe(configured);
      expect(data.stale).toBe(stale);
    });

    it('reports a never-synced calendar with null dates and zero nights', async () => {
      mocks.findUnique.mockResolvedValue(stateRow({
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastFailureAt: null,
        horizonStart: null,
        horizonEnd: null,
        blockedNights: [],
      }));

      const { data } = await (await status()).json();

      expect(data).toMatchObject({
        lastSuccessAt: null,
        lastAttemptAt: null,
        lastFailureAt: null,
        horizonStart: null,
        horizonEnd: null,
        nights: 0,
      });
    });

    it('never returns the calendar URL, even when it is configured', async () => {
      const text = await (await status()).text();

      expect(text).not.toContain(SENTINEL);
      expect(text.toLowerCase()).not.toContain('airbnb.com');
      expect(text).not.toContain('/calendar/ical/');
    });

    it('fails as an internal error when the state row is missing', async () => {
      mocks.findUnique.mockResolvedValue(null);

      const response = await status();

      expect(response.status).toBe(500);
    });
  });

  describe('POST', () => {
    it('answers 401 without an admin session and does not sync', async () => {
      mocks.isAdminRequest.mockResolvedValue(false);

      const response = await syncNow();

      expect(response.status).toBe(401);
      expect(mocks.sync).not.toHaveBeenCalled();
    });

    it('answers 403 to a cross-origin request and does not sync', async () => {
      const response = await syncNow({}, { origin: 'https://evil.example' });

      expect(response.status).toBe(403);
      expect(mocks.sync).not.toHaveBeenCalled();
    });

    it('answers 415 to a non-JSON body and does not sync', async () => {
      const response = await syncNow({}, { 'content-type': 'text/plain' });

      expect(response.status).toBe(415);
      expect(mocks.sync).not.toHaveBeenCalled();
    });

    it.each([
      ['a non-empty object', { force: true }],
      ['an array', []],
      ['null', null],
      ['a string', 'sync'],
    ])('answers 422 to %s and does not sync', async (_label, body) => {
      const response = await syncNow(JSON.stringify(body));

      expect(response.status).toBe(422);
      expect(mocks.sync).not.toHaveBeenCalled();
    });

    it('answers 400 to malformed JSON and 413 to a large body, without syncing', async () => {
      const malformed = await syncNow('{');
      const large = await syncNow({ padding: 'x'.repeat(1_024) });

      expect(malformed.status).toBe(400);
      expect(large.status).toBe(413);
      expect(mocks.sync).not.toHaveBeenCalled();
    });

    it('runs a manual sync and answers 200 with the number of blocked nights', async () => {
      mocks.sync.mockResolvedValue({ status: 'synced', blockedNights: 12 });

      const response = await syncNow();

      expect(response.status).toBe(200);
      expect(mocks.sync).toHaveBeenCalledTimes(1);
      expect(mocks.sync).toHaveBeenCalledWith({ trigger: 'manual' });
      expect((await response.json()).data).toEqual({ status: 'synced', nights: 12 });
    });

    it.each([
      ['not_configured', 'The availability calendar is not configured'],
      ['busy', 'Another calendar sync is in progress'],
      ['lease_lost', 'Another calendar sync is in progress'],
      ['skipped', 'The calendar sync did not run'],
    ])('answers 409 to %s', async (outcome, message) => {
      mocks.sync.mockResolvedValue({ status: outcome });

      const response = await syncNow();

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe(message);
    });

    it.each([
      ['20 s', 20_000, '40'],
      ['20.3 s', 20_300, '40'],
      ['59.5 s', 59_500, '1'],
      ['60 s (the claim raced the clock)', 60_000, '1'],
    ])('answers 429 with Retry-After when the last attempt was %s ago', async (_label, elapsedMs, retryAfter) => {
      mocks.sync.mockResolvedValue({ status: 'too_soon' });
      mocks.findUnique.mockResolvedValue(stateRow({ lastAttemptAt: ago(elapsedMs) }));

      const response = await syncNow();

      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe(retryAfter);
      const body = await response.json();
      expect(body.error.code).toBe('RATE_LIMITED');
      expect(body.error.details).toEqual({ retryAfter: Number(retryAfter) });
    });

    it.each([
      ['with an HTTP status', { status: 'failed', code: 'http_status', httpStatus: 503 }, { code: 'http_status', httpStatus: 503 }],
      ['without an HTTP status', { status: 'failed', code: 'invalid_date' }, { code: 'invalid_date', httpStatus: null }],
    ])('answers 502 to a failed sync %s, carrying only the code and the status', async (_label, result, details) => {
      mocks.sync.mockResolvedValue(result);

      const response = await syncNow();

      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body.error.code).toBe('EXTERNAL_SERVICE_ERROR');
      expect(body.error.details).toEqual(details);
    });

    it.each([
      ['synced', { status: 'synced', blockedNights: 3 }],
      ['not_configured', { status: 'not_configured' }],
      ['busy', { status: 'busy' }],
      ['too_soon', { status: 'too_soon' }],
      ['failed', { status: 'failed', code: 'network' }],
    ])('never returns the calendar URL (%s)', async (_label, result) => {
      mocks.sync.mockResolvedValue(result);

      const response = await syncNow();
      const text = `${await response.text()} ${JSON.stringify([...response.headers])}`;

      expect(text).not.toContain(SENTINEL);
      expect(text.toLowerCase()).not.toContain('airbnb.com');
    });
  });
});
