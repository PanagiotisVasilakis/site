import crypto from 'node:crypto';
import { z } from 'zod';

import { Prisma } from '@/generated/prisma/client';
import { fromDbDate, nightsBetween, parseIsoDate, toDbDate } from '@/lib/availability/calendarDate';
import { MAX_STAY_NIGHTS } from '@/data/stayPolicy';
import { logger } from '@/lib/logger-enterprise';
import { prisma } from '@/lib/prisma';

// Seasonal nightly prices. A period covers the nights [startDate, endDate):
// endDate is exclusive (the check-out day), so [a, b) and [b, c) are adjacent,
// not overlapping. The limits mirror the DB constraints of the migration
// add_availability_calendar; the EXCLUDE constraint rate_periods_no_overlap is
// the backstop for the overlap check done here.

const MAX_PERIOD_NIGHTS = 366;
const MAX_TRANSACTION_ATTEMPTS = 3;

const isoDateSchema = z.iso.date().transform((value, context) => {
  // z.iso.date() accepts years 0000-0099, which the UTC-midnight conversion
  // would map to 1900-1999.
  const date = parseIsoDate(value);
  if (date === null) {
    context.addIssue({ code: 'custom', message: 'Date must be between the years 0100 and 9999' });
    return z.NEVER;
  }
  return date;
});

/** Request body of the admin create/replace routes. */
export const ratePeriodInputSchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  nightlyPriceCents: z.number().int().min(100).max(1_000_000),
  // A longer minimum than the longest bookable stay would make the period unbookable.
  minimumNights: z.number().int().min(1).max(MAX_STAY_NIGHTS),
}).strict()
  .refine((value) => nightsBetween(value.startDate, value.endDate) > 0, {
    path: ['endDate'],
    message: 'The end date must be after the start date',
  })
  .refine((value) => nightsBetween(value.startDate, value.endDate) <= MAX_PERIOD_NIGHTS, {
    path: ['endDate'],
    message: `A rate period covers at most ${MAX_PERIOD_NIGHTS} nights`,
  });

type RatePeriodInput = z.infer<typeof ratePeriodInputSchema>;

type RatePeriodRecord = RatePeriodInput & { id: string };

export class RatePeriodOverlapError extends Error {
  constructor() {
    super('The rate period overlaps an existing rate period');
    this.name = 'RatePeriodOverlapError';
  }
}

export class RatePeriodNotFoundError extends Error {
  constructor() {
    super('The rate period was not found');
    this.name = 'RatePeriodNotFoundError';
  }
}

const ratePeriodSelect = {
  id: true,
  startDate: true,
  endDate: true,
  nightlyPriceCents: true,
  minimumNights: true,
} as const;

function toRecord(row: Prisma.RatePeriodGetPayload<{ select: typeof ratePeriodSelect }>): RatePeriodRecord {
  return {
    id: row.id,
    startDate: fromDbDate(row.startDate),
    endDate: fromDbDate(row.endDate),
    nightlyPriceCents: row.nightlyPriceCents,
    minimumNights: row.minimumNights,
  };
}

function toData(input: RatePeriodInput) {
  return {
    startDate: toDbDate(input.startDate),
    endDate: toDbDate(input.endDate),
    nightlyPriceCents: input.nightlyPriceCents,
    minimumNights: input.minimumNights,
  };
}

// adapter-pg has no dedicated kind for SQLSTATE 23P01, so Prisma reports the
// exclusion violation as its generic P2039 and keeps the SQLSTATE on the
// driver adapter error (pinned by tests/integration/availability-schema.test.ts).
// rate_periods has one exclusion constraint, rate_periods_no_overlap.
function isExclusionViolation(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2039') return false;
  const adapterError = error.meta?.driverAdapterError;
  const cause = adapterError && typeof adapterError === 'object' && 'cause' in adapterError
    ? adapterError.cause
    : undefined;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23P01';
}

async function inSerializableTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
        && attempt < MAX_TRANSACTION_ATTEMPTS) continue;
      if (isExclusionViolation(error)) throw new RatePeriodOverlapError();
      throw error;
    }
  }
}

/** Whether another period shares a night with [startDate, endDate). */
async function overlaps(tx: Prisma.TransactionClient, input: RatePeriodInput, excludeId?: string): Promise<boolean> {
  const other = await tx.ratePeriod.findFirst({
    where: {
      startDate: { lt: toDbDate(input.endDate) },
      endDate: { gt: toDbDate(input.startDate) },
      ...(excludeId === undefined ? {} : { id: { not: excludeId } }),
    },
    select: { id: true },
  });
  return other !== null;
}

function logWrite(message: string, record: RatePeriodRecord): void {
  logger.info(message, {
    ratePeriodId: record.id,
    startDate: record.startDate,
    endDate: record.endDate,
    nightlyPriceCents: record.nightlyPriceCents,
  });
}

export async function listRatePeriods(): Promise<RatePeriodRecord[]> {
  const rows = await prisma.ratePeriod.findMany({ orderBy: { startDate: 'asc' }, select: ratePeriodSelect });
  return rows.map(toRecord);
}

export async function createRatePeriod(input: RatePeriodInput): Promise<RatePeriodRecord> {
  const id = crypto.randomUUID();
  const created = toRecord(await inSerializableTransaction(async (tx) => {
    if (await overlaps(tx, input)) throw new RatePeriodOverlapError();
    return tx.ratePeriod.create({ data: { id, ...toData(input) }, select: ratePeriodSelect });
  }));
  logWrite('Rate period created', created);
  return created;
}

export async function replaceRatePeriod(id: string, input: RatePeriodInput): Promise<RatePeriodRecord> {
  const replaced = toRecord(await inSerializableTransaction(async (tx) => {
    const existing = await tx.ratePeriod.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new RatePeriodNotFoundError();
    if (await overlaps(tx, input, id)) throw new RatePeriodOverlapError();
    return tx.ratePeriod.update({ where: { id }, data: toData(input), select: ratePeriodSelect });
  }));
  logWrite('Rate period replaced', replaced);
  return replaced;
}

// One statement: deleting cannot create an overlap, so no transaction is needed.
export async function deleteRatePeriod(id: string): Promise<void> {
  const { count } = await prisma.ratePeriod.deleteMany({ where: { id } });
  if (count === 0) throw new RatePeriodNotFoundError();
  logger.info('Rate period deleted', { ratePeriodId: id });
}
