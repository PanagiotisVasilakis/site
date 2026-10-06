import { inspect } from 'node:util';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn<typeof fetch>(),
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn() },
}));

vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import { CalendarFetchError, fetchAirbnbCalendarText } from '@/lib/availability/icalFetch';

const SENTINEL = 's=SENTINELTOKEN0000';
const FEED_URL = `https://www.airbnb.com/calendar/ical/12345678.ics?${SENTINEL}`;
const CALENDAR = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
const MAX_BYTES = 1_048_576;
const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;

function redirectTo(location: string | null, status = 302) {
  const headers = new Headers();
  if (location !== null) headers.set('location', location);
  return new Response(null, { status, headers });
}

// A body that is only produced on demand (highWaterMark 0), so the test can
// tell whether the fetcher read from it or cancelled it.
function lazyBody(chunk: Uint8Array, chunks: number, cancel: () => void = vi.fn()) {
  const source = { produced: 0, cancel: vi.fn(cancel) };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (source.produced >= chunks) {
        controller.close();
        return;
      }
      source.produced += 1;
      controller.enqueue(chunk);
    },
    cancel: source.cancel,
  }, { highWaterMark: 0 });
  return { stream, source };
}

async function failureOf(promise: Promise<unknown>): Promise<CalendarFetchError> {
  const error = await promise.then(() => undefined, (reason: unknown) => reason);
  if (!(error instanceof CalendarFetchError)) {
    throw new Error(`expected a CalendarFetchError, got ${String(error)}`);
  }
  expect(inspect(error, { depth: 5, showHidden: true })).not.toContain(SENTINEL);
  expect(JSON.stringify(error)).not.toContain(SENTINEL);
  expect(error.cause).toBeUndefined();
  return error;
}

beforeEach(() => {
  vi.stubGlobal('fetch', mocks.fetch);
});

