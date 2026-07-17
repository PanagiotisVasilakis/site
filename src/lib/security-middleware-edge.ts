/**
 * Security middleware tailored for the Edge runtime.
 * Mirrors the critical behaviour of the Node implementation while
 * avoiding Node-specific dependencies that are unsupported in Vercel Edge.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSecurityConfig,
  buildCSPDirective,
  buildPermissionsPolicy,
  generateNonce,
  logSecurityEvent,
  type SecurityEvent,
} from '@/lib/security-config';
import { getClientIp } from '@/lib/net/getClientIp';

let securityHeadersCache: Record<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const DIRECT_HEALTH_PROBE_PATHS = new Set([
  '/api/health',
  '/api/health/live',
  '/api/health/ready',
]);

interface SecurityMiddlewareOptions {
  skipPaths?: string[];
  enableNonce?: boolean;
  customHeaders?: Record<string, string>;
}

class SecurityHeadersMiddleware {
  private readonly config = getSecurityConfig();
  private readonly options: SecurityMiddlewareOptions;

  constructor(options: SecurityMiddlewareOptions = {}) {
    this.options = {
      skipPaths: ['/api/health', '/favicon.ico'],
      enableNonce: true,
      ...options,
    };
  }

  public handle(request: NextRequest): NextResponse {
    const response = NextResponse.next();

    if (this.shouldSkipPath(request.nextUrl.pathname)) {
      return response;
    }

    const nonce = this.options.enableNonce ? generateNonce() : undefined;

    this.applySecurityHeaders(response, nonce);
    this.applyCspHeaders(response, nonce);

    const requestHeaders = new Headers(request.headers);
    const csp = response.headers.get('Content-Security-Policy')
      || response.headers.get('Content-Security-Policy-Report-Only');
    if (csp) {
      requestHeaders.set('Content-Security-Policy', csp);
    }
    if (nonce) {
      requestHeaders.set('x-nonce', nonce);
    }
    const localeMatch = request.nextUrl.pathname.match(/^\/(en|el)(?:\/|$)/);
    requestHeaders.set('x-locale', localeMatch?.[1] ?? 'en');

    const forwarded = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.forEach((value, key) => forwarded.headers.set(key, value));
    return forwarded;
  }

  private shouldSkipPath(pathname: string): boolean {
    return this.options.skipPaths?.some((path) => pathname.startsWith(path) || pathname === path) || false;
  }

  private applySecurityHeaders(response: NextResponse, nonce?: string): void {
    const headers = this.getSecurityHeaders(nonce);

    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    if (this.options.customHeaders) {
      Object.entries(this.options.customHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }
  }

  private getSecurityHeaders(nonce?: string): Record<string, string> {
    const now = Date.now();

    if (!nonce && securityHeadersCache && now - cacheTimestamp < CACHE_DURATION) {
      return securityHeadersCache;
    }

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
    securityHeaders['X-Download-Options'] = 'noopen';
    securityHeaders['X-Permitted-Cross-Domain-Policies'] = 'none';

    if (!nonce) {
      securityHeadersCache = securityHeaders;
      cacheTimestamp = now;
    }

    return securityHeaders;
  }

  private applyCspHeaders(response: NextResponse, nonce?: string): void {
    if (!this.config.csp.enabled) return;

    let csp = buildCSPDirective(
      this.config.csp.directives,
      this.config.csp.useNonce ? nonce : undefined,
    );

    if (this.config.csp.reportUri) {
      csp += `; report-uri ${this.config.csp.reportUri}`;
    }

    const headerName = this.config.csp.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    response.headers.set(headerName, csp);

    if (nonce) {
      response.headers.set('X-Nonce', nonce);
    }
  }

}

class CORSMiddleware {
  private readonly config = getSecurityConfig().cors;

  public async handle(request: NextRequest): Promise<NextResponse | null> {
    if (!this.config.enabled) return null;
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
        ip: getClientIp(request, { trustProxy: true }),
        url: request.nextUrl.pathname,
        details: {
          origin,
          allowedOrigins: this.config.origins,
        },
      };

      await logSecurityEvent(event);
      return new NextResponse('CORS violation', { status: 403 });
    }

    return null;
  }

  public applyActualRequestHeaders(request: NextRequest, response: NextResponse): void {
    const origin = request.headers.get('origin');
    if (!this.config.enabled || !request.nextUrl.pathname.startsWith('/api/')
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
    if (origin === request.nextUrl.origin) return true;

    // Next can normalize nextUrl to its configured public origin. The HTTP Host
    // header still represents the origin the browser actually contacted.
    try {
      const parsedOrigin = new URL(origin);
      const requestHost = request.headers.get('host')?.toLowerCase();
      if (!requestHost || parsedOrigin.host.toLowerCase() !== requestHost) return false;

      const trustsProxy = getClientIp(request) !== 'unknown';
      const forwardedProtocol = trustsProxy
        ? request.headers.get('x-forwarded-proto')?.split(',', 1)[0]?.trim().toLowerCase()
        : undefined;
      const requestProtocol = forwardedProtocol
        ? `${forwardedProtocol}:`
        : request.nextUrl.protocol;
      return parsedOrigin.protocol === requestProtocol;
    } catch {
      return false;
    }
  }
}

export function createSecurityMiddleware(options?: SecurityMiddlewareOptions) {
  const securityHeaders = new SecurityHeadersMiddleware(options);
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

export type { SecurityMiddlewareOptions };
