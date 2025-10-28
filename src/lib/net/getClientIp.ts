/**
 * IP Extraction Utility
 * 
 * Extract client IP from request headers with support for various proxy configurations.
 * Handles multiple header formats and provides options for trusted proxy scenarios.
 */

import { NextRequest } from 'next/server';

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
  const clientIP = request.headers.get(clientIpHeader);
  if (clientIP) {
    return clientIP.trim();
  }
  
  // Cloudflare connecting IP
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP.trim();
  }
  
  // X-Real-IP (Nginx, etc.)
  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP.trim();
  }
  
  // X-Forwarded-For (comma-separated list, first IP is client)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take first IP in the list (client IP)
    return forwardedFor.split(',')[0].trim();
  }
  
  // Fallback: Return unknown if no IP can be determined
  return 'unknown';
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