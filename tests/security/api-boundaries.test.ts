import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import {
  ApiError,
  ApiErrorCode,
  createSuccessResponse,
  readJsonBody,
  validateRequestBody,
  withErrorHandler,
} from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import {
  buildCSPDirective,
  buildPermissionsPolicy,
  generateNonce,
  getSecurityConfig,
} from '@/lib/security-config';

function silenceLogger() {
  vi.spyOn(logger, 'info').mockImplementation(() => {});
  vi.spyOn(logger, 'debug').mockImplementation(() => {});
  vi.spyOn(logger, 'error').mockImplementation(() => {});
}

function jsonRequest(body: BodyInit, contentType = 'application/json') {
  return new NextRequest('https://guest.test/api/example', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

describe('bounded API body handling', () => {
  it('parses JSON within the byte limit', async () => {
    await expect(readJsonBody(jsonRequest('{"ok":true}'), 64)).resolves.toEqual({ ok: true });
  });

  it('counts UTF-8 bytes rather than JavaScript characters', async () => {
    await expect(readJsonBody(jsonRequest('"€"'), 4)).rejects.toMatchObject({
      code: ApiErrorCode.PAYLOAD_TOO_LARGE,
      statusCode: 413,
    });
  });

  it('rejects unsupported media types, invalid length and malformed JSON', async () => {
    await expect(readJsonBody(jsonRequest('{}', 'text/plain'), 64)).rejects.toMatchObject({
      code: ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
      statusCode: 415,
    });
    await expect(readJsonBody(new Request('https://guest.test/api/example', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': '-1' },
      body: '{}',
    }), 64)).rejects.toMatchObject({ code: ApiErrorCode.BAD_REQUEST });
    await expect(readJsonBody(jsonRequest('{invalid'), 64)).rejects.toMatchObject({ code: ApiErrorCode.BAD_REQUEST });
  });

  it('cancels an incomplete stream when the client aborts', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(stream) { stream.enqueue(new TextEncoder().encode('{"partial":')); },
      cancel() { cancelled = true; },
    });
    const pending = readJsonBody(new Request('https://guest.test/api/example', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
      // Node's Request requires duplex for streamed request bodies.
      duplex: 'half',
    } as RequestInit), 64);
    const reason = new DOMException('client disconnected', 'AbortError');
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(cancelled).toBe(true);
  });

  it('returns typed Zod validation errors without exposing raw internals', async () => {
    const parse = validateRequestBody(z.object({ phone: z.string().min(8) }).strict(), 128);
    await expect(parse(jsonRequest('{"phone":"short"}'))).rejects.toMatchObject({
      code: ApiErrorCode.VALIDATION_ERROR,
      statusCode: 422,
      details: { validationErrors: expect.any(Array) },
    });
    await expect(parse(jsonRequest('{"phone":"+306951234567"}'))).resolves.toEqual({ phone: '+306951234567' });
  });
});

describe('API response and deadline middleware', () => {
  afterEach(() => vi.useRealTimers());

  it('creates versioned success envelopes with correlation headers', async () => {
    const response = createSuccessResponse({ accepted: true }, 201, 'correlation-1');
    expect(response.status).toBe(201);
    expect(response.headers.get('x-correlation-id')).toBe('correlation-1');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body).toEqual(expect.objectContaining({
      success: true,
      data: { accepted: true },
      meta: expect.objectContaining({ correlationId: 'correlation-1', version: '1.0' }),
    }));
    expect(body.meta).not.toHaveProperty('processingTime');
  });

  it('maps known API errors to stable status, code and correlation headers', async () => {
    silenceLogger();
    const wrapped = withErrorHandler(async () => {
      throw new ApiError(ApiErrorCode.FORBIDDEN, 'Denied');
    });
    const response = await wrapped(new NextRequest('https://guest.test/api/example'), { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
    expect(response.headers.get('x-error-code')).toBe(ApiErrorCode.FORBIDDEN);
    await expect(response.json()).resolves.toMatchObject({ error: { code: ApiErrorCode.FORBIDDEN, message: 'Denied' } });
  });

  it('converts unexpected exceptions into a non-leaking internal error', async () => {
    silenceLogger();
    const wrapped = withErrorHandler(async () => {
      throw new Error('database password leaked here');
    });
    const response = await wrapped(new NextRequest('https://guest.test/api/example'), { params: Promise.resolve({}) });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain(ApiErrorCode.INTERNAL_ERROR);
    expect(text).not.toContain('database password');
  });

  it('aborts cooperative reads at the configured deadline', async () => {
    silenceLogger();
    vi.useFakeTimers();
    let aborted = false;
    const wrapped = withErrorHandler(async (_request, { signal }) => {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(signal.reason);
        }, { once: true });
      });
      return NextResponse.json({ unreachable: true });
    }, { requestTimeoutMs: 25 });
    const pending = wrapped(new NextRequest('https://guest.test/api/example'), { params: Promise.resolve({}) });
    await vi.advanceTimersByTimeAsync(25);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(aborted).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ error: { code: ApiErrorCode.GATEWAY_TIMEOUT } });
  });

  it('waits for a non-cooperative mutation to settle before returning its real result', async () => {
    silenceLogger();
    vi.useFakeTimers();
    let settled = false;
    const wrapped = withErrorHandler(async () => {
      await new Promise<void>((resolve) => setTimeout(() => { settled = true; resolve(); }, 100));
      return NextResponse.json({ committed: true });
    }, { requestTimeoutMs: 25 });
    let responseSettled = false;
    const pending = wrapped(new NextRequest('https://guest.test/api/example', { method: 'PATCH' }), {
      params: Promise.resolve({}),
    }).then((response) => { responseSettled = true; return response; });
    await vi.advanceTimersByTimeAsync(25);
    expect(settled).toBe(false);
    expect(responseSettled).toBe(false);
    await vi.advanceTimersByTimeAsync(75);
    await expect((await pending).json()).resolves.toEqual({ committed: true });
  });

  it('rejects non-positive timeout configuration at route definition time', () => {
    expect(() => withErrorHandler(async () => NextResponse.json({ ok: true }), { requestTimeoutMs: 0 }))
      .toThrow('requestTimeoutMs must be a positive integer');
  });
});

