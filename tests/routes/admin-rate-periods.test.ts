import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Prisma } from '@/generated/prisma/client';

type Row = {
  id: string;
  startDate: Date;
  endDate: Date;
  nightlyPriceCents: number;
  minimumNights: number;
};

const mocks = vi.hoisted(() => {
  const ratePeriod = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  };
  return { isAdminRequest: vi.fn(), transaction: vi.fn(), ratePeriod };
});

vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/prisma', () => ({
  prisma: { ratePeriod: mocks.ratePeriod, $transaction: mocks.transaction },
}));

import { GET, POST } from '@/app/api/admin/rate-periods/route';
import { DELETE, PUT } from '@/app/api/admin/rate-periods/[id]/route';
import { logger } from '@/lib/logger-enterprise';

const SAME_ORIGIN = { host: 'localhost:3000', origin: 'http://localhost:3000' };
const JSON_HEADERS = { 'content-type': 'application/json', ...SAME_ORIGIN };
const PERIOD_A = '6f1d8f5e-0c55-4d7c-9a3e-3f1b2a4c5d6e';
const PERIOD_B = '2b7c9d1e-8f4a-4b6c-a5d3-7e9f1a2b3c4d';
const UNKNOWN_ID = 'a3c5e7f9-1b2d-4e6f-8a0b-c1d2e3f4a5b6';
const VALID = { startDate: '2026-11-01', endDate: '2026-11-05', nightlyPriceCents: 8_550, minimumNights: 2 };

const day = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

// An in-memory rate_periods table that answers the repository's queries with
// PostgreSQL's semantics for the operators it uses (DATE compared as instants).
let rows: Row[];

function seed(id: string, startDate: string, endDate: string, nightlyPriceCents = 9_000, minimumNights = 1): void {
  rows.push({ id, startDate: day(startDate), endDate: day(endDate), nightlyPriceCents, minimumNights });
}

function knownError(code: string, meta?: Record<string, unknown>) {
  return new Prisma.PrismaClientKnownRequestError(`Prisma error ${code}`, { code, clientVersion: 'test', meta });
}

function adapterError(sqlState: string) {
  return knownError('P2039', {
    driverAdapterError: {
      cause: { kind: 'postgres', code: sqlState, originalCode: sqlState, originalMessage: 'constraint violation' },
    },
  });
}

function list(headers: Record<string, string> = SAME_ORIGIN): Promise<Response> {
  return GET(new NextRequest('http://0.0.0.0:3000/api/admin/rate-periods', { headers }), { params: Promise.resolve({}) });
}

function create(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return POST(new NextRequest('http://0.0.0.0:3000/api/admin/rate-periods', {
    method: 'POST',
    headers: { ...JSON_HEADERS, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), { params: Promise.resolve({}) });
}

function replace(id: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return PUT(new NextRequest(`http://0.0.0.0:3000/api/admin/rate-periods/${id}`, {
    method: 'PUT',
    headers: { ...JSON_HEADERS, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }), { params: Promise.resolve({ id }) });
}

function remove(id: string, headers: Record<string, string> = {}): Promise<Response> {
  return DELETE(new NextRequest(`http://0.0.0.0:3000/api/admin/rate-periods/${id}`, {
    method: 'DELETE',
    headers: { ...SAME_ORIGIN, ...headers },
  }), { params: Promise.resolve({ id }) });
}

function expectNoWrite(): void {
  expect(mocks.transaction).not.toHaveBeenCalled();
  expect(mocks.ratePeriod.create).not.toHaveBeenCalled();
  expect(mocks.ratePeriod.update).not.toHaveBeenCalled();
  expect(mocks.ratePeriod.deleteMany).not.toHaveBeenCalled();
}

describe('admin rate-period API', () => {
  beforeEach(() => {
    rows = [];
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async (work: (tx: unknown) => Promise<unknown>) => work({ ratePeriod: mocks.ratePeriod }));
    mocks.ratePeriod.findMany.mockImplementation(async (args: { orderBy?: { startDate?: string } }) => {
      const copy = rows.map((row) => ({ ...row }));
      return args.orderBy?.startDate === 'asc'
        ? copy.sort((left, right) => left.startDate.getTime() - right.startDate.getTime())
        : copy;
    });
    mocks.ratePeriod.findFirst.mockImplementation(async ({ where }: {
      where: { startDate: { lt: Date }; endDate: { gt: Date }; id?: { not: string } };
    }) => rows.find((row) => row.startDate < where.startDate.lt
      && row.endDate > where.endDate.gt
      && row.id !== where.id?.not) ?? null);
    mocks.ratePeriod.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      return row ? { ...row } : null;
    });
    mocks.ratePeriod.create.mockImplementation(async ({ data }: { data: Row }) => {
      rows.push({ ...data });
      return { ...data };
    });
    mocks.ratePeriod.update.mockImplementation(async ({ where, data }: { where: { id: string }; data: Omit<Row, 'id'> }) => {
      const row = rows.find((candidate) => candidate.id === where.id);
      if (!row) throw knownError('P2025');
      Object.assign(row, data);
      return { ...row };
    });
    mocks.ratePeriod.deleteMany.mockImplementation(async ({ where }: { where: { id: string } }) => {
      const before = rows.length;
      rows = rows.filter((row) => row.id !== where.id);
      return { count: before - rows.length };
    });
  });

  describe('authentication and request shape', () => {
    it.each([
      ['GET', () => list()],
      ['POST', () => create(VALID)],
      ['PUT', () => replace(PERIOD_A, VALID)],
      ['DELETE', () => remove(PERIOD_A)],
    ])('answers 401 to %s without an admin session and touches no data', async (_method, call) => {
      mocks.isAdminRequest.mockResolvedValue(false);

      const response = await call();

      expect(response.status).toBe(401);
      expect(mocks.ratePeriod.findMany).not.toHaveBeenCalled();
      expectNoWrite();
    });

    it.each([
      ['POST', () => create(VALID, { origin: 'https://evil.example' })],
      ['PUT', () => replace(PERIOD_A, VALID, { origin: 'https://evil.example' })],
      ['DELETE', () => remove(PERIOD_A, { origin: 'https://evil.example' })],
    ])('answers 403 to a cross-origin %s', async (_method, call) => {
      seed(PERIOD_A, '2026-11-01', '2026-11-05');

      const response = await call();

      expect(response.status).toBe(403);
      expectNoWrite();
    });

    it.each([
      ['POST', () => create(VALID, { 'content-type': 'text/plain' })],
      ['PUT', () => replace(PERIOD_A, VALID, { 'content-type': 'text/plain' })],
    ])('answers 415 to a non-JSON %s', async (_method, call) => {
      const response = await call();

      expect(response.status).toBe(415);
      expectNoWrite();
    });

    it.each([
      ['POST', () => create({ ...VALID, padding: 'x'.repeat(4 * 1_024) })],
      ['PUT', () => replace(PERIOD_A, { ...VALID, padding: 'x'.repeat(4 * 1_024) })],
    ])('answers 413 to a %s body over 4 KiB', async (_method, call) => {
      const response = await call();

      expect(response.status).toBe(413);
      expectNoWrite();
    });
  });

  describe('validation', () => {
    it.each([
      ['an unknown key', { ...VALID, currency: 'EUR' }],
      ['a fractional price', { ...VALID, nightlyPriceCents: 85.5 }],
      ['a string price', { ...VALID, nightlyPriceCents: '8550' }],
      ['a price below 100 cents', { ...VALID, nightlyPriceCents: 99 }],
      ['a price above 1,000,000 cents', { ...VALID, nightlyPriceCents: 1_000_001 }],
      ['end on the start day', { ...VALID, endDate: VALID.startDate }],
      ['end before start', { ...VALID, startDate: '2026-11-05', endDate: '2026-11-01' }],
      ['367 nights', { ...VALID, startDate: '2032-01-01', endDate: '2033-01-02' }],
      ['minimumNights 0', { ...VALID, minimumNights: 0 }],
      ['minimumNights above the longest bookable stay (31)', { ...VALID, minimumNights: 31 }],
      ['a fractional minimumNights', { ...VALID, minimumNights: 1.5 }],
      ['a day that does not exist', { ...VALID, startDate: '2026-02-29', endDate: '2026-03-02' }],
      ['instants instead of dates', { ...VALID, startDate: '2026-11-01T00:00:00.000Z' }],
      ['a year below 0100', { ...VALID, startDate: '0050-01-01', endDate: '0050-01-05' }],
      ['a missing field', { startDate: VALID.startDate, endDate: VALID.endDate, nightlyPriceCents: 8_550 }],
    ])('answers 422 to %s on create and on replace', async (_label, body) => {
      seed(PERIOD_A, '2020-01-01', '2020-01-05');

      const created = await create(body);
      const replaced = await replace(PERIOD_A, body);

      expect(created.status).toBe(422);
      expect(replaced.status).toBe(422);
      expectNoWrite();
    });

    it('accepts the longest period, 366 nights', async () => {
      const response = await create({ ...VALID, startDate: '2032-01-01', endDate: '2033-01-01' });

      expect(response.status).toBe(201);
    });

    it.each([
      ['PUT', () => replace('not-a-uuid', VALID)],
      ['DELETE', () => remove('not-a-uuid')],
    ])('answers 404 to a malformed id on %s, as the other admin [id] routes do', async (_label, call) => {
      const response = await call();

      expect(response.status).toBe(404);
      expect(mocks.ratePeriod.findUnique).not.toHaveBeenCalled();
      expectNoWrite();
    });
  });

  describe('create', () => {
    it('stores exact cents and UTC-midnight dates in a serializable transaction and returns ISO dates', async () => {
      vi.stubEnv('TZ', 'Europe/Athens');
      const info = vi.spyOn(logger, 'info');

      const response = await create(VALID);

      expect(response.status).toBe(201);
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
      expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
      const data = mocks.ratePeriod.create.mock.calls[0][0].data as Row;
      expect(data.startDate.toISOString()).toBe('2026-11-01T00:00:00.000Z');
      expect(data.endDate.toISOString()).toBe('2026-11-05T00:00:00.000Z');
      expect(data.nightlyPriceCents).toBe(8_550);
      expect(data.minimumNights).toBe(2);
      expect(data.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const { ratePeriod } = (await response.json()).data;
      expect(ratePeriod).toEqual({ id: data.id, ...VALID });
      expect(info).toHaveBeenCalledWith('Rate period created', {
        ratePeriodId: data.id,
        startDate: '2026-11-01',
        endDate: '2026-11-05',
        nightlyPriceCents: 8_550,
      });
    });

    it('answers 409 with a generic message when the pre-check finds an overlap', async () => {
      seed(PERIOD_A, '2026-11-04', '2026-11-10');

      const response = await create(VALID);

      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body.error.code).toBe('CONFLICT');
      expect(body.error.message).toBe('The dates overlap an existing rate period');
      expect(JSON.stringify(body)).not.toContain(PERIOD_A);
      expect(mocks.ratePeriod.create).not.toHaveBeenCalled();
      expect(rows).toHaveLength(1);
    });

    it('answers 409 when the database exclusion constraint (P2039 carrying 23P01) rejects the insert', async () => {
      mocks.ratePeriod.create.mockRejectedValueOnce(adapterError('23P01'));

      const response = await create(VALID);

      expect(response.status).toBe(409);
      expect((await response.json()).error.message).toBe('The dates overlap an existing rate period');
      expect(mocks.transaction).toHaveBeenCalledTimes(1);
    });

    it('does not treat another adapter error as an overlap', async () => {
      mocks.ratePeriod.create.mockRejectedValueOnce(adapterError('23514'));

      const response = await create(VALID);

      expect(response.status).toBe(500);
    });

    it('allows periods adjacent on either side (end dates are exclusive)', async () => {
      seed(PERIOD_A, '2026-11-05', '2026-11-10');
      seed(PERIOD_B, '2026-10-25', '2026-11-01');

      const response = await create(VALID);

      expect(response.status).toBe(201);
      expect(mocks.ratePeriod.findFirst.mock.calls[0][0].where).toEqual({
        startDate: { lt: day('2026-11-05') },
        endDate: { gt: day('2026-11-01') },
      });
      expect(rows).toHaveLength(3);
    });

    it('retries a serialization failure (P2034) and then succeeds', async () => {
      mocks.transaction.mockRejectedValueOnce(knownError('P2034'));
      mocks.transaction.mockRejectedValueOnce(knownError('P2034'));

      const response = await create(VALID);

      expect(response.status).toBe(201);
      expect(mocks.transaction).toHaveBeenCalledTimes(3);
      expect(rows).toHaveLength(1);
    });

    it('gives up after three serialization failures', async () => {
      mocks.transaction.mockRejectedValue(knownError('P2034'));

      const response = await create(VALID);

      expect(response.status).toBe(500);
      expect(mocks.transaction).toHaveBeenCalledTimes(3);
    });
  });

  describe('replace', () => {
    it('excludes the period itself from the overlap check', async () => {
      seed(PERIOD_A, '2026-11-01', '2026-11-10', 9_000, 1);
      seed(PERIOD_B, '2026-11-20', '2026-11-25');

      const response = await replace(PERIOD_A, { ...VALID, startDate: '2026-11-03', endDate: '2026-11-12' });

      expect(response.status).toBe(200);
      expect(mocks.ratePeriod.findFirst.mock.calls[0][0].where).toEqual({
        startDate: { lt: day('2026-11-12') },
        endDate: { gt: day('2026-11-03') },
        id: { not: PERIOD_A },
      });
      expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: 'Serializable' });
      expect((await response.json()).data.ratePeriod).toEqual({
        id: PERIOD_A,
        startDate: '2026-11-03',
        endDate: '2026-11-12',
        nightlyPriceCents: 8_550,
        minimumNights: 2,
      });
      expect(rows.find((row) => row.id === PERIOD_A)).toEqual({
        id: PERIOD_A,
        startDate: day('2026-11-03'),
        endDate: day('2026-11-12'),
        nightlyPriceCents: 8_550,
        minimumNights: 2,
      });
    });

    it('answers 409 when the new dates overlap another period', async () => {
      seed(PERIOD_A, '2026-11-01', '2026-11-10');
      seed(PERIOD_B, '2026-11-20', '2026-11-25');

      const response = await replace(PERIOD_A, { ...VALID, startDate: '2026-11-01', endDate: '2026-11-21' });

      expect(response.status).toBe(409);
      expect(mocks.ratePeriod.update).not.toHaveBeenCalled();
    });

    it('answers 409 when the exclusion constraint rejects the update', async () => {
      seed(PERIOD_A, '2026-11-01', '2026-11-10');
      mocks.ratePeriod.update.mockRejectedValueOnce(adapterError('23P01'));

      const response = await replace(PERIOD_A, VALID);

      expect(response.status).toBe(409);
    });

    it('answers 404 for an unknown id', async () => {
      const response = await replace(UNKNOWN_ID, VALID);

      expect(response.status).toBe(404);
      expect(mocks.ratePeriod.findFirst).not.toHaveBeenCalled();
      expect(mocks.ratePeriod.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('deletes an existing period', async () => {
      seed(PERIOD_A, '2026-11-01', '2026-11-10');

      const response = await remove(PERIOD_A);

      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual({ id: PERIOD_A });
      expect(rows).toEqual([]);
    });

    it('answers 404 for an unknown id', async () => {
      seed(PERIOD_A, '2026-11-01', '2026-11-10');

      const response = await remove(UNKNOWN_ID);

      expect(response.status).toBe(404);
      expect(rows).toHaveLength(1);
    });
  });

  describe('list', () => {
    it('lists the periods by start date with ISO dates (end exclusive) and cents', async () => {
      seed(PERIOD_B, '2027-04-01', '2027-11-01', 11_000, 3);
      seed(PERIOD_A, '2026-11-01', '2027-04-01', 7_500, 2);

      const response = await list();

      expect(response.status).toBe(200);
      expect((await response.json()).data.ratePeriods).toEqual([
        { id: PERIOD_A, startDate: '2026-11-01', endDate: '2027-04-01', nightlyPriceCents: 7_500, minimumNights: 2 },
        { id: PERIOD_B, startDate: '2027-04-01', endDate: '2027-11-01', nightlyPriceCents: 11_000, minimumNights: 3 },
      ]);
      expectNoWrite();
    });
  });
});
