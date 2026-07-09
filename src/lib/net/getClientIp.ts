/**
 * IP Extraction Utility
 * 
 * Extract client IP from request headers with support for various proxy configurations.
 * Handles multiple header formats and provides options for trusted proxy scenarios.
 */

import type { NextRequest } from 'next/server';

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
   * @default 'x-client-ip'
   */
  clientIpHeader?: string;
}

/**
 * Extract client IP from request headers
 * 
 * Priority order:
 * 1. Custom client IP header (if provided and trustedProxy=true)
 * 2. CF-Connecting-IP (Cloudflare)
 * 3. X-Real-IP (Nginx, etc.)
 * 4. X-Forwarded-For (comma-separated list, first IP)
 * 5. Remote address (direct connection)
 * 
 * @param request - Next.js NextRequest object
 * @param options - Configuration options
 * @returns Client IP address or 'unknown' if not determinable
 */
export function getClientIp(request: NextRequest, options?: GetClientIpOptions): string {
  const { trustProxy = process.env.NODE_ENV === 'production', clientIpHeader = 'x-client-ip' } = options || {};
  
  // Don't trust proxy headers unless explicitly configured to do so
  if (!trustProxy) {
    return 'unknown';
  }
  
  // Check for pre-extracted client IP from middleware
  const headerNames = [
    clientIpHeader,
    'cf-connecting-ip',
    'x-real-ip',
    'x-forwarded-for',
  ];

  for (const headerName of headerNames) {
    const rawValue = request.headers.get(headerName);
    const candidate = rawValue?.split(',')[0]?.trim();
    if (candidate && isValidIpAddress(candidate)) {
      return normalizeIpAddress(candidate);
    }
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

/**
 * Middleware snippet to set X-Client-IP header
 * 
 * Usage in middleware.ts:
 * ```ts
 * import { NextRequest } from 'next/server';
 * 
 * export function middleware(request: NextRequest) {
 *   // Extract and forward client IP
 *   const forwardedFor = request.headers.get('x-forwarded-for');
 *   const clientIP = forwardedFor ? forwardedFor.split(',')[0].trim() : request.ip || 'unknown';
 *   request.headers.set('x-client-ip', clientIP);
 *   
 *   // Continue with response
 *   return NextResponse.next();
 * }
 * ```
 */