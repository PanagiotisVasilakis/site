/**
 * API Security Middleware
 * Comprehensive security middleware for API routes
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSecurityConfig,
  logSecurityEvent,
  type SecurityEvent
} from '@/lib/security-config';
import { getClientIP } from '@/lib/requestUtils';

// Input validation middleware
export class APIInputValidationMiddleware {
  private config = getSecurityConfig();

  public validateRequest(request: NextRequest): NextResponse | null {
    if (!this.config.apiSecurity.inputValidation.enabled) return null;

    const contentType = request.headers.get('content-type') || '';
    const contentLength = request.headers.get('content-length');

    // Check content length limits
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (length > this.config.apiSecurity.inputValidation.maxPayloadSize) {
        this.logSecurityViolation(request, 'payload_too_large', {
          contentLength: length,
          maxAllowed: this.config.apiSecurity.inputValidation.maxPayloadSize,
        });

        return new NextResponse('Payload too large', { status: 413 });
      }
    }

    // Validate content types for POST/PUT/PATCH requests
    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const allowedTypes = this.config.apiSecurity.inputValidation.allowedContentTypes;
      const isValidContentType = allowedTypes.some(type =>
        contentType.toLowerCase().includes(type.toLowerCase())
      );

      if (!isValidContentType) {
        this.logSecurityViolation(request, 'invalid_content_type', {
          contentType,
          allowedTypes,
        });

        return new NextResponse('Invalid content type', { status: 415 });
      }
    }

    // Check for suspicious patterns in URL and headers
    const suspiciousPatterns = [
      /<script[^>]*>/i,
      /javascript:/i,
      /vbscript:/i,
      /data:text\/html/i,
      /eval\(/i,
      /Function\(/i,
      /setTimeout\(/i,
      /setInterval\(/i,
    ];

    const url = request.nextUrl.toString();
    const userAgent = request.headers.get('user-agent') || '';
    const referer = request.headers.get('referer') || '';

    const hasSuspiciousContent = suspiciousPatterns.some(pattern =>
      pattern.test(url) || pattern.test(userAgent) || pattern.test(referer)
    );

    if (hasSuspiciousContent) {
      this.logSecurityViolation(request, 'suspicious_input', {
        url,
        userAgent,
        referer,
        patterns: suspiciousPatterns.filter(pattern =>
          pattern.test(url) || pattern.test(userAgent) || pattern.test(referer)
        ).map(p => p.toString()),
      });

      return new NextResponse('Suspicious input detected', { status: 400 });
    }

    return null;
  }

  private logSecurityViolation(
    request: NextRequest,
    violationType: string,
    details: Record<string, unknown>
  ): void {
    const event: SecurityEvent = {
      type: 'api_security_violation',
      severity: 'medium',
      timestamp: new Date().toISOString(),
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      url: request.nextUrl.toString(),
      details: {
        violationType,
        method: request.method,
        ...details,
      },
    };

    logSecurityEvent(event);
  }


}

// SQL Injection protection middleware
export class SQLInjectionProtectionMiddleware {
  private config = getSecurityConfig();

  public validateRequest(request: NextRequest): NextResponse | null {
    if (!this.config.apiSecurity.sqlInjectionProtection.enabled) return null;

    const url = request.nextUrl.toString();
    const searchParams = request.nextUrl.searchParams;

    // SQL injection patterns
    const sqlPatterns = [
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|OR|AND)\b)/i,
      /(\-\-|\#|\/\*|\*\/)/,
      /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
      /(\b(OR|AND)\s+['"]\w+['"]?\s*=\s*['"]?\w+)/i,
      /(\bunion\b.*\bselect\b)/i,
      /(\bdrop\b.*\btable\b)/i,
      /(\bexec\b.*\bxp_)/i,
      /(\bsp_\w+)/i,
    ];

    // Check URL parameters
    for (const [key, value] of searchParams.entries()) {
      if (this.containsSQLInjection(value, sqlPatterns)) {
        this.logSQLInjectionAttempt(request, 'query_parameter', { key, value });
        return new NextResponse('Invalid request', { status: 400 });
      }
    }

    // Check URL path
    if (this.containsSQLInjection(url, sqlPatterns)) {
      this.logSQLInjectionAttempt(request, 'url_path', { url });
      return new NextResponse('Invalid request', { status: 400 });
    }

    return null;
  }

  private containsSQLInjection(input: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(input));
  }

  private logSQLInjectionAttempt(
    request: NextRequest,
    source: string,
    details: Record<string, unknown>
  ): void {
    const event: SecurityEvent = {
      type: 'sql_injection_attempt',
      severity: 'high',
      timestamp: new Date().toISOString(),
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      url: request.nextUrl.toString(),
      details: {
        source,
        method: request.method,
        ...details,
      },
    };

    logSecurityEvent(event);
  }


}

// XSS protection middleware
export class XSSProtectionMiddleware {
  private config = getSecurityConfig();

  public validateRequest(request: NextRequest): NextResponse | null {
    if (!this.config.apiSecurity.xssProtection.enabled) return null;

    const url = request.nextUrl.toString();
    const searchParams = request.nextUrl.searchParams;

    // XSS patterns
    const xssPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /<iframe[^>]*>.*?<\/iframe>/gi,
      /<object[^>]*>.*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /<link[^>]*>/gi,
      /<meta[^>]*>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
      /onclick\s*=/gi,
      /onmouseover\s*=/gi,
      /onfocus\s*=/gi,
      /onblur\s*=/gi,
      /onchange\s*=/gi,
      /onsubmit\s*=/gi,
    ];

    // Check URL parameters
    for (const [key, value] of searchParams.entries()) {
      if (this.containsXSS(value, xssPatterns)) {
        this.logXSSAttempt(request, 'query_parameter', { key, value });
        return new NextResponse('Invalid request', { status: 400 });
      }
    }

    // Check URL path
    if (this.containsXSS(url, xssPatterns)) {
      this.logXSSAttempt(request, 'url_path', { url });
      return new NextResponse('Invalid request', { status: 400 });
    }

    return null;
  }

  private containsXSS(input: string, patterns: RegExp[]): boolean {
    let decoded = input;
    try {
      decoded = decodeURIComponent(input);
    } catch {
      // Malformed URI encodings are suspicious in request vectors.
      return true;
    }

    return patterns.some(pattern => {
      // Defensive reset for global regexes reused across multiple tests.
      pattern.lastIndex = 0;
      const decodedMatch = pattern.test(decoded);
      pattern.lastIndex = 0;
      const rawMatch = pattern.test(input);
      return decodedMatch || rawMatch;
    });
  }

  private logXSSAttempt(
    request: NextRequest,
    source: string,
    details: Record<string, unknown>
  ): void {
    const event: SecurityEvent = {
      type: 'xss_attempt',
      severity: 'high',
      timestamp: new Date().toISOString(),
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      url: request.nextUrl.toString(),
      details: {
        source,
        method: request.method,
        ...details,
      },
    };

    logSecurityEvent(event);
  }


}

// API Key authentication middleware
export class APIKeyAuthMiddleware {
  public validateRequest(request: NextRequest, requiredScopes?: string[]): NextResponse | null {
    const apiKey = this.extractAPIKey(request);

    if (!apiKey) {
      this.logAuthFailure(request, 'missing_api_key');
      return new NextResponse('API key required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'ApiKey',
        },
      });
    }

    // Validate API key format
    if (!this.isValidAPIKeyFormat(apiKey)) {
      this.logAuthFailure(request, 'invalid_api_key_format', { apiKey: apiKey.substring(0, 8) + '...' });
      return new NextResponse('Invalid API key format', { status: 401 });
    }

    // Check if API key is in valid keys (this would typically check a database)
    if (!this.isValidAPIKey(apiKey)) {
      this.logAuthFailure(request, 'invalid_api_key', { apiKey: apiKey.substring(0, 8) + '...' });
      return new NextResponse('Invalid API key', { status: 401 });
    }

    // Check scopes if required
    if (requiredScopes && requiredScopes.length > 0) {
      const keyScopes = this.getAPIKeyScopes(apiKey);
      const hasRequiredScopes = requiredScopes.every(scope => keyScopes.includes(scope));

      if (!hasRequiredScopes) {
        this.logAuthFailure(request, 'insufficient_scope', {
          required: requiredScopes,
          available: keyScopes,
        });
        return new NextResponse('Insufficient scope', { status: 403 });
      }
    }

    return null;
  }

  private extractAPIKey(request: NextRequest): string | null {
    // Try Authorization header first
    const authHeader = request.headers.get('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try X-API-Key header
    const apiKeyHeader = request.headers.get('x-api-key');
    if (apiKeyHeader) {
      return apiKeyHeader;
    }

    return null;
  }

  private isValidAPIKeyFormat(apiKey: string): boolean {
    // Example format: alphanumeric, 32-64 characters
    return /^[a-zA-Z0-9]{32,64}$/.test(apiKey);
  }

  private isValidAPIKey(apiKey: string): boolean {
    return this.getConfiguredKeys('VALID_API_KEYS').includes(apiKey)
      || this.getConfiguredKeys('INTERNAL_API_KEYS').includes(apiKey);
  }

  private getAPIKeyScopes(apiKey: string): string[] {
    if (this.getConfiguredKeys('INTERNAL_API_KEYS').includes(apiKey)) {
      return ['internal'];
    }
    return ['read', 'write'];
  }

  private getConfiguredKeys(name: 'VALID_API_KEYS' | 'INTERNAL_API_KEYS'): string[] {
    return (process.env[name] || '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);
  }

  private logAuthFailure(
    request: NextRequest,
    reason: string,
    details?: Record<string, unknown>
  ): void {
    const event: SecurityEvent = {
      type: 'api_auth_failure',
      severity: 'medium',
      timestamp: new Date().toISOString(),
      ip: getClientIP(request),
      userAgent: request.headers.get('user-agent') || undefined,
      url: request.nextUrl.toString(),
      details: {
        reason,
        method: request.method,
        ...details,
      },
    };

    logSecurityEvent(event);
  }


}

// Combined API security middleware
export function createAPISecurityMiddleware(options?: {
  requireAPIKey?: boolean;
  requiredScopes?: string[];
}) {
  const inputValidation = new APIInputValidationMiddleware();
  const sqlInjectionProtection = new SQLInjectionProtectionMiddleware();
  const xssProtection = new XSSProtectionMiddleware();
  const apiKeyAuth = new APIKeyAuthMiddleware();

  return (request: NextRequest): NextResponse | null => {
    // Input validation
    const inputValidationResult = inputValidation.validateRequest(request);
    if (inputValidationResult) return inputValidationResult;

    // SQL injection protection
    const sqlInjectionResult = sqlInjectionProtection.validateRequest(request);
    if (sqlInjectionResult) return sqlInjectionResult;

    // XSS protection
    const xssResult = xssProtection.validateRequest(request);
    if (xssResult) return xssResult;

    // API key authentication (if required)
    if (options?.requireAPIKey) {
      const authResult = apiKeyAuth.validateRequest(request, options.requiredScopes);
      if (authResult) return authResult;
    }

    return null; // All validations passed
  };
}