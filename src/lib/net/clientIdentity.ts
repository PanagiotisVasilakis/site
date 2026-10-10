import { NextResponse, type NextRequest } from 'next/server';

import { logger } from '@/lib/logger-enterprise';

import {
  canonicalizeClientIp,
  getClientIp,
  ORIGIN_PROXY_ATTESTATION_HEADER,
  VERIFIED_CLIENT_IP_HEADER,
} from '@/lib/net/getClientIp';

const CLIENT_IDENTITY_UNAVAILABLE = 'CLIENT_IDENTITY_UNAVAILABLE' as const;
export type ClientIdentityUnavailableReason =
  | 'missing'
  | 'sentinel'
  | 'malformed'
  | 'multi_value'
  | 'unsupported_format'
  | 'attestation_rejected';

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

/**
 * Stable public mapping; never include the internal code or rejection reason.
 *
 * Only the bounded rejection reason is logged (warn level), so a missing or
 * misconfigured trusted-ingress hop, or a local run without
 * `npm run dev:proxy`, is diagnosable next to the access-log line. Header
 * values, addresses and route details are never logged here.
 */
export function createClientIdentityUnavailableResponse(error?: unknown): NextResponse {
  logger.warn('Client identity unavailable; request rejected before persistence', {
    reason: error instanceof ClientIdentityUnavailableError ? error.reason : 'unspecified',
  });
  return NextResponse.json({
    success: false,
    error: { code: 'SERVICE_UNAVAILABLE', message: 'Service temporarily unavailable' },
  }, {
    status: 503,
    headers: {
      'cache-control': 'no-store',
    },
  });
}


function configuredRawSource(
  request: NextRequest,
): string | null {
  return request.headers.get(VERIFIED_CLIENT_IP_HEADER);
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
): string {
  const rawSource = configuredRawSource(request);
  const attestation = request.headers.get(ORIGIN_PROXY_ATTESTATION_HEADER);
  if (attestation === null || attestation === '') {
    throw new ClientIdentityUnavailableError('missing');
  }
  if (attestation.includes(',')) {
    throw new ClientIdentityUnavailableError('multi_value');
  }
  if (rawSource === null) {
    throw new ClientIdentityUnavailableError('missing');
  }
  if (canonicalizeClientIp(rawSource) === null) {
    throw new ClientIdentityUnavailableError(unavailableReason(rawSource));
  }

  const selected = getClientIp(request);
  const canonical = canonicalizeClientIp(selected);
  if (!canonical) {
    // The source is a valid IP here, so the attestation did not match.
    throw new ClientIdentityUnavailableError('attestation_rejected');
  }
  return canonical;
}
