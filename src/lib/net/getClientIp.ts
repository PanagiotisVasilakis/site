import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

import type { NextRequest } from 'next/server';

export const VERIFIED_CLIENT_IP_HEADER = 'x-origin-verified-client-ip' as const;
export const ORIGIN_PROXY_ATTESTATION_HEADER = 'x-origin-proxy-attestation' as const;

/**
 * Retained only as a source-compatibility type for callers and historical tests.
 * Request-local options can never opt into trusting a public forwarding header.
 */
export interface GetClientIpOptions {
  trustProxy?: boolean;
  clientIpHeader?: string;
  trustedHops?: number;
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

/** One IP literal only: no chains, ports, brackets, zones, or whitespace. */
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

function validAttestation(presented: string | null): boolean {
  const expected = process.env.ORIGIN_PROXY_SHARED_SECRET;
  if (!presented || !expected || presented.length > 128 || presented.includes(',')) return false;

  const suppliedBytes = Buffer.from(presented, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return suppliedBytes.length === expectedBytes.length
    && timingSafeEqual(suppliedBytes, expectedBytes);
}

/**
 * Resolve the canonical identity asserted by the local trusted reverse proxy.
 *
 * Public forwarding headers are deliberately ignored. Both private headers are
 * overwritten by Nginx, and the attestation is compared in constant time. A
 * duplicate Fetch header is comma-coalesced and therefore rejected.
 */
export function getClientIp(request: NextRequest, _options?: GetClientIpOptions): string {
  void _options;
  const attestation = request.headers.get(ORIGIN_PROXY_ATTESTATION_HEADER);
  if (!validAttestation(attestation)) return 'unknown';

  const candidate = request.headers.get(VERIFIED_CLIENT_IP_HEADER);
  return candidate ? canonicalizeClientIp(candidate) ?? 'unknown' : 'unknown';
}
