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
import {
  buildCSPDirective,
  buildPermissionsPolicy,
  generateNonce,
  getSecurityConfig,
} from '@/lib/security-config';

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
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      success: true,
      data: { accepted: true },
      meta: expect.objectContaining({ correlationId: 'correlation-1', version: '1.0' }),
    }));
  });

  it('maps known API errors to stable status, code and correlation headers', async () => {
    const wrapped = withErrorHandler(async () => {
      throw new ApiError(ApiErrorCode.FORBIDDEN, 'Denied');
    }, { enableErrorLogging: false, enablePerformanceLogging: false });
    const response = await wrapped(new NextRequest('https://guest.test/api/example'), { params: Promise.resolve({}) });
    expect(response.status).toBe(403);
    expect(response.headers.get('x-error-code')).toBe(ApiErrorCode.FORBIDDEN);
    await expect(response.json()).resolves.toMatchObject({ error: { code: ApiErrorCode.FORBIDDEN, message: 'Denied' } });
  });

  it('converts unexpected exceptions into a non-leaking internal error', async () => {
    const wrapped = withErrorHandler(async () => {
      throw new Error('database password leaked here');
    }, { enableErrorLogging: false, enablePerformanceLogging: false });
    const response = await wrapped(new NextRequest('https://guest.test/api/example'), { params: Promise.resolve({}) });
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).toContain(ApiErrorCode.INTERNAL_ERROR);
    expect(text).not.toContain('database password');
  });

  it('aborts cooperative reads at the configured deadline', async () => {
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
    }, { enableErrorLogging: false, enablePerformanceLogging: false, requestTimeoutMs: 25 });
    const pending = wrapped(new NextRequest('https://guest.test/api/example'), { params: Promise.resolve({}) });
    await vi.advanceTimersByTimeAsync(25);
    const response = await pending;
    expect(response.status).toBe(504);
    expect(aborted).toBe(true);
    await expect(response.json()).resolves.toMatchObject({ error: { code: ApiErrorCode.GATEWAY_TIMEOUT } });
  });

  it('waits for a non-cooperative mutation to settle before returning its real result', async () => {
    vi.useFakeTimers();
    let settled = false;
    const wrapped = withErrorHandler(async () => {
      await new Promise<void>((resolve) => setTimeout(() => { settled = true; resolve(); }, 100));
      return NextResponse.json({ committed: true });
    }, { enableErrorLogging: false, enablePerformanceLogging: false, requestTimeoutMs: 25 });
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
    vi.stubEnv('NODE_ENV', 'production');
    expect(getSecurityConfig().csp.reportOnly).toBe(false);
    expect(getSecurityConfig().headers.hsts.enabled).toBe(true);
  });

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