describe('security header builders', () => {
  it('selects production and development policy intentionally', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(getSecurityConfig().csp.reportOnly).toBe(true);
    expect(getSecurityConfig().csp.directives.scriptSrc).not.toContain('https://vercel.live');
    expect(getSecurityConfig().csp.directives.connectSrc).not.toContain('https://vercel.live');
    vi.stubEnv('NODE_ENV', 'production');
    expect(getSecurityConfig().csp.reportOnly).toBe(false);
    expect(getSecurityConfig().headers.hsts.enabled).toBe(true);
  });

  it('allows no third-party connect-src origin (the map calls no routing service)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getSecurityConfig().csp.directives.connectSrc).toEqual(["'self'"]);
    vi.stubEnv('NODE_ENV', 'development');
    expect(getSecurityConfig().csp.directives.connectSrc).toEqual(["'self'", 'wss:', 'ws:']);
  });

  it.each(['production', 'development'])('serves fonts and styles only from the own origin in %s', (nodeEnv) => {
    vi.stubEnv('NODE_ENV', nodeEnv);
    const { directives } = getSecurityConfig().csp;
    // Fonts are self-hosted via next/font/local (identity §2.3); no Google Fonts origin remains.
    expect(directives.styleSrc).toEqual(["'self'", "'unsafe-inline'"]);
    expect(directives.fontSrc).toEqual(["'self'", 'data:']);
    expect(buildCSPDirective(directives)).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });

  it('lists no unsafe-inline script source in production (nonces cover inline scripts)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { csp } = getSecurityConfig();
    expect(csp.useNonce).toBe(true);
    expect(csp.directives.scriptSrc).toEqual(["'self'"]);
    expect(buildCSPDirective(csp.directives, 'abc123')).toContain("script-src 'self' 'nonce-abc123';");
  });

  it('does not require CORP from cross-origin map tiles in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSecurityMiddleware } = await import('@/lib/security-middleware-edge');

    const response = await createSecurityMiddleware()(new NextRequest('https://guide.example/en'));

    // OpenStreetMap and Carto tiles are loaded no-CORS and send no Cross-Origin-Resource-Policy.
    expect(response.headers.get('cross-origin-embedder-policy')).toBe('unsafe-none');
    expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin');
  });

  it('sends production HSTS without the preload directive', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { createSecurityMiddleware } = await import('@/lib/security-middleware-edge');

    const response = await createSecurityMiddleware()(new NextRequest('https://guide.example/en'));
    const hsts = response.headers.get('strict-transport-security') ?? '';

    // Preload list inclusion is hard to reverse; includeSubDomains awaits the hostname layout (R-227).
    expect(hsts.split(';').map((directive) => directive.trim().toLowerCase())).not.toContain('preload');
    expect(hsts).toBe('max-age=63072000; includeSubDomains');
  });

  it.each(['production', 'development'])(
    'advertises only the request headers and methods the API uses in %s preflights',
    async (nodeEnv) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      const { createSecurityMiddleware } = await import('@/lib/security-middleware-edge');

      const response = await createSecurityMiddleware()(
        new NextRequest('https://guide.example/api/admin/rate-periods/1', { method: 'OPTIONS' }),
      );

      // Cookie auth only (no API keys); route handlers export GET, POST, PUT, PATCH, DELETE (R-226, R-228).
      expect(response.headers.get('access-control-allow-headers')).toBe('Content-Type');
      expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST, PUT, PATCH, DELETE, OPTIONS');
    },
  );

  it('adds a nonce while removing unsafe-inline from script-src', () => {
    const directives = getSecurityConfig().csp.directives;
    const csp = buildCSPDirective(directives, 'nonce-value');
    expect(csp).toContain("script-src 'self' 'unsafe-eval'");
    expect(csp).toContain("'nonce-nonce-value'");
    expect(csp.match(/script-src[^;]*/)?.[0]).not.toContain("'unsafe-inline'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('serializes Permissions-Policy keywords, origins and empty lists', () => {
    expect(buildPermissionsPolicy({
      geolocation: ['self', 'https://maps.example'],
      microphone: [], camera: ['none'], payment: ['*'], accelerometer: [], gyroscope: [], magnetometer: [], usb: [],
    })).toContain('geolocation=(self "https://maps.example")');
    expect(buildPermissionsPolicy({
      geolocation: [], microphone: [], camera: [], payment: [], accelerometer: [], gyroscope: [], magnetometer: [], usb: [],
    })).toContain('camera=()');
  });

  it('generates an unpredictable nonce-safe identifier', () => {
    expect(generateNonce()).toMatch(/^[a-f0-9]{32}$/);
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
