import jwt from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface OnsiteGrantClaims extends JwtPayload {
  bookingId: string;
  jti: string;
  aud: 'onsite-confirm';
  exp: number;
}

function getSecret(): string | null {
  const secret = process.env.ONSITE_CONFIRM_JWT_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

export function isOnsiteConfirmationEnabled(): boolean {
  return process.env.ONSITE_CONFIRM_ENABLED === '1' && getSecret() !== null;
}

export function verifyOnsiteGrantToken(token: string): OnsiteGrantClaims | null {
  const secret = getSecret();
  if (!secret) return null;

  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      audience: 'onsite-confirm',
      clockTolerance: 5,
    }) as OnsiteGrantClaims;

    if (!payload.jti
      || !UUID_PATTERN.test(payload.jti)
      || !payload.bookingId
      || !UUID_PATTERN.test(payload.bookingId)
      || typeof payload.exp !== 'number') {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