describe('fetchAirbnbCalendarText', () => {
  it('returns the calendar text of a 200 response with a safe request', async () => {
    mocks.fetch.mockResolvedValue(new Response(CALENDAR, { status: 200 }));

    await expect(fetchAirbnbCalendarText(FEED_URL)).resolves.toBe(CALENDAR);

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [input, init] = mocks.fetch.mock.calls[0];
    expect(input).toBe(FEED_URL);
    expect(init).toEqual({
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      signal: expect.any(AbortSignal),
    });
    expect(init?.signal?.aborted).toBe(false);
  });

  it('reads a body of exactly 1 MiB', async () => {
    const chunk = new Uint8Array(MAX_BYTES / 4).fill(0x41);
    const { stream } = lazyBody(chunk, 4);
    mocks.fetch.mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { 'content-length': String(MAX_BYTES) },
    }));

    await expect(fetchAirbnbCalendarText(FEED_URL)).resolves.toHaveLength(MAX_BYTES);
  });

  it('returns an empty string for a 200 response without a body', async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 200 }));

    await expect(fetchAirbnbCalendarText(FEED_URL)).resolves.toBe('');
  });

  it.each([
    ['plain http', 'http://www.airbnb.com/calendar/ical/12345678.ics?s=abc'],
    ['another host', 'https://calendar.example/calendar/ical/12345678.ics'],
    ['userinfo', 'https://user:pass@www.airbnb.com/calendar/ical/12345678.ics'],
    ['a non-default port', 'https://www.airbnb.com:8443/calendar/ical/12345678.ics'],
    ['a non-export path', 'https://www.airbnb.com/rooms/12345678'],
    ['an unparsable value', 'not a url'],
  ])('rejects %s before fetching', async (_label, url) => {
    const error = await failureOf(fetchAirbnbCalendarText(url));

    expect(error.code).toBe('invalid_url');
    expect(error.message).toBe('Calendar fetch failed: invalid_url');
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('rejects a declared content length over 1 MiB without reading the body', async () => {
    const { stream, source } = lazyBody(new Uint8Array(16), 1);
    mocks.fetch.mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { 'content-length': String(MAX_BYTES + 1) },
    }));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('too_large');
    expect(error.message).toBe('Calendar fetch failed: too_large');
    expect(source.produced).toBe(0);
    expect(source.cancel).toHaveBeenCalledTimes(1);
  });

  it('cancels the reader once a streamed body passes 1 MiB', async () => {
    const { stream, source } = lazyBody(new Uint8Array(MAX_BYTES / 4).fill(0x41), 100);
    mocks.fetch.mockResolvedValue(new Response(stream, { status: 200 }));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('too_large');
    expect(source.produced).toBe(5);
    expect(source.cancel).toHaveBeenCalledTimes(1);
  });

  it('maps a timeout to the timeout code', async () => {
    mocks.fetch.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('timeout');
    expect(error.message).toBe('Calendar fetch failed: timeout');
  });

  it('maps a network failure to the network code without the upstream text', async () => {
    mocks.fetch.mockRejectedValue(new TypeError(`fetch failed for ${FEED_URL}`, { cause: new Error(FEED_URL) }));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('network');
    expect(error.message).toBe('Calendar fetch failed: network');
  });

  it('maps a body stream failure to the network code', async () => {
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new TypeError(`terminated ${FEED_URL}`));
      },
    }, { highWaterMark: 0 });
    mocks.fetch.mockResolvedValue(new Response(stream, { status: 200 }));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('network');
  });

  it('passes a combined signal and rethrows the caller abort reason', async () => {
    mocks.fetch.mockImplementation((_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    }));
    const controller = new AbortController();
    const reason = new Error('sync cancelled');

    const pending = fetchAirbnbCalendarText(FEED_URL, { signal: controller.signal });
    const passed = mocks.fetch.mock.calls[0][1]?.signal;
    expect(passed).not.toBe(controller.signal);
    expect(passed?.aborted).toBe(false);
    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(passed?.aborted).toBe(true);
  });

  it('cancels the body read when the caller aborts mid-stream', async () => {
    const controller = new AbortController();
    const reason = new Error('sync cancelled');
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        controller.abort(reason);
        return new Promise<void>(() => undefined);
      },
      cancel,
    }, { highWaterMark: 0 });
    mocks.fetch.mockResolvedValue(new Response(stream, { status: 200 }));

    await expect(fetchAirbnbCalendarText(FEED_URL, { signal: controller.signal })).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('applies one 10 s timeout to the request and the body read', async () => {
    const timer = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(timer.signal);
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        timer.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
        return new Promise<void>(() => undefined);
      },
      cancel,
    }, { highWaterMark: 0 });
    mocks.fetch.mockResolvedValue(new Response(stream, { status: 200 }));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('timeout');
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(mocks.fetch.mock.calls[0][1]?.signal).toBe(timer.signal);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a rejected redirect', (body: ReadableStream<Uint8Array>) => new Response(body, {
      status: 302,
      headers: { location: 'https://evil.example/' },
    }), 'redirect_rejected'],
    ['an error status', (body: ReadableStream<Uint8Array>) => new Response(body, { status: 404 }), 'http_status'],
    ['a declared oversize body', (body: ReadableStream<Uint8Array>) => new Response(body, {
      status: 200,
      headers: { 'content-length': String(MAX_BYTES + 1) },
    }), 'too_large'],
    ['a streamed oversize body', (body: ReadableStream<Uint8Array>) => new Response(body, { status: 200 }), 'too_large'],
  ] as const)('keeps the %s result when cancelling the body fails', async (_label, respond, code) => {
    const { stream, source } = lazyBody(new Uint8Array(MAX_BYTES / 2), 10, () => {
      throw new Error(`cancel failed for ${FEED_URL}`);
    });
    mocks.fetch.mockResolvedValue(respond(stream));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe(code);
    expect(source.cancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the caller abort reason when cancelling the body fails', async () => {
    const controller = new AbortController();
    const reason = new Error('sync cancelled');
    const cancel = vi.fn(() => {
      throw new Error(`cancel failed for ${FEED_URL}`);
    });
    const stream = new ReadableStream<Uint8Array>({
      pull() {
        controller.abort(reason);
        return new Promise<void>(() => undefined);
      },
      cancel,
    }, { highWaterMark: 0 });
    mocks.fetch.mockResolvedValue(new Response(stream, { status: 200 }));

    await expect(fetchAirbnbCalendarText(FEED_URL, { signal: controller.signal })).rejects.toBe(reason);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it.each([301, 302, 303, 307, 308])('follows a %i redirect to an allowlisted Airbnb URL', async (status) => {
    const next = `https://airbnb.gr/calendar/ical/12345678.ics?${SENTINEL}&v=2`;
    mocks.fetch
      .mockResolvedValueOnce(redirectTo(next, status))
      .mockResolvedValueOnce(new Response(CALENDAR, { status: 200 }));

    await expect(fetchAirbnbCalendarText(FEED_URL)).resolves.toBe(CALENDAR);

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls[1][0]).toBe(next);
    expect(mocks.fetch.mock.calls[1][1]).toEqual(expect.objectContaining({ method: 'GET', redirect: 'manual' }));
  });

  it('resolves a relative Location against the current URL', async () => {
    mocks.fetch
      .mockResolvedValueOnce(redirectTo(`/calendar/ical/87654321.ics?${SENTINEL}`))
      .mockResolvedValueOnce(new Response(CALENDAR, { status: 200 }));

    await expect(fetchAirbnbCalendarText(FEED_URL)).resolves.toBe(CALENDAR);

    expect(mocks.fetch.mock.calls[1][0]).toBe(`https://www.airbnb.com/calendar/ical/87654321.ics?${SENTINEL}`);
  });

  it('resolves a relative Location on a later hop against that hop, not the start URL', async () => {
    mocks.fetch
      .mockResolvedValueOnce(redirectTo(`https://airbnb.gr/calendar/ical/1.ics?${SENTINEL}`))
      .mockResolvedValueOnce(redirectTo(`/calendar/ical/2.ics?${SENTINEL}`))
      .mockResolvedValueOnce(new Response(CALENDAR, { status: 200 }));

    await expect(fetchAirbnbCalendarText(FEED_URL)).resolves.toBe(CALENDAR);

    expect(mocks.fetch).toHaveBeenCalledTimes(3);
    expect(mocks.fetch.mock.calls[2][0]).toBe(`https://airbnb.gr/calendar/ical/2.ics?${SENTINEL}`);
  });

  it.each([
    ['plain http', `http://www.airbnb.com/calendar/ical/12345678.ics?${SENTINEL}`],
    ['a loopback address', `https://127.0.0.1/calendar/ical/12345678.ics?${SENTINEL}`],
    ['a foreign host', `https://evil.example/calendar/ical/12345678.ics?${SENTINEL}`],
    ['a protocol-relative foreign host', `//evil.example/calendar/ical/12345678.ics?${SENTINEL}`],
    ['a relative path outside the export', `../../users/show/1?${SENTINEL}`],
    ['userinfo', `https://user:pass@www.airbnb.com/calendar/ical/12345678.ics?${SENTINEL}`],
    ['a non-default port', `https://www.airbnb.com:8443/calendar/ical/12345678.ics?${SENTINEL}`],
    ['an unparsable Location', `https://[${SENTINEL}`],
    ['a missing Location', null],
  ])('rejects a redirect to %s without fetching it', async (_label, location) => {
    const body = lazyBody(new Uint8Array(16), 1);
    const headers = new Headers();
    if (location !== null) headers.set('location', location);
    mocks.fetch.mockResolvedValueOnce(new Response(body.stream, { status: 302, headers }));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('redirect_rejected');
    expect(error.message).toBe('Calendar fetch failed: redirect_rejected');
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(body.source.cancel).toHaveBeenCalledTimes(1);
  });

  it('stops after two redirects', async () => {
    mocks.fetch
      .mockResolvedValueOnce(redirectTo(`https://airbnb.com/calendar/ical/1.ics?${SENTINEL}`))
      .mockResolvedValueOnce(redirectTo(`https://www.airbnb.gr/calendar/ical/2.ics?${SENTINEL}`))
      .mockResolvedValueOnce(redirectTo(`https://airbnb.gr/calendar/ical/3.ics?${SENTINEL}`));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('too_many_redirects');
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it.each([204, 300, 304, 404, 503])('rejects status %i with the status and discards the body', async (status) => {
    const body = status === 204 || status === 304 ? null : lazyBody(new Uint8Array(16), 1);
    mocks.fetch.mockResolvedValue(new Response(body?.stream ?? null, { status }));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('http_status');
    expect(error.httpStatus).toBe(status);
    expect(error.message).toBe(`Calendar fetch failed: http_status ${status}`);
    if (body) expect(body.source.cancel).toHaveBeenCalledTimes(1);
  });

  it('rejects a body that is not valid UTF-8', async () => {
    mocks.fetch.mockResolvedValue(new Response(new Uint8Array([0x42, 0x45, 0xff, 0xfe]), { status: 200 }));

    const error = await failureOf(fetchAirbnbCalendarText(FEED_URL));

    expect(error.code).toBe('invalid_encoding');
    expect(error.httpStatus).toBeUndefined();
  });

  it('never writes the feed URL or its token to the console or the logger', async () => {
    const spies = CONSOLE_METHODS.map((method) => vi.spyOn(console, method).mockImplementation(() => undefined));
    const scenarios: Array<() => void> = [
      () => mocks.fetch.mockRejectedValueOnce(new TypeError(`fetch failed ${FEED_URL}`)),
      () => mocks.fetch.mockRejectedValueOnce(new DOMException(FEED_URL, 'TimeoutError')),
      () => mocks.fetch.mockResolvedValueOnce(redirectTo(`https://evil.example/?${SENTINEL}`)),
      () => mocks.fetch.mockResolvedValueOnce(new Response(FEED_URL, { status: 500 })),
      () => mocks.fetch.mockResolvedValueOnce(new Response(new Uint8Array([0xff]), { status: 200 })),
    ];
    for (const arrange of scenarios) {
      arrange();
      await failureOf(fetchAirbnbCalendarText(FEED_URL));
    }
    await failureOf(fetchAirbnbCalendarText(`http://www.airbnb.com/calendar/ical/1.ics?${SENTINEL}`));

    const written = inspect([
      ...spies.map((spy) => spy.mock.calls),
      ...Object.values(mocks.logger).map((fn) => fn.mock.calls),
    ], { depth: 8 });
    expect(written).not.toContain('SENTINELTOKEN0000');
  });
});
