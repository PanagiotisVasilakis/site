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
import { metrics } from '@/lib/metrics-lite';
import { getClientIp } from '@/lib/net/getClientIp';

let securityHeadersCache: Record<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface SecurityMiddlewareOptions {
  skipPaths?: string[];
  enableNonce?: boolean;
  customHeaders?: Record<string, string>;
}

export class SecurityHeadersMiddleware {
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

export class RateLimitMiddleware {
  private readonly config = getSecurityConfig().rateLimit;
  private readonly memoryStore = new Map<string, { count: number; resetTime: number }>();

  public async handle(request: NextRequest): Promise<NextResponse | null> {
    if (!this.config.enabled) return null;
    if (!request.nextUrl.pathname.startsWith('/api/')) return null;

    const key = this.generateKey(request);
    if (!key) return null;
    const now = Date.now();
    const resetTime = now + this.config.windowMs;

    const backend = typeof process !== 'undefined' && process.env ? process.env.RATE_LIMIT_BACKEND || '' : '';
    const isEdgeRuntime = typeof (globalThis as unknown as { EdgeRuntime?: string }).EdgeRuntime !== 'undefined';
    const upstashConfigured = typeof process !== 'undefined' && process.env?.UPSTASH_REDIS_REST_URL;

    if ((backend === 'redis' || isEdgeRuntime) && upstashConfigured) {
      try {
        const upstash = await import('@/lib/upstash');
        const count = await upstash.incrWithExpire(key, this.config.windowMs);

        if (count > this.config.maxRequests) {
          metrics.counter('rate_limit.blocked', 1, { backend: 'redis' });
          return this.createLimitResponse(now);
        }

        metrics.counter('rate_limit.allowed', 1, { backend: 'redis' });
        return null;
      } catch (error) {
        if (process.env.NODE_ENV !== 'test') {
          console.error('Upstash rate limit error:', error);
        }
        metrics.counter('rate_limit.backend_unavailable', 1, { backend: 'redis' });
        return new NextResponse('Rate limit service unavailable', {
          status: 503,
          headers: { 'Retry-After': '5' },
        });
      }
    }

    return this.handleInMemory(key, now, resetTime);
  }

  private handleInMemory(key: string, now: number, resetTime: number): NextResponse | null {
    for (const [entryKey, entry] of this.memoryStore.entries()) {
      if (entry.resetTime <= now) {
        this.memoryStore.delete(entryKey);
      }
    }

    const existing = this.memoryStore.get(key);

    if (existing && existing.resetTime > now) {
      if (existing.count >= this.config.maxRequests) {
        return this.createLimitResponse(now, existing.resetTime);
      }

      existing.count += 1;
      return null;
    }

    this.memoryStore.set(key, { count: 1, resetTime });
    return null;
  }

  private createLimitResponse(now: number, resetTime?: number): NextResponse {
    const response = new NextResponse('Too Many Requests', { status: 429 });

    if (this.config.standardHeaders) {
      response.headers.set('RateLimit-Limit', this.config.maxRequests.toString());
      response.headers.set('RateLimit-Remaining', '0');
      const resetSeconds = Math.ceil((resetTime ?? now + this.config.windowMs) / 1000);
      response.headers.set('RateLimit-Reset', resetSeconds.toString());
    }

    if (this.config.legacyHeaders) {
      response.headers.set('X-RateLimit-Limit', this.config.maxRequests.toString());
      response.headers.set('X-RateLimit-Remaining', '0');
      const resetSeconds = Math.ceil((resetTime ?? now + this.config.windowMs) / 1000);
      response.headers.set('X-RateLimit-Reset', resetSeconds.toString());
    }

    return response;
  }

  private generateKey(request: NextRequest): string | null {
    const ip = getClientIp(request, { trustProxy: true });
    return ip === 'unknown' ? null : `${ip}:${request.nextUrl.pathname}`;
  }
}

export class CORSMiddleware {
  private readonly config = getSecurityConfig().cors;

  public handle(request: NextRequest): NextResponse | null {
    if (!this.config.enabled) return null;

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

      logSecurityEvent(event);
      return new NextResponse('CORS violation', { status: 403 });
    }

    return null;
  }

  public applyActualRequestHeaders(request: NextRequest, response: NextResponse): void {
    const origin = request.headers.get('origin');
    if (!this.config.enabled || !origin || !this.isOriginAllowed(origin, request)) return;
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

      const trustsProxy = (process.env.TRUST_PROXY_MODE || 'none') !== 'none';
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
  const rateLimit = new RateLimitMiddleware();
  const cors = new CORSMiddleware();

  return async (request: NextRequest): Promise<NextResponse> => {
    const corsResponse = cors.handle(request);
    if (corsResponse) {
      return corsResponse;
    }

    const rateLimitResponse = await rateLimit.handle(request);
    if (rateLimitResponse) {
      cors.applyActualRequestHeaders(request, rateLimitResponse);
      return rateLimitResponse;
    }

    const response = securityHeaders.handle(request);
    cors.applyActualRequestHeaders(request, response);
    return response;
  };
}

export type { SecurityMiddlewareOptions };
