import { NextRequest, NextResponse } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiErrorCode, readJsonBody, TimeoutError, withErrorHandler } from './apiErrorHandler';

function request(body: BodyInit, contentType = 'application/json') {
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

describe('readJsonBody', () => {
  it('parses a bounded JSON request', async () => {
    await expect(readJsonBody(request('{"ok":true}'), 64)).resolves.toEqual({ ok: true });
  });

  it('enforces the actual UTF-8 byte count', async () => {
    await expect(readJsonBody(request('"€"'), 4)).rejects.toMatchObject({
      code: ApiErrorCode.PAYLOAD_TOO_LARGE,
      statusCode: 413,
    });
  });

  it('rejects an unsupported media type', async () => {
    await expect(readJsonBody(request('{}', 'text/plain'), 64)).rejects.toMatchObject({
      code: ApiErrorCode.UNSUPPORTED_MEDIA_TYPE,
      statusCode: 415,
    });
  });

  it('cancels an incomplete request body when its request signal aborts', async () => {
    const controller = new AbortController();
    let streamCancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(streamController) {
        streamController.enqueue(new TextEncoder().encode('{"partial":'));
      },
      cancel() {
        streamCancelled = true;
      },
    });
    const pending = readJsonBody(new NextRequest('http://localhost/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: controller.signal,
    }), 64);

    const reason = new TimeoutError(25);
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    expect(streamCancelled).toBe(true);
  });
});

describe('withErrorHandler cancellation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts cooperative handler work before returning a timeout response', async () => {
    vi.useFakeTimers();
    let signalSeen: AbortSignal | undefined;
    let cleanupRan = false;
    let completed = false;

    const wrapped = withErrorHandler(async (_request, { signal }) => {
      signalSeen = signal;
      await new Promise<void>((resolve, reject) => {
        const work = setTimeout(() => {
          completed = true;
          resolve();
        }, 1_000);
        signal.addEventListener('abort', () => {
          clearTimeout(work);
          cleanupRan = true;
          reject(signal.reason);
        }, { once: true });
      });
      return NextResponse.json({ completed: true });
    }, {
      enableErrorLogging: false,
      enablePerformanceLogging: false,
      requestTimeoutMs: 25,
    });

    const responsePromise = wrapped(
      new NextRequest('http://localhost/api/test', { method: 'POST' }),
      { params: Promise.resolve({}) },
    );
    await vi.advanceTimersByTimeAsync(25);
    const response = await responsePromise;

    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: ApiErrorCode.GATEWAY_TIMEOUT },
    });
    expect(signalSeen?.aborted).toBe(true);
    expect(signalSeen?.reason).toBeInstanceOf(TimeoutError);
    expect(cleanupRan).toBe(true);
    expect(completed).toBe(false);
  });

  it('does not return a timeout while a non-cancellable mutation is still in flight', async () => {
    vi.useFakeTimers();
    let signalSeen: AbortSignal | undefined;
    let mutationSettled = false;
    let responseSettled = false;
    const wrapped = withErrorHandler(async (_request, { signal }) => {
      signalSeen = signal;
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          mutationSettled = true;
          resolve();
        }, 100);
      });
      return NextResponse.json({ committed: true });
    }, {
      enableErrorLogging: false,
      enablePerformanceLogging: false,
      requestTimeoutMs: 25,
    });

    const responsePromise = wrapped(
      new NextRequest('http://localhost/api/test', { method: 'PATCH' }),
      { params: Promise.resolve({}) },
    ).then((response) => {
      responseSettled = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(25);
    expect(signalSeen?.aborted).toBe(true);
    expect(mutationSettled).toBe(false);
    expect(responseSettled).toBe(false);

    await vi.advanceTimersByTimeAsync(75);
    const response = await responsePromise;
    expect(mutationSettled).toBe(true);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ committed: true });
  });

  it('propagates the deadline through the wrapped request signal', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const wrapped = withErrorHandler(async (wrappedRequest) => {
      requestSignal = wrappedRequest.signal;
      await new Promise<void>((_resolve, reject) => {
        wrappedRequest.signal.addEventListener('abort', () => reject(wrappedRequest.signal.reason), { once: true });
      });
      return NextResponse.json({ unreachable: true });
    }, {
      enableErrorLogging: false,
      enablePerformanceLogging: false,
      requestTimeoutMs: 25,
    });

    const responsePromise = wrapped(
      new NextRequest('http://localhost/api/test', { method: 'POST' }),
      { params: Promise.resolve({}) },
    );
    await vi.advanceTimersByTimeAsync(25);
    expect((await responsePromise).status).toBe(504);
    expect(requestSignal?.reason).toBeInstanceOf(TimeoutError);
  });

  it('clears the deadline without aborting a completed handler', async () => {
    vi.useFakeTimers();
    let signalSeen: AbortSignal | undefined;
    const wrapped = withErrorHandler(async (_request, { signal }) => {
      signalSeen = signal;
      return NextResponse.json({ ok: true });
    }, {
      enableErrorLogging: false,
      enablePerformanceLogging: false,
      requestTimeoutMs: 25,
    });

    const response = await wrapped(
      new NextRequest('http://localhost/api/test'),
      { params: Promise.resolve({}) },
    );
    await vi.runAllTimersAsync();

    expect(response.status).toBe(200);
    expect(signalSeen?.aborted).toBe(false);
  });

  it('rejects invalid deadline configuration during route setup', () => {
    expect(() => withErrorHandler(
      async () => NextResponse.json({ ok: true }),
      { requestTimeoutMs: 0 },
    )).toThrow('requestTimeoutMs must be a positive integer');
  });
});
