/**
 * Request utilities for extracting client information
 * Shared across security middleware and API routes
 */

import type { NextRequest } from 'next/server';

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
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const cfConnectingIP = request.headers.get('cf-connecting-ip');

    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }

    if (realIP) {
        return realIP;
    }

    if (cfConnectingIP) {
        return cfConnectingIP;
    }

    return 'unknown';
}
