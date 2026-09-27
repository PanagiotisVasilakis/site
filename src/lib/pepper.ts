/**
 * Keys for the HMACs over claim tokens and privacy-preserving identifiers.
 * There is no fallback value in any environment: the runtime environment schema
 * requires both keys at startup, and `npm run ensure-pepper` generates them for
 * local development. `hashSensitive` (crypto.ts) keeps its own module-load
 * resolver; its construction is out of scope (R-053).
 */
export function requirePepper(name: 'SECURITY_PEPPER' | 'CLAIM_TOKEN_PEPPER'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
