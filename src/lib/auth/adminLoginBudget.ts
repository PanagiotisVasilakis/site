import type { NextRequest } from 'next/server';

import { requireCanonicalClientIp } from '@/lib/net/clientIdentity';
import { privacyHmac } from '@/lib/privacyHash';

/** The scope of the administrator sign-in budget in checkSensitiveRateLimit (src/lib/sensitiveRateLimit.ts). */
export const ADMIN_LOGIN_RATE_LIMIT_SCOPE = 'admin-login';

/**
 * The address dimension of the sensitive limiter, spelled the way sensitiveRateLimit.ts spells it
 * (`limiterAddressDimension`): an IPv4 address keeps all of it, an IPv6 address is grouped by its /64
 * network, because one subscriber normally controls a whole /64. The canonical address from
 * requireCanonicalClientIp is lowercase hex pieces with at most one `::` and no dotted-quad tail.
 * tests/security/admin-login-budget.test.ts pins that both modules write and refund the same row.
 */
function addressDimension(ip: string): string {
  if (!ip.includes(':')) return `ip:${ip}`;
  const [head, tail] = ip.split('::');
  const pieces = (part: string | undefined) => (part ? part.split(':') : []);
  const left = pieces(head);
  const right = pieces(tail);
  const hextets = [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  return `ip6:${hextets.slice(0, 4).join(':')}::/64`;
}

/**
 * Gives back the attempt that a correct administrator token counted on the sign-in budget of its
 * client address, so only failed attempts use up the budget: an operator who signs in several times
 * is not locked out, and the wrong guesses of an attacker keep counting. There is no identifier
 * dimension to refund (a shared one would let anyone lock the administrator out), so the address
 * row itself is refunded. That is safe here and not for the guest sign-in: a refund needs the
 * administrator secret, so a caller cannot offset its own guesses with successes of someone else's.
 * The row stays PostgreSQL-backed and keeps its window; a spent window is never reopened.
 */
export async function refundAdminLoginAttempt(request: NextRequest): Promise<void> {
  const key = `sensitive:${privacyHmac(
    `${ADMIN_LOGIN_RATE_LIMIT_SCOPE}|${addressDimension(requireCanonicalClientIp(request))}`,
    'sensitive-rate-limit:v1',
  )}`;
  const { prisma } = await import('@/lib/prisma');
  await prisma.$executeRaw`
    UPDATE "rate_limits" SET "count" = GREATEST("count" - 1, 0)
    WHERE "key" = ${key} AND "reset_time" > CURRENT_TIMESTAMP
  `;
}
