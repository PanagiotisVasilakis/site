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
import { locales } from '@/i18n/config';

const DIRECT_HEALTH_PROBE_PATHS = new Set([
  '/api/health/live',
  '/api/health/ready',
]);

class SecurityHeadersMiddleware {
  private readonly config = getSecurityConfig();

  public handle(request: NextRequest): NextResponse {
    const nonce = generateNonce();
    const csp = this.buildCsp(nonce);

    const requestHeaders = new Headers(request.headers);
    if (csp.value) {
      requestHeaders.set('Content-Security-Policy', csp.value);
    }
    requestHeaders.set('x-nonce', nonce);
    const { pathname } = request.nextUrl;
    const pathLocale = locales.find((l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`));
    requestHeaders.set('x-locale', pathLocale ?? 'en');

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    this.applySecurityHeaders(response);
    response.headers.set(csp.headerName, csp.value);
    return response;
  }

  private applySecurityHeaders(response: NextResponse): void {
    Object.entries(this.getSecurityHeaders()).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
  }

  private getSecurityHeaders(): Record<string, string> {
    const { headers } = this.config;
    const securityHeaders: Record<string, string> = {};

    if (headers.hsts.enabled) {
      const directives = [`max-age=${headers.hsts.maxAge}`];
      if (headers.hsts.includeSubDomains) directives.push('includeSubDomains');
      if (headers.hsts.preload) directives.push('preload');
      securityHeaders['Strict-Transport-Security'] = directives.join('; ');
    }

    securityHeaders['X-Frame-Options'] = headers.frameOptions;

    if (headers.contentTypeOptions) {
      securityHeaders['X-Content-Type-Options'] = 'nosniff';
    }

    securityHeaders['Referrer-Policy'] = headers.referrerPolicy;
    securityHeaders['Permissions-Policy'] = buildPermissionsPolicy(headers.permissionsPolicy);
    securityHeaders['Cross-Origin-Embedder-Policy'] = headers.crossOriginEmbedderPolicy;
    securityHeaders['Cross-Origin-Opener-Policy'] = headers.crossOriginOpenerPolicy;
    securityHeaders['Cross-Origin-Resource-Policy'] = headers.crossOriginResourcePolicy;
    securityHeaders['X-DNS-Prefetch-Control'] = 'on';
    securityHeaders['X-Permitted-Cross-Domain-Policies'] = 'none';

    return securityHeaders;
  }

  private buildCsp(nonce: string): { headerName: string; value: string } {
    let csp = buildCSPDirective(
      this.config.csp.directives,
      this.config.csp.useNonce ? nonce : undefined,
    );

    if (this.config.csp.reportUri) {
      csp += `; report-uri ${this.config.csp.reportUri}`;
    }

    const headerName = this.config.csp.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    return { headerName, value: csp };
  }

}

class CORSMiddleware {
  private readonly config = getSecurityConfig().cors;

  public async handle(request: NextRequest): Promise<NextResponse | null> {
    if (!request.nextUrl.pathname.startsWith('/api/')) return null;
    // Health probes intentionally have no CORS surface. Skipping avoids an
    // attacker-controlled Origin turning a direct probe into an audit DB write.
    if (DIRECT_HEALTH_PROBE_PATHS.has(request.nextUrl.pathname)) return null;

    const origin = request.headers.get('origin');
    const method = request.method;

    if (method === 'OPTIONS') {
      return this.handlePreflight(request, origin);
    }

    if (origin && !this.isOriginAllowed(origin, request)) {
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

  public applyActualRequestHeaders(request: NextRequest, response: NextResponse): void {
    const origin = request.headers.get('origin');
    if (!request.nextUrl.pathname.startsWith('/api/')
      || !origin || !this.isOriginAllowed(origin, request)) return;
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.append('Vary', 'Origin');
    if (this.config.credentials) response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  private handlePreflight(_request: NextRequest, origin: string | null): NextResponse {
    const response = new NextResponse(null, { status: 200 });

    if (origin && this.isOriginAllowed(origin, _request)) {
      response.headers.set('Access-Control-Allow-Origin', origin);
    }

    if (this.config.credentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }

    response.headers.set('Access-Control-Allow-Methods', this.config.methods.join(', '));
    response.headers.set('Access-Control-Allow-Headers', this.config.allowedHeaders.join(', '));
    response.headers.set('Access-Control-Max-Age', this.config.maxAge.toString());

    return response;
  }

  private isOriginAllowed(origin: string, request: NextRequest): boolean {
    if (this.config.origins.includes(origin) || this.config.origins.includes('*')) return true;
    return isSameOriginRequest(origin, request);
  }
}

export function createSecurityMiddleware() {
  const securityHeaders = new SecurityHeadersMiddleware();
  const cors = new CORSMiddleware();

  return async (request: NextRequest): Promise<NextResponse> => {
    const corsResponse = await cors.handle(request);
    if (corsResponse) {
      return corsResponse;
    }

    const response = securityHeaders.handle(request);
    cors.applyActualRequestHeaders(request, response);
    return response;
  };
}

