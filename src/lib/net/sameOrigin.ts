import type { NextRequest } from 'next/server';

import { getClientIp } from '@/lib/net/getClientIp';

/**
 * Whether a browser `Origin` names the origin the request was actually sent to.
 *
 * Do not compare against `request.nextUrl.origin` alone: in a route handler
 * Next builds that URL from the server's bind hostname (`0.0.0.0` with
 * `next dev -H 0.0.0.0`, `localhost` behind the loopback-bound standalone
 * server), not from the public host. The HTTP `Host` header carries the host
 * the browser contacted; `x-forwarded-proto` is trusted only when the request
 * came through the attested ingress hop.
 */
export function isSameOriginRequest(origin: string, request: NextRequest): boolean {
  if (origin === request.nextUrl.origin) return true;
  try {
    const parsedOrigin = new URL(origin);
    const requestHost = request.headers.get('host')?.toLowerCase();
    if (!requestHost || parsedOrigin.host.toLowerCase() !== requestHost) return false;

    const trustsProxy = getClientIp(request) !== 'unknown';
    const forwardedProtocol = trustsProxy
      ? request.headers.get('x-forwarded-proto')?.split(',', 1)[0]?.trim().toLowerCase()
      : undefined;
    const requestProtocol = forwardedProtocol ? `${forwardedProtocol}:` : request.nextUrl.protocol;
    return parsedOrigin.protocol === requestProtocol;
  } catch {
    return false;
  }
}
