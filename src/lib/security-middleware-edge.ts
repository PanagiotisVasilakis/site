/**
 * Security headers, nonce-based CSP and CORS enforcement applied by src/proxy.ts.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSecurityConfig,
  buildCSPDirective,
  buildPermissionsPolicy,
  generateNonce,
  type SecurityEvent,
} from '@/lib/security-config';
import { logSecurityDiagnostic } from '@/lib/security-monitoring';
import { getClientIp } from '@/lib/net/getClientIp';
import { isSameOriginRequest } from '@/lib/net/sameOrigin';
import { pathLocale } from '@/i18n/config';

type Config = ReturnType<typeof getSecurityConfig>;

const DIRECT_HEALTH_PROBE_PATHS = new Set([
  '/api/health/live',
  '/api/health/ready',
]);

function buildCsp(config: Config, nonce: string): { headerName: string; value: string } {
  const { csp } = config;
  let value = buildCSPDirective(csp.directives, csp.useNonce ? nonce : undefined);
  if (csp.reportUri) {
    value += `; report-uri ${csp.reportUri}`;
  }
  const headerName = csp.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
  return { headerName, value };
}

function applySecurityHeaders(response: NextResponse, headers: Config['headers']): void {
  if (headers.hsts.enabled) {
    const directives = [`max-age=${headers.hsts.maxAge}`];
    if (headers.hsts.includeSubDomains) directives.push('includeSubDomains');
    if (headers.hsts.preload) directives.push('preload');
    response.headers.set('Strict-Transport-Security', directives.join('; '));
  }

  response.headers.set('X-Frame-Options', headers.frameOptions);
  if (headers.contentTypeOptions) {
    response.headers.set('X-Content-Type-Options', 'nosniff');
  }
  response.headers.set('Referrer-Policy', headers.referrerPolicy);
  response.headers.set('Permissions-Policy', buildPermissionsPolicy(headers.permissionsPolicy));
  response.headers.set('Cross-Origin-Embedder-Policy', headers.crossOriginEmbedderPolicy);
  response.headers.set('Cross-Origin-Opener-Policy', headers.crossOriginOpenerPolicy);
  response.headers.set('Cross-Origin-Resource-Policy', headers.crossOriginResourcePolicy);
  response.headers.set('X-DNS-Prefetch-Control', 'on');
  response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
}

function handleSecurityHeaders(request: NextRequest, config: Config): NextResponse {
  const nonce = generateNonce();
  const csp = buildCsp(config, nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('Content-Security-Policy', csp.value);
  requestHeaders.set('x-nonce', nonce);
  const { pathname } = request.nextUrl;
  requestHeaders.set('x-locale', pathLocale(pathname) ?? 'en');

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, config.headers);
  response.headers.set(csp.headerName, csp.value);
  return response;
}

function isOriginAllowed(origin: string, request: NextRequest, cors: Config['cors']): boolean {
  if (cors.origins.includes(origin) || cors.origins.includes('*')) return true;
  return isSameOriginRequest(origin, request);
}

function handlePreflight(request: NextRequest, origin: string | null, cors: Config['cors']): NextResponse {
  const response = new NextResponse(null, { status: 200 });

  if (origin && isOriginAllowed(origin, request, cors)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }

  if (cors.credentials) {
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  response.headers.set('Access-Control-Allow-Methods', cors.methods.join(', '));
  response.headers.set('Access-Control-Allow-Headers', cors.allowedHeaders.join(', '));
  response.headers.set('Access-Control-Max-Age', cors.maxAge.toString());

  return response;
}

/** Answers preflights and rejects disallowed origins; null lets the request continue. */
function handleCors(request: NextRequest, cors: Config['cors']): NextResponse | null {
  if (!request.nextUrl.pathname.startsWith('/api/')) return null;
  // Health probes intentionally have no CORS surface. Skipping avoids an
  // attacker-controlled Origin turning a direct probe into an audit DB write.
  if (DIRECT_HEALTH_PROBE_PATHS.has(request.nextUrl.pathname)) return null;

  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    return handlePreflight(request, origin, cors);
  }

  if (origin && !isOriginAllowed(origin, request, cors)) {
    const event: SecurityEvent = {
      type: 'cors_violation',
      severity: 'medium',
      timestamp: new Date().toISOString(),
      ip: getClientIp(request),
      url: request.nextUrl.pathname,
      details: { origin },
    };

    logSecurityDiagnostic(event);
    return new NextResponse('CORS violation', { status: 403 });
  }

  return null;
}

function applyActualRequestHeaders(request: NextRequest, response: NextResponse, cors: Config['cors']): void {
  const origin = request.headers.get('origin');
  if (!request.nextUrl.pathname.startsWith('/api/')
    || !origin || !isOriginAllowed(origin, request, cors)) return;
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.append('Vary', 'Origin');
  if (cors.credentials) response.headers.set('Access-Control-Allow-Credentials', 'true');
}

export function createSecurityMiddleware() {
  // Config is read once, when the middleware is created, as it always was.
  const config = getSecurityConfig();

  return async (request: NextRequest): Promise<NextResponse> => {
    const corsResponse = handleCors(request, config.cors);
    if (corsResponse) {
      return corsResponse;
    }

    const response = handleSecurityHeaders(request, config);
    applyActualRequestHeaders(request, response, config.cors);
    return response;
  };
}
