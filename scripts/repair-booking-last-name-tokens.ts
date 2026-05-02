#!/usr/bin/env tsx
import { prisma } from '@/lib/prisma';
import {
  hashLegacyBookingLastNameNoWsToken,
  hashLegacyBookingLastNameToken,
  isLegacyRawBookingLastNameToken,
} from '@/lib/bookingLastNameTokens';

const APPLY_ENV = 'REPAIR_BOOKING_LAST_NAME_TOKENS_APPLY';
const shouldApply = process.env[APPLY_ENV] === '1';

async function main() {
  const bookings = await prisma.booking.findMany({
    where: {
      OR: [
        { lastNameToken: { not: null } },
        { lastNameTokenNoWs: { not: null } },
      ],
    },
    select: {
      id: true,
      reference: true,
      lastNameToken: true,
      lastNameTokenNoWs: true,
    },
  });

  const candidates = bookings
    .map((booking) => {
      const hasLegacyToken = isLegacyRawBookingLastNameToken(booking.lastNameToken);
      const hasLegacyNoWsToken = isLegacyRawBookingLastNameToken(booking.lastNameTokenNoWs);
      if (!booking.lastNameToken || (!hasLegacyToken && !hasLegacyNoWsToken)) {
        return null;
      }

      return {
        id: booking.id,
        reference: booking.reference,
        lastNameToken: hasLegacyToken
          ? hashLegacyBookingLastNameToken(booking.lastNameToken)
          : booking.lastNameToken,
        lastNameTokenNoWs: hasLegacyNoWsToken && booking.lastNameTokenNoWs
          ? hashLegacyBookingLastNameNoWsToken(booking.lastNameTokenNoWs)
          : hasLegacyToken
            ? hashLegacyBookingLastNameNoWsToken(booking.lastNameToken)
          : booking.lastNameTokenNoWs,
        legacyFields: [
          hasLegacyToken ? 'lastNameToken' : undefined,
          hasLegacyNoWsToken ? 'lastNameTokenNoWs' : undefined,
        ].filter(Boolean),
      };
    })
    .filter((booking): booking is NonNullable<typeof booking> => Boolean(booking));

  console.log(`Scanned ${bookings.length} bookings; ${candidates.length} legacy token records found.`);

  if (!shouldApply) {
    console.log(`Dry run only. Set ${APPLY_ENV}=1 to apply repairs.`);
    for (const candidate of candidates.slice(0, 20)) {
      console.log(`Would repair booking ${candidate.id}${candidate.reference ? ` (${candidate.reference})` : ''}: ${candidate.legacyFields.join(', ')}`);
    }
    if (candidates.length > 20) {
      console.log(`...and ${candidates.length - 20} more.`);
    }
    return;
  }

  for (const candidate of candidates) {
    await prisma.booking.update({
      where: { id: candidate.id },
      data: {
        lastNameToken: candidate.lastNameToken,
        lastNameTokenNoWs: candidate.lastNameTokenNoWs ?? null,
      },
    });
  }

  console.log(`Repaired ${candidates.length} booking last-name token records.`);
}

main()
  .catch((error) => {
    console.error('Failed to repair booking last-name tokens:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => undefined);
  });
