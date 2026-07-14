/**
 * IP Extraction Utility
 * 
 * Extract client IP from request headers with support for various proxy configurations.
 * Handles multiple header formats and provides options for trusted proxy scenarios.
 */

import type { NextRequest } from 'next/server';

// Every candidate is capped at 45 bytes before the linear IP-format checks below.

/**
 * Options for IP extraction
 */
export interface GetClientIpOptions {
  /**
   * Trust proxy headers (x-forwarded-for, etc.)
   * When true, headers from proxies/load balancers are trusted
   * Should be true in production with known proxies, false otherwise
   * @default true in production, false in development
   */
  trustProxy?: boolean;
  
  /**
   * Custom header name for pre-extracted client IP
   * Useful when middleware has already parsed the IP
   * No default. Only explicitly configured cf-connecting-ip or x-real-ip is accepted.
   */
  clientIpHeader?: string;

  /** Number of trusted reverse-proxy hops. Zero means proxy headers are ignored. */
  trustedHops?: number;
}

/**
 * Extract client IP from request headers
 * 
 * Priority order:
 * 1. Explicitly configured single-value proxy header
 * 2. X-Forwarded-For using the configured trusted-hop count
 * 
 * @param request - Next.js NextRequest object
 * @param options - Configuration options
 * @returns Client IP address or 'unknown' if not determinable
 */
export function getClientIp(request: NextRequest, options?: GetClientIpOptions): string {
  const trustProxy = options?.trustProxy ?? process.env.NODE_ENV === 'production';
  const configuredHops = Number.parseInt(process.env.TRUST_PROXY_HOPS || '0', 10);
  const trustedHops = options?.trustedHops ?? (Number.isFinite(configuredHops) ? configuredHops : 0);
  const clientIpHeader = options?.clientIpHeader || process.env.CLIENT_IP_HEADER;
  
  // Don't trust proxy headers unless explicitly configured to do so
  if (!trustProxy || trustedHops < 1) {
    return 'unknown';
  }

  // A single-value header is trusted only when the operator explicitly names it.
  // x-client-ip is intentionally rejected because clients can set it directly.
  if (clientIpHeader && ['cf-connecting-ip', 'x-real-ip'].includes(clientIpHeader.toLowerCase())) {
    const candidate = request.headers.get(clientIpHeader)?.trim();
    if (candidate && isValidIpAddress(candidate)) {
      return normalizeIpAddress(candidate);
    }
  }

  const forwarded = request.headers.get('x-forwarded-for')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
  const candidateIndex = Math.max(0, forwarded.length - trustedHops);
  const candidate = forwarded[candidateIndex];
  if (candidate && isValidIpAddress(candidate)) {
    return normalizeIpAddress(candidate);
  }
  
  // Fallback: Return unknown if no IP can be determined
  return 'unknown';
}

function isValidIpAddress(ip: string): boolean {
  if (!ip || ip.length > 45) return false;

  const ipv4Pattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Pattern.test(ip)) {
    return ip.split('.').every((octet) => {
      const value = Number.parseInt(octet, 10);
      return value >= 0 && value <= 255;
    });
  }

  const ipv6Pattern = /^(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}$/i;
  return ipv6Pattern.test(ip) || (
    ip.includes('::')
    && /^[0-9a-f:.]+$/i.test(ip)
  );
}

function normalizeIpAddress(ip: string): string {
  const normalized = ip.toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)?.[1];
  return mappedIpv4 && isValidIpAddress(mappedIpv4) ? mappedIpv4 : normalized;
}
