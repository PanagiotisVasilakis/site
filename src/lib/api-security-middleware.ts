import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

import { getClientIp } from '@/lib/net/getClientIp';
import { getSecurityConfig, logSecurityEvent, type SecurityEvent } from '@/lib/security-config';

class APIInputValidationMiddleware {
  private readonly config = getSecurityConfig().apiSecurity.inputValidation;

  public async validateRequest(request: NextRequest): Promise<NextResponse | null> {
    if (!this.config.enabled) return null;

    const contentLengthHeader = request.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number(contentLengthHeader);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
        await this.logViolation(request, 'invalid_content_length');
        return new NextResponse('Invalid content length', { status: 400 });
      }
      if (contentLength > this.config.maxPayloadSize) {
        await this.logViolation(request, 'payload_too_large', {
          contentLength,
          maxAllowed: this.config.maxPayloadSize,
        });
        return new NextResponse('Payload too large', { status: 413 });
      }
    }

    if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
      const mediaType = (request.headers.get('content-type') || '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
      const allowed = this.config.allowedContentTypes.some((type) => type.toLowerCase() === mediaType);
      if (!allowed) {
        await this.logViolation(request, 'invalid_content_type', { mediaType: mediaType || 'missing' });
        return new NextResponse('Invalid content type', { status: 415 });
      }
    }

    return null;
  }

  private async logViolation(
    request: NextRequest,
    violationType: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    const event: SecurityEvent = {
      type: 'api_security_violation',
      severity: 'medium',
      timestamp: new Date().toISOString(),
      ip: getClientIp(request),
      url: request.nextUrl.pathname,
      details: { violationType, method: request.method, ...details },
    };
    await logSecurityEvent(event);
  }
}

class APIKeyAuthMiddleware {
  public async validateRequest(request: NextRequest, requiredScopes?: string[]): Promise<NextResponse | null> {
    const apiKey = this.extractAPIKey(request);
    if (!apiKey) {
      await this.logAuthFailure(request, 'missing_api_key');
      return new NextResponse('API key required', {
        status: 401,
        headers: { 'WWW-Authenticate': 'ApiKey' },
      });
    }

    if (!/^[a-zA-Z0-9]{32,64}$/.test(apiKey)) {
      await this.logAuthFailure(request, 'invalid_api_key_format');
      return new NextResponse('Invalid API key', { status: 401 });
    }

    const keyType = this.configuredKeyType(apiKey);
    if (!keyType) {
      await this.logAuthFailure(request, 'invalid_api_key');
      return new NextResponse('Invalid API key', { status: 401 });
    }

    const scopes = keyType === 'internal' ? ['internal'] : ['read', 'write'];
    if (requiredScopes?.some((scope) => !scopes.includes(scope))) {
      await this.logAuthFailure(request, 'insufficient_scope', { required: requiredScopes });
      return new NextResponse('Insufficient scope', { status: 403 });
    }
    return null;
  }

  private extractAPIKey(request: NextRequest): string | null {
    const authorization = request.headers.get('authorization');
    if (authorization?.startsWith('Bearer ')) return authorization.slice(7).trim() || null;
    return request.headers.get('x-api-key')?.trim() || null;
  }

  private configuredKeyType(apiKey: string): 'internal' | 'standard' | null {
    if (this.matchesConfiguredKey(apiKey, 'INTERNAL_API_KEYS')) return 'internal';
    if (this.matchesConfiguredKey(apiKey, 'VALID_API_KEYS')) return 'standard';
    return null;
  }

  private matchesConfiguredKey(apiKey: string, envName: 'VALID_API_KEYS' | 'INTERNAL_API_KEYS'): boolean {
    return (process.env[envName] || '')
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
      .some((candidate) => {
        const supplied = Buffer.from(apiKey);
        const expected = Buffer.from(candidate);
        return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
      });
  }

  private async logAuthFailure(
    request: NextRequest,
    reason: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    const event: SecurityEvent = {
      type: 'api_auth_failure',
      severity: 'medium',
      timestamp: new Date().toISOString(),
      ip: getClientIp(request),
      url: request.nextUrl.pathname,
      details: { reason, method: request.method, ...details },
    };
    await logSecurityEvent(event);
  }
}

export function createAPISecurityMiddleware(options?: {
  requireAPIKey?: boolean;
  requiredScopes?: string[];
}) {
  const inputValidation = new APIInputValidationMiddleware();
  const apiKeyAuth = new APIKeyAuthMiddleware();

  return async (request: NextRequest): Promise<NextResponse | null> => {
    const inputValidationResult = await inputValidation.validateRequest(request);
    if (inputValidationResult) return inputValidationResult;

    if (options?.requireAPIKey) {
      return await apiKeyAuth.validateRequest(request, options.requiredScopes);
    }
    return null;
  };
}
