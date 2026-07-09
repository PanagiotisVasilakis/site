/**
 * Security Headers Middleware
 * Enterprise-grade security headers implementation with CSP support
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSecurityConfig,
  buildCSPDirective,
  buildPermissionsPolicy,
  generateNonce,
  logSecurityEvent,
  type SecurityEvent
} from '@/lib/security-config';
import { metrics } from '@/lib/metrics-collector';
import { getClientIP } from '@/lib/requestUtils';

// Security headers cache to avoid recalculating on every request
let securityHeadersCache: Record<string, string> | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface SecurityMiddlewareOptions {
  skipPaths?: string[];
  enableNonce?: boolean;
  customHeaders?: Record<string, string>;
}

export class SecurityHeadersMiddleware {
  private config = getSecurityConfig();
  private options: SecurityMiddlewareOptions;

  constructor(options: SecurityMiddlewareOptions = {}) {
    this.options = {
      skipPaths: ['/api/health', '/favicon.ico'],
      enableNonce: true,
      ...options,
    };
  }

  public handle(request: NextRequest): NextResponse {
    const response = NextResponse.next();

    // Skip security headers for certain paths
    if (this.shouldSkipPath(request.nextUrl.pathname)) {
      return response;
    }

    // Generate nonce for this request
    const nonce = this.options.enableNonce ? generateNonce() : undefined;

    // Apply security headers
    this.applySecurityHeaders(response, nonce);

    // Add CSP headers
    this.applyCSPHeaders(response, nonce);

    // Log security events if monitoring is enabled
    this.logSecurityContext(request);

    return response;
  }

  private shouldSkipPath(pathname: string): boolean {
    return this.options.skipPaths?.some(path =>
      pathname.startsWith(path) || pathname === path
    ) || false;
  }

  private applySecurityHeaders(response: NextResponse, nonce?: string): void {
    const headers = this.getSecurityHeaders(nonce);

    Object.entries(headers).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    // Add custom headers if provided
    if (this.options.customHeaders) {
      Object.entries(this.options.customHeaders).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }
  }

  private getSecurityHeaders(nonce?: string): Record<string, string> {
    const now = Date.now();

    // IMPORTANT: Never cache headers when a nonce is provided
    // CSP nonces MUST be unique per request to prevent security issues
    // Only static headers (without nonces) are cached for performance
    if (!nonce && securityHeadersCache && (now - cacheTimestamp) < CACHE_DURATION) {
      return securityHeadersCache;
    }

    const { headers } = this.config;
    const securityHeaders: Record<string, string> = {};

    // Strict Transport Security (HSTS)
    if (headers.hsts.enabled) {
      const hstsDirectives = [`max-age=${headers.hsts.maxAge}`];
      if (headers.hsts.includeSubDomains) hstsDirectives.push('includeSubDomains');
      if (headers.hsts.preload) hstsDirectives.push('preload');
      securityHeaders['Strict-Transport-Security'] = hstsDirectives.join('; ');
    }

    // X-Frame-Options
    securityHeaders['X-Frame-Options'] = headers.frameOptions;

    // X-Content-Type-Options
    if (headers.contentTypeOptions) {
      securityHeaders['X-Content-Type-Options'] = 'nosniff';
    }

    // Referrer Policy
    securityHeaders['Referrer-Policy'] = headers.referrerPolicy;

    // Permissions Policy
    securityHeaders['Permissions-Policy'] = buildPermissionsPolicy(headers.permissionsPolicy);

    // Cross-Origin policies
    securityHeaders['Cross-Origin-Embedder-Policy'] = headers.crossOriginEmbedderPolicy;
    securityHeaders['Cross-Origin-Opener-Policy'] = headers.crossOriginOpenerPolicy;
    securityHeaders['Cross-Origin-Resource-Policy'] = headers.crossOriginResourcePolicy;

    // Additional security headers
    securityHeaders['X-DNS-Prefetch-Control'] = 'on';
    securityHeaders['X-Download-Options'] = 'noopen';
    securityHeaders['X-Permitted-Cross-Domain-Policies'] = 'none';

    // IMPORTANT: Only cache static headers (no nonce)
    // Never cache when nonce is present - nonces must be unique per request
    if (!nonce) {
      securityHeadersCache = securityHeaders;
      cacheTimestamp = now;
    }

    return securityHeaders;
  }

  private applyCSPHeaders(response: NextResponse, nonce?: string): void {
    if (!this.config.csp.enabled) return;

    let finalCSP = buildCSPDirective(
      this.config.csp.directives,
      this.config.csp.useNonce ? nonce : undefined,
    );

    // Add report URI if configured
    if (this.config.csp.reportUri) {
      finalCSP += `; report-uri ${this.config.csp.reportUri}`;
    }

    // Use Content-Security-Policy-Report-Only in development or when configured
    const headerName = this.config.csp.reportOnly
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy';

    response.headers.set(headerName, finalCSP);

    // Store nonce in response for use in components
    if (nonce) {
      response.headers.set('X-Nonce', nonce);
    }
  }

  private logSecurityContext(request: NextRequest): void {
    if (!this.config.monitoring.enabled) return;

    const suspiciousPatterns = [
      /<script/i,
      /javascript:/i,
      /vbscript:/i,
      /onload=/i,
      /onerror=/i,
      /eval\(/i,
      /document\.cookie/i,
    ];

    const url = request.nextUrl.toString();
    const userAgent = request.headers.get('user-agent') || '';
    const referer = request.headers.get('referer') || '';

    // Check for suspicious patterns in URL
    const hasSuspiciousContent = suspiciousPatterns.some(pattern =>
      pattern.test(url) || pattern.test(userAgent) || pattern.test(referer)
    );

    if (hasSuspiciousContent) {
      const event: SecurityEvent = {
        type: 'suspicious_activity',
        severity: 'medium',
        timestamp: new Date().toISOString(),
        ip: getClientIP(request),
        userAgent,
        url,
        details: {
          referer,
          method: request.method,
          suspiciousPatterns: suspiciousPatterns.filter(pattern =>
            pattern.test(url) || pattern.test(userAgent) || pattern.test(referer)
          ).map(p => p.toString()),
        },
      };

      logSecurityEvent(event);
    }
  }


}

// Rate limiting middleware - Database-backed for persistence and scalability
export class RateLimitMiddleware {
  private config = getSecurityConfig().rateLimit;
  // In-memory fallback for Edge runtime
  private memoryStore = new Map<string, { count: number; resetTime: number }>();
  public async handle(request: NextRequest): Promise<NextResponse | null> {
    if (!this.config.enabled) return null;
    if (!request.nextUrl.pathname.startsWith('/api/')) return null;

    const key = this.generateKey(request);
    const now = Date.now();
    const resetTime = now + this.config.windowMs;

    try {
      // Prefer Redis (Upstash) when configured or when running in Edge
      const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge' || typeof process.versions?.node === 'undefined';
      const backend = process.env.RATE_LIMIT_BACKEND || '';

      if (backend === 'redis' || isEdgeRuntime) {
        try {
          const upstash = await import('@/lib/upstash');
          const count = await upstash.incrWithExpire(key, this.config.windowMs);
          if (count > this.config.maxRequests) {
            // Blocked by Redis
            metrics.counter('rate_limit.blocked', 1, { backend: 'redis' });
            const response = new NextResponse('Too Many Requests', { status: 429 });
            if (this.config.standardHeaders) {
              response.headers.set('RateLimit-Limit', this.config.maxRequests.toString());
              response.headers.set('RateLimit-Remaining', '0');
              response.headers.set('RateLimit-Reset', Math.ceil((now + this.config.windowMs) / 1000).toString());
            }
            if (this.config.legacyHeaders) {
              response.headers.set('X-RateLimit-Limit', this.config.maxRequests.toString());
              response.headers.set('X-RateLimit-Remaining', '0');
              response.headers.set('X-RateLimit-Reset', Math.ceil((now + this.config.windowMs) / 1000).toString());
            }
            return response;
          }

          // Allowed by Redis
          metrics.counter('rate_limit.allowed', 1, { backend: 'redis' });
          return null;
        } catch (err) {
          // Upstash failed - fall back to in-memory gracefully
          console.error('Upstash rate limit error:', err);
          // Record fallback occurrence
          metrics.counter('rate_limit.fallback_in_memory', 1, { backend: 'redis' });
          return this.handleInMemory(request, key, now, resetTime);
        }
      }

      // If Redis isn't configured and we're not in Edge, still fall back to in-memory
      return this.handleInMemory(request, key, now, resetTime);
    } catch (error) {
      console.error('Rate limiting error:', error);
      return this.handleInMemory(request, key, now, resetTime);
    }
  }

  private handleInMemory(request: NextRequest, key: string, now: number, resetTime: number): NextResponse | null {
    // Clean expired entries from memory
    for (const [k, v] of this.memoryStore.entries()) {
      if (v.resetTime <= now) {
        this.memoryStore.delete(k);
      }
    }

    const existing = this.memoryStore.get(key);

    if (existing && existing.resetTime > now) {
      // Check if limit exceeded
      if (existing.count >= this.config.maxRequests) {
        const response = new NextResponse('Too Many Requests', { status: 429 });

        if (this.config.standardHeaders) {
          response.headers.set('RateLimit-Limit', this.config.maxRequests.toString());
          response.headers.set('RateLimit-Remaining', '0');
          response.headers.set('RateLimit-Reset', Math.ceil(existing.resetTime / 1000).toString());
        }

        return response;
      }

      // Increment count
      existing.count++;
    } else {
      // Create new entry
      this.memoryStore.set(key, { count: 1, resetTime });
    }

    return null;
  }

  private generateKey(request: NextRequest): string {
    const ip = getClientIP(request);
    const path = request.nextUrl.pathname;
    return `${ip}:${path}`;
  }



  // cleanupExpiredEntries removed — Redis + in-memory approach does not rely on DB cleanup
}

// CORS middleware
export class CORSMiddleware {
  private config = getSecurityConfig().cors;

  public handle(request: NextRequest): NextResponse | null {
    if (!this.config.enabled) return null;

    const origin = request.headers.get('origin');
    const method = request.method;

    // Handle preflight requests
    if (method === 'OPTIONS') {
      return this.handlePreflight(request, origin);
    }

    // Handle actual requests
    if (origin && !this.isOriginAllowed(origin)) {
      const event: SecurityEvent = {
        type: 'cors_violation',
        severity: 'medium',
        timestamp: new Date().toISOString(),
        ip: getClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined,
        url: request.nextUrl.toString(),
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

  private handlePreflight(request: NextRequest, origin: string | null): NextResponse {
    const response = new NextResponse(null, { status: 200 });

    if (origin && this.isOriginAllowed(origin)) {
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

  private isOriginAllowed(origin: string): boolean {
    return this.config.origins.includes(origin) || this.config.origins.includes('*');
  }


}

// Export middleware factory
export function createSecurityMiddleware(options?: SecurityMiddlewareOptions) {
  const securityHeaders = new SecurityHeadersMiddleware(options);
  const rateLimit = new RateLimitMiddleware();
  const cors = new CORSMiddleware();

  return async (request: NextRequest): Promise<NextResponse> => {
    // Check CORS first
    const corsResponse = cors.handle(request);
    if (corsResponse) return corsResponse;

    // Check rate limiting (now async)
    const rateLimitResponse = await rateLimit.handle(request);
    if (rateLimitResponse) return rateLimitResponse;

    // Apply security headers
    return securityHeaders.handle(request);
  };
}