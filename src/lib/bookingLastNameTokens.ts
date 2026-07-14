import { hmacDeterministic } from '@/lib/crypto';

const HMAC_SHA256_HEX = /^[a-f0-9]{64}$/i;

function unique(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function normalizeBookingLastName(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeBookingLastNameNoWs(value: string): string {
  return normalizeBookingLastName(value).replace(/\s+/g, '');
}

export function createBookingLastNameTokens(lastName: string): {
  lastNameToken: string;
  lastNameTokenNoWs: string;
} {
  return createBookingLastNameTokensFromNormalized(normalizeBookingLastName(lastName));
}

export function createBookingLastNameTokensFromNormalized(normalizedLastName: string): {
  lastNameToken: string;
  lastNameTokenNoWs: string;
} {
  const normalized = normalizedLastName;
  const normalizedNoWs = normalized.replace(/\s+/g, '');
  return {
    lastNameToken: hmacDeterministic(normalized),
    lastNameTokenNoWs: hmacDeterministic(normalizedNoWs),
  };
}

export function createBookingLastNameTokensFromStoredLegacyValues(
  lastNameToken: string,
  lastNameTokenNoWs?: string | null,
): {
  lastNameToken: string;
  lastNameTokenNoWs: string;
} {
  const normalized = normalizeBookingLastName(lastNameToken);
  const normalizedNoWs = lastNameTokenNoWs
    ? normalizeBookingLastName(lastNameTokenNoWs).replace(/\s+/g, '')
    : normalized.replace(/\s+/g, '');

  return {
    lastNameToken: hmacDeterministic(normalized),
    lastNameTokenNoWs: hmacDeterministic(normalizedNoWs),
  };
}

export function hashLegacyBookingLastNameToken(value: string): string {
  return hmacDeterministic(normalizeBookingLastName(value));
}

export function hashLegacyBookingLastNameNoWsToken(value: string): string {
  return hmacDeterministic(normalizeBookingLastName(value).replace(/\s+/g, ''));
}

export function buildBookingLastNameTokenSearchValues(
  lastName: string,
  options: { includeLegacyRaw?: boolean } = {},
): string[] {
  const includeLegacyRaw = options.includeLegacyRaw ?? true;
  const normalized = normalizeBookingLastName(lastName);
  const normalizedNoWs = normalized.replace(/\s+/g, '');
  const hmacTokens = normalized
    ? createBookingLastNameTokensFromNormalized(normalized)
    : undefined;

  return unique([
    hmacTokens?.lastNameToken,
    hmacTokens?.lastNameTokenNoWs,
    includeLegacyRaw ? normalized || undefined : undefined,
    includeLegacyRaw ? normalizedNoWs || undefined : undefined,
  ]);
}

export function isLegacyRawBookingLastNameToken(value: string | null | undefined): boolean {
  return Boolean(value && !HMAC_SHA256_HEX.test(value));
}
