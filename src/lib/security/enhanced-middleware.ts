/**
 * Enhanced Security Middleware
 * Enterprise-grade security enhancements for production
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'node:crypto';
import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { getSecurityMonitor } from '@/lib/security-monitoring';

interface SecurityContext {
  sessionId: string;
  userId?: string;
  ipAddress: string;
  userAgent: string;
  fingerprint: string;
  riskScore: number;
  countryCode?: string;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: NextRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface CSRFConfig {
  secret: string;
  cookieName: string;
  headerName: string;
  sameSite: 'strict' | 'lax' | 'none';
}

interface SessionSecurityConfig {
  maxConcurrentSessions: number;
  sessionTimeoutMs: number;
  requireReauthAfterMs: number;
  enableDeviceTracking: boolean;
  enableLocationTracking: boolean;
}

export class EnhancedSecurityMiddleware {
  private rateLimitStore = new Map<string, { count: number; resetTime: number }>();
  private suspiciousActivityStore = new Map<string, number>();
  private sessionStore = new Map<string, SecurityContext>();
  private csrfTokens = new Map<string, { token: string; expires: number }>();
  
  constructor(
    private rateLimitConfig: RateLimitConfig,
    private csrfConfig: CSRFConfig,
    private sessionConfig: SessionSecurityConfig
  ) {}

  // Main security middleware handler
  async handle(request: NextRequest): Promise<NextResponse | null> {
    const context = await this.createSecurityContext(request);
    
    // 1. Rate limiting
    const rateLimitResult = await this.checkRateLimit(request, context);
    if (rateLimitResult) return rateLimitResult;

    // 2. Suspicious activity detection
    const suspiciousActivityResult = await this.detectSuspiciousActivity(request, context);
    if (suspiciousActivityResult) return suspiciousActivityResult;

    // 3. CSRF protection
    const csrfResult = await this.checkCSRF(request, context);
    if (csrfResult) return csrfResult;

    // 4. Session security
    const sessionResult = await this.checkSessionSecurity(request, context);
    if (sessionResult) return sessionResult;

    // 5. Device fingerprinting and tracking
    await this.updateDeviceFingerprint(request, context);

    // 6. Log security event
    await this.logSecurityEvent(request, context);

    return null; // Continue to next middleware
  }

  private async createSecurityContext(request: NextRequest): Promise<SecurityContext> {
    const ipAddress = this.getClientIP(request);
    const userAgent = request.headers.get('user-agent') || '';
    const fingerprint = this.generateDeviceFingerprint(request);
    const sessionId = this.getSessionId(request);

    const context: SecurityContext = {
      sessionId,
      ipAddress,
      userAgent,
      fingerprint,
      riskScore: 0,
    };

    // Calculate risk score
    context.riskScore = await this.calculateRiskScore(context);

    return context;
  }

  private async checkRateLimit(request: NextRequest, context: SecurityContext): Promise<NextResponse | null> {
    const key = this.rateLimitConfig.keyGenerator 
      ? this.rateLimitConfig.keyGenerator(request)
      : context.ipAddress;

    const now = Date.now();
    const windowStart = now - this.rateLimitConfig.windowMs;
    
    let entry = this.rateLimitStore.get(key);
    
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + this.rateLimitConfig.windowMs };
      this.rateLimitStore.set(key, entry);
    }

    entry.count++;

    if (entry.count > this.rateLimitConfig.maxRequests) {
      // Rate limit exceeded
      logger.warn('Rate limit exceeded', { 
        key, 
        count: entry.count, 
        limit: this.rateLimitConfig.maxRequests,
        ip: context.ipAddress 
      });

      metrics.counter('security_rate_limit_exceeded', 1, { key });
      
      const monitor = getSecurityMonitor();
      monitor.recordEvent({
        type: 'rate_limit_exceeded',
        severity: 'medium',
        timestamp: new Date().toISOString(),
        ip: context.ipAddress,
        userAgent: context.userAgent,
        url: request.url,
        details: { key, count: entry.count, limit: this.rateLimitConfig.maxRequests }
      });

      return new NextResponse('Too Many Requests', {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(this.rateLimitConfig.windowMs / 1000)),
          'X-RateLimit-Limit': String(this.rateLimitConfig.maxRequests),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(entry.resetTime),
        },
      });
    }

    return null;
  }

  private async detectSuspiciousActivity(request: NextRequest, context: SecurityContext): Promise<NextResponse | null> {
    const suspiciousIndicators = [];

    // Check for SQL injection patterns
    const url = request.url.toLowerCase();
    const sqlPatterns = [
      /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
      /((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
      /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
      /((\%27)|(\'))union/i
    ];

    for (const pattern of sqlPatterns) {
      if (pattern.test(url)) {
        suspiciousIndicators.push('sql_injection_attempt');
        break;
      }
    }

    // Check for XSS patterns
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi
    ];

    for (const pattern of xssPatterns) {
      if (pattern.test(url)) {
        suspiciousIndicators.push('xss_attempt');
        break;
      }
    }

    // Check for unusual request patterns
    if (request.headers.get('user-agent')?.length === 0) {
      suspiciousIndicators.push('missing_user_agent');
    }

    if (suspiciousIndicators.length > 0) {
      const suspiciousCount = this.suspiciousActivityStore.get(context.ipAddress) || 0;
      this.suspiciousActivityStore.set(context.ipAddress, suspiciousCount + 1);

      logger.warn('Suspicious activity detected', {
        ip: context.ipAddress,
        indicators: suspiciousIndicators,
        count: suspiciousCount + 1,
        url: request.url
      });

      metrics.counter('security_suspicious_activity', 1, { 
        type: suspiciousIndicators[0],
        ip: context.ipAddress 
      });

      const monitor = getSecurityMonitor();
      monitor.recordEvent({
        type: 'suspicious_activity',
        severity: 'high',
        timestamp: new Date().toISOString(),
        ip: context.ipAddress,
        userAgent: context.userAgent,
        url: request.url,
        details: { indicators: suspiciousIndicators, count: suspiciousCount + 1 }
      });

      // Block if too many suspicious activities
      if (suspiciousCount >= 5) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }

    return null;
  }

  private async checkCSRF(request: NextRequest, context: SecurityContext): Promise<NextResponse | null> {
    // Skip CSRF check for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      return null;
    }

    const csrfToken = request.headers.get(this.csrfConfig.headerName) ||
                     request.headers.get('x-csrf-token');
    
    if (!csrfToken) {
      logger.warn('Missing CSRF token', { 
        ip: context.ipAddress, 
        method: request.method, 
        url: request.url 
      });

      metrics.counter('security_csrf_missing', 1);
      
      return new NextResponse('Forbidden: Missing CSRF token', { status: 403 });
    }

    const storedToken = this.csrfTokens.get(context.sessionId);
    if (!storedToken || storedToken.token !== csrfToken || storedToken.expires < Date.now()) {
      logger.warn('Invalid CSRF token', { 
        ip: context.ipAddress, 
        sessionId: context.sessionId,
        method: request.method,
        url: request.url 
      });

      metrics.counter('security_csrf_invalid', 1);
      
      return new NextResponse('Forbidden: Invalid CSRF token', { status: 403 });
    }

    return null;
  }

  private async checkSessionSecurity(request: NextRequest, context: SecurityContext): Promise<NextResponse | null> {
    const existingSession = this.sessionStore.get(context.sessionId);
    
    if (existingSession) {
      // Check for session hijacking
      if (existingSession.fingerprint !== context.fingerprint) {
        logger.warn('Potential session hijacking detected', {
          sessionId: context.sessionId,
          originalFingerprint: existingSession.fingerprint,
          currentFingerprint: context.fingerprint,
          ip: context.ipAddress
        });

        metrics.counter('security_session_hijacking_attempt', 1);
        
        // Invalidate session
        this.sessionStore.delete(context.sessionId);
        
        return new NextResponse('Unauthorized: Session invalidated', { status: 401 });
      }

      // Update session activity
      existingSession.ipAddress = context.ipAddress;
      existingSession.userAgent = context.userAgent;
    } else {
      // New session
      this.sessionStore.set(context.sessionId, context);
    }

    return null;
  }

  private async updateDeviceFingerprint(request: NextRequest, context: SecurityContext): Promise<void> {
    if (!this.sessionConfig.enableDeviceTracking) return;

    // Store device fingerprint for future validation
    const deviceInfo = {
      fingerprint: context.fingerprint,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      lastSeen: Date.now(),
    };

    // This would typically be stored in a database
    // For now, we'll just log it
    logger.info('Device fingerprint updated', deviceInfo);
  }

  private async logSecurityEvent(request: NextRequest, context: SecurityContext): Promise<void> {
    // Log all security-relevant events
    const event = {
      type: 'request_processed',
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      ip: context.ipAddress,
      userAgent: context.userAgent,
      sessionId: context.sessionId,
      fingerprint: context.fingerprint,
      riskScore: context.riskScore,
    };

    logger.info('Security event logged', event);
    metrics.counter('security_events_logged', 1, { type: 'request_processed' });
  }

  private getClientIP(request: NextRequest): string {
    const forwarded = request.headers.get('x-forwarded-for');
    const realIP = request.headers.get('x-real-ip');
    const cfConnectingIP = request.headers.get('cf-connecting-ip');
    
    if (cfConnectingIP) return cfConnectingIP;
    if (realIP) return realIP;
    if (forwarded) return forwarded.split(',')[0].trim();
    
    return 'unknown';
  }

  private getSessionId(request: NextRequest): string {
    const sessionCookie = request.cookies.get('guest_session')?.value ||
                         request.cookies.get('session_id')?.value;
    
    if (sessionCookie) return sessionCookie;
    
    // Generate temporary session ID for tracking
    return crypto.randomBytes(16).toString('hex');
  }

  private generateDeviceFingerprint(request: NextRequest): string {
    const components = [
      request.headers.get('user-agent') || '',
      request.headers.get('accept-language') || '',
      request.headers.get('accept-encoding') || '',
      request.headers.get('accept') || '',
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .substring(0, 32);
  }

  private async calculateRiskScore(context: SecurityContext): Promise<number> {
    let score = 0;

    // IP reputation check (simplified)
    const suspiciousCount = this.suspiciousActivityStore.get(context.ipAddress) || 0;
    score += Math.min(suspiciousCount * 10, 50);

    // User agent analysis
    if (!context.userAgent || context.userAgent.length < 10) {
      score += 20;
    }

    // Known bot patterns
    const botPatterns = ['bot', 'crawler', 'spider', 'scraper'];
    if (botPatterns.some(pattern => context.userAgent.toLowerCase().includes(pattern))) {
      score += 30;
    }

    return Math.min(score, 100);
  }

  // Generate CSRF token
  generateCSRFToken(sessionId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 3600000; // 1 hour
    
    this.csrfTokens.set(sessionId, { token, expires });
    
    return token;
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    
    // Cleanup rate limit entries
    for (const [key, entry] of this.rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        this.rateLimitStore.delete(key);
      }
    }

    // Cleanup CSRF tokens
    for (const [sessionId, tokenData] of this.csrfTokens.entries()) {
      if (tokenData.expires < now) {
        this.csrfTokens.delete(sessionId);
      }
    }

    // Cleanup old suspicious activity records (24 hours)
    const dayAgo = now - 24 * 60 * 60 * 1000;
    for (const [ip, _] of this.suspiciousActivityStore.entries()) {
      // In a real implementation, you'd check timestamps
      // For now, we'll just keep them
    }
  }
}

// Factory function
export function createEnhancedSecurityMiddleware(): EnhancedSecurityMiddleware {
  const rateLimitConfig: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100,
    keyGenerator: (req) => req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown',
  };

  const csrfConfig: CSRFConfig = {
    secret: process.env.CSRF_SECRET || 'default-secret',
    cookieName: 'csrf-token',
    headerName: 'x-csrf-token',
    sameSite: 'strict',
  };

  const sessionConfig: SessionSecurityConfig = {
    maxConcurrentSessions: 5,
    sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
    requireReauthAfterMs: 2 * 60 * 60 * 1000, // 2 hours
    enableDeviceTracking: true,
    enableLocationTracking: false,
  };

  return new EnhancedSecurityMiddleware(rateLimitConfig, csrfConfig, sessionConfig);
}