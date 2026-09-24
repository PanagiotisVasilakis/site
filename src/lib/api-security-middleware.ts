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

export function createAPISecurityMiddleware() {
  const inputValidation = new APIInputValidationMiddleware();

  return (request: NextRequest): Promise<NextResponse | null> => inputValidation.validateRequest(request);
}
