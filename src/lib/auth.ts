import { sign, verify, JwtPayload, SignOptions } from 'jsonwebtoken';

const JWT_SECRET: string = process.env.ADMIN_JWT_SECRET || 'dev-secret-change';

export function signAdmin(payload: Record<string, unknown>, expiresIn: NonNullable<SignOptions['expiresIn']> = '2h'): string {
  return sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyAdmin(token: string): (JwtPayload & Record<string, unknown>) | null {
  try {
    return verify(token, JWT_SECRET) as JwtPayload & Record<string, unknown>;
  } catch {
    return null;
  }
}
