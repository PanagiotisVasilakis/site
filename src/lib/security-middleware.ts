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
    
    // Use cache if still valid and no nonce (nonce requires fresh generation)
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

    // Cache headers if no nonce
    if (!nonce) {
      securityHeadersCache = securityHeaders;
      cacheTimestamp = now;
    }

    return securityHeaders;
  }

  private applyCSPHeaders(response: NextResponse, nonce?: string): void {
    if (!this.config.csp.enabled) return;

    const cspDirective = buildCSPDirective(this.config.csp.directives, this.config.csp.useNonce);
    
    // Add nonce to CSP if provided
    let finalCSP = cspDirective;
    if (nonce && this.config.csp.useNonce) {
      finalCSP = finalCSP.replace(
        "script-src 'self' 'unsafe-inline'",
        `script-src 'self' 'nonce-${nonce}'`
      );
    }

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
        ip: this.getClientIP(request),
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

  private getClientIP(request: NextRequest): string {
    // Try various headers for client IP
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
}

// Rate limiting middleware
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

export class RateLimitMiddleware {
  private store: RateLimitStore = {};
  private config = getSecurityConfig().rateLimit;

  public handle(request: NextRequest): NextResponse | null {
    if (!this.config.enabled) return null;

    const key = this.generateKey(request);
    const now = Date.now();
    
    // Clean expired entries
    this.cleanExpiredEntries(now);
    
    // Get or create rate limit entry
    const entry = this.store[key] || { count: 0, resetTime: now + this.config.windowMs };
    
    // Reset if window has expired
    if (now > entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + this.config.windowMs;
    }
    
    // Increment counter
    entry.count++;
    this.store[key] = entry;
    
    // Check if limit exceeded
    if (entry.count > this.config.maxRequests) {
      const event: SecurityEvent = {
        type: 'rate_limit_exceeded',
        severity: 'medium',
        timestamp: new Date().toISOString(),
        ip: this.getClientIP(request),
        userAgent: request.headers.get('user-agent') || undefined,
        url: request.nextUrl.toString(),
        details: {
          limit: this.config.maxRequests,
          windowMs: this.config.windowMs,
          currentCount: entry.count,
        },
      };

      logSecurityEvent(event);

      const response = new NextResponse('Too Many Requests', { status: 429 });
      
      if (this.config.standardHeaders) {
        response.headers.set('RateLimit-Limit', this.config.maxRequests.toString());
        response.headers.set('RateLimit-Remaining', '0');
        response.headers.set('RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
      }
      
      if (this.config.legacyHeaders) {
        response.headers.set('X-RateLimit-Limit', this.config.maxRequests.toString());
        response.headers.set('X-RateLimit-Remaining', '0');
        response.headers.set('X-RateLimit-Reset', Math.ceil(entry.resetTime / 1000).toString());
      }
      
      return response;
    }
    
    return null;
  }

  private generateKey(request: NextRequest): string {
    const ip = this.getClientIP(request);
    const path = request.nextUrl.pathname;
    return `${ip}:${path}`;
  }

  private getClientIP(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    
    if (forwardedFor) {
      return forwardedFor.split(',')[0].trim();
    }
    
    return realIP || 'unknown';
  }

  private cleanExpiredEntries(now: number): void {
    // Periodically clean expired entries to prevent memory leaks
    const keys = Object.keys(this.store);
    if (keys.length > 10000) { // Clean when store gets large
      Object.keys(this.store).forEach(key => {
        if (now > this.store[key].resetTime) {
          delete this.store[key];
        }
      });
    }
  }
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
        ip: this.getClientIP(request),
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

  private getClientIP(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    return forwardedFor ? forwardedFor.split(',')[0].trim() : 'unknown';
  }
}

// Export middleware factory
export function createSecurityMiddleware(options?: SecurityMiddlewareOptions) {
  const securityHeaders = new SecurityHeadersMiddleware(options);
  const rateLimit = new RateLimitMiddleware();
  const cors = new CORSMiddleware();

  return (request: NextRequest): NextResponse => {
    // Check CORS first
    const corsResponse = cors.handle(request);
    if (corsResponse) return corsResponse;

    // Check rate limiting
    const rateLimitResponse = rateLimit.handle(request);
    if (rateLimitResponse) return rateLimitResponse;

    // Apply security headers
    return securityHeaders.handle(request);
  };
}