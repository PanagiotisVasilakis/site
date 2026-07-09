/**
 * Request utilities for extracting client information
 * Shared across security middleware and API routes
 */

import type { NextRequest } from 'next/server';
import { getClientIp } from '@/lib/net/getClientIp';

/**
 * Extracts the client IP address from a Next.js request.
 * Checks multiple headers in order of preference:
 * 1. x-forwarded-for (from load balancers/proxies)
 * 2. x-real-ip (from nginx)
 * 3. cf-connecting-ip (from Cloudflare)
 * 
 * @param request - The Next.js request object
 * @returns The client IP address or 'unknown' if not determinable
 */
export function getClientIP(request: NextRequest): string {
    return getClientIp(request, { trustProxy: true });
}
