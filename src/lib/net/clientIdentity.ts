import { isIP } from 'node:net';

import { NextResponse, type NextRequest } from 'next/server';

import { getClientIp, type GetClientIpOptions } from '@/lib/net/getClientIp';

export const CLIENT_IDENTITY_UNAVAILABLE = 'CLIENT_IDENTITY_UNAVAILABLE' as const;
export type ClientIdentityUnavailableReason =
  | 'missing'
  | 'sentinel'
  | 'malformed'
  | 'multi_value'
  | 'unsupported_format';

/**
 * Internal control-flow error for operations that require an available,
 * canonical client IP from the configured resolver.
 *
 * Deliberately carries no header value. Its reason is constrained to a bounded
 * internal enum so route layers can map the stable code to a generic response
 * without exposing trust-boundary diagnostics.
 */
export class ClientIdentityUnavailableError extends Error {
  readonly code = CLIENT_IDENTITY_UNAVAILABLE;
  readonly reason: ClientIdentityUnavailableReason;

  constructor(reason: ClientIdentityUnavailableReason) {
    super('Request cannot be processed');
    this.name = 'ClientIdentityUnavailableError';
    this.reason = reason;
  }
}

export function isClientIdentityUnavailableError(
  error: unknown,
): error is ClientIdentityUnavailableError {
  return error instanceof ClientIdentityUnavailableError
    || (typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === CLIENT_IDENTITY_UNAVAILABLE);
}

/** Stable public mapping; never include the internal code or rejection reason. */
export function createClientIdentityUnavailableResponse(): NextResponse {
  return NextResponse.json({
    success: false,
    error: { message: 'Service temporarily unavailable' },
  }, {
    status: 503,
    headers: {
      'cache-control': 'no-store',
    },
  });
}

function canonicalizeIpv4(value: string): string {
  return value.split('.').map((octet) => String(Number(octet))).join('.');
}

function mappedIpv4FromCanonicalIpv6(value: string): string | null {
  const match = value.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u);
  if (!match) return null;

  const high = Number.parseInt(match[1], 16);
  const low = Number.parseInt(match[2], 16);
  return [high >>> 8, high & 0xff, low >>> 8, low & 0xff].join('.');
}

/**
 * Validate and normalize one IP literal. Chains, ports, hostnames, zone IDs,
 * brackets, and values with whitespace are never client identities.
 */
export function canonicalizeClientIp(value: string): string | null {
  if (!value || value.length > 45 || value !== value.trim()) return null;
  if (value.includes(',') || value.includes('%') || value.includes('[') || value.includes(']')) {
    return null;
  }
  if (/\s/u.test(value)) return null;

  const version = isIP(value);
  if (version === 4) return canonicalizeIpv4(value);
  if (version !== 6) return null;

  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    if (!hostname.startsWith('[') || !hostname.endsWith(']')) return null;
    const canonical = hostname.slice(1, -1).toLowerCase();
    return mappedIpv4FromCanonicalIpv6(canonical) ?? canonical;
  } catch {
    return null;
  }
}

function configuredRawSource(
  request: NextRequest,
  options?: GetClientIpOptions,
): string | null {
  const proxyMode = process.env.TRUST_PROXY_MODE || 'none';
  const configuredHeader = options?.clientIpHeader || process.env.CLIENT_IP_HEADER;
  if ((proxyMode === 'header' || options?.clientIpHeader !== undefined) && configuredHeader) {
    return request.headers.get(configuredHeader);
  }
  if (proxyMode === 'hops' || options?.trustedHops !== undefined) {
    return request.headers.get('x-forwarded-for');
  }
  return null;
}

function unavailableReason(value: string | null): ClientIdentityUnavailableReason {
  if (value === null || value === '') return 'missing';
  if (value.toLowerCase() === 'unknown') return 'sentinel';
  if (value.includes(',')) return 'multi_value';
  if (value !== value.trim() || /\s/u.test(value)) return 'malformed';
  return 'unsupported_format';
}

/** Resolve the source selected by getClientIp to one canonical literal. */
export function requireCanonicalClientIp(
  request: NextRequest,
  options?: GetClientIpOptions,
): string {
  const rawSource = configuredRawSource(request, options);
  if (rawSource !== null && canonicalizeClientIp(rawSource) === null) {
    throw new ClientIdentityUnavailableError(unavailableReason(rawSource));
  }

  const selected = getClientIp(request, options);
  const canonical = canonicalizeClientIp(selected);
  if (!canonical) {
    throw new ClientIdentityUnavailableError(
      selected === 'unknown' && rawSource === null ? 'sentinel' : unavailableReason(selected),
    );
  }
  return canonical;
}
