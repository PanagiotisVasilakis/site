import { afterEach, describe, expect, it, vi } from 'vitest';

// The logger reads its configuration once, when the module is first loaded.
async function loadLogger(
  level = 'debug',
  options: { structured?: boolean; maxMetadataSize?: string } = {},
) {
  vi.resetModules();
  vi.stubEnv('LOG_LEVEL', level);
  vi.stubEnv('LOG_CONSOLE', 'true');
  vi.stubEnv('LOG_STRUCTURED', options.structured ? 'true' : 'false');
  vi.stubEnv('LOG_MAX_METADATA_SIZE', options.maxMetadataSize ?? '1000');
  return (await import('@/lib/logger-enterprise')).logger;
}

afterEach(() => {
  vi.doUnmock('@/lib/guestDataStore');
  vi.resetModules();
});

describe('logger metadata redaction', () => {
  it.each([
    ['phone', '+30 694 555 1234'],
    ['email', 'guest@example.com'],
    ['userAgent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'],
    ['cfConnectingIp', '203.0.113.10'],
    ['password', 'correct horse battery staple'],
  ])('logs the metadata key %s as [REDACTED]', async (key, value) => {
    const logger = await loadLogger();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.info('Portal sign-in', { [key]: value, outcome: 'rejected' });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toEqual({ [key]: '[REDACTED]', outcome: 'rejected' });
    expect(JSON.stringify(info.mock.calls)).not.toContain(value);
  });

  it('keeps redacting the keys that the logger already covered', async () => {
    const logger = await loadLogger();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.info('Request', {
      apiKey: 'k',
      sessionId: 's',
      authorization: 'Bearer x',
      'x-forwarded-for': '203.0.113.10',
      'connecting-ip': '203.0.113.11',
    });

    expect(info.mock.calls[0][1]).toEqual({
      apiKey: '[REDACTED]',
      sessionId: '[REDACTED]',
      authorization: '[REDACTED]',
      'x-forwarded-for': '[REDACTED]',
      'connecting-ip': '[REDACTED]',
    });
  });

  it('redacts sensitive keys nested in objects and arrays and keeps the other keys', async () => {
    const logger = await loadLogger();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.info('Check-in', {
      request: { headers: { 'user-agent': 'Mozilla/5.0' }, referenceLength: 16 },
      attempts: [{ email: 'guest@example.com', accepted: false }],
    });

    expect(info.mock.calls[0][1]).toEqual({
      request: { headers: { 'user-agent': '[REDACTED]' }, referenceLength: 16 },
      attempts: [{ email: '[REDACTED]', accepted: false }],
    });
  });
});

describe('logger level threshold', () => {
  // The workers never run the environment schema, so an unusable value must not silence the logger.
  it.each(['WARN', 'verbose', 'constructor'])(
    'ignores the unknown LOG_LEVEL %s and still emits errors',
    async (level) => {
      const logger = await loadLogger(level);
      const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

      logger.error('Failed to persist security event');

      expect(error).toHaveBeenCalledTimes(1);
    },
  );

  it('falls back to the production default level for an unknown LOG_LEVEL', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const logger = await loadLogger('fatal');
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.debug('Detail');
    logger.info('Summary');

    expect(debug).not.toHaveBeenCalled();
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('keeps honouring a recognised LOG_LEVEL', async () => {
    const logger = await loadLogger('warn');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    logger.info('Summary');
    logger.warn('Deferred');

    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('logger metadata rendering', () => {
  // Each case builds its own input, so no row depends on objects created by another row.
  const cases: Array<{
    name: string;
    build: () => { metadata: Record<string, unknown>; expected: unknown };
  }> = [
    { name: 'a zero bigint', build: () => ({ metadata: { n: BigInt(0) }, expected: { n: '0' } }) },
    {
      name: 'a valid Date',
      build: () => ({
        metadata: { at: new Date('2026-10-13T08:30:00.000Z') },
        expected: { at: '2026-10-13T08:30:00.000Z' },
      }),
    },
    {
      name: 'an invalid Date',
      build: () => ({ metadata: { at: new Date('not a date') }, expected: { at: 'Invalid Date' } }),
    },
    {
      name: 'a URL',
      build: () => ({
        metadata: { u: new URL('https://example.com/kalamata') },
        expected: { u: 'https://example.com/kalamata' },
      }),
    },
    {
      name: 'a Map',
      build: () => ({
        metadata: { m: new Map([['city', 'Kalamata'], ['password', 'hunter2']]) },
        expected: { m: [['city', 'Kalamata'], ['password', '[REDACTED]']] },
      }),
    },
    { name: 'a Set', build: () => ({ metadata: { s: new Set(['a', 'b']) }, expected: { s: ['a', 'b'] } }) },
    {
      name: 'an object repeated under two keys',
      build: () => {
        const shared = { ok: true };
        return { metadata: { a: shared, b: shared }, expected: { a: { ok: true }, b: { ok: true } } };
      },
    },
    {
      name: 'a true cycle',
      build: () => {
        const node: Record<string, unknown> = { name: 'n' };
        node.self = node;
        return { metadata: { node }, expected: { node: { name: 'n', self: '[CIRCULAR]' } } };
      },
    },
    {
      name: 'a cycle through a Map',
      build: () => {
        const m = new Map<string, unknown>();
        m.set('self', m);
        return { metadata: { m }, expected: { m: [['self', '[CIRCULAR]']] } };
      },
    },
    {
      name: 'a cycle through a Set',
      build: () => {
        const s = new Set<unknown>();
        s.add(s);
        return { metadata: { s }, expected: { s: ['[CIRCULAR]'] } };
      },
    },
    {
      name: 'a Date under a sensitive key',
      build: () => ({
        metadata: { token: new Date('2026-10-13T08:30:00.000Z') },
        expected: { token: '[REDACTED]' },
      }),
    },
    {
      name: 'a bigint under a sensitive key',
      build: () => ({ metadata: { apiKey: BigInt(10) }, expected: { apiKey: '[REDACTED]' } }),
    },
  ];

  it.each(cases)('renders $name', async ({ build }) => {
    const { metadata, expected } = build();
    const logger = await loadLogger();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.info('Summary', metadata);

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toEqual(expected);
  });

  it('redacts a Map value whose key is sensitive and keeps the other entries', async () => {
    const logger = await loadLogger();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.info('Request', { headers: new Map([['cookie', 'session=abc123'], ['accept', 'text/html']]) });

    expect(JSON.stringify(info.mock.calls)).not.toContain('session=abc123');
    expect(info.mock.calls[0][1]).toEqual({ headers: [['cookie', '[REDACTED]'], ['accept', 'text/html']] });
  });

  it('logs a placeholder instead of throwing when the metadata cannot be serialised', async () => {
    const logger = await loadLogger();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    // An own toJSON that throws survives the sanitiser and makes JSON.stringify fail.
    logger.info('Summary', { payload: { toJSON: () => { throw new Error('boom'); } } });

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toEqual({ _unserializable: true });
  });
});

describe('logger metadata size limit', () => {
  // Anything other than a strict integer of at least 200 keeps the 1000 character budget.
  it.each(['', '0', '199', '1e3', '1.5e3', '-300'])(
    'uses the 1000 character budget for LOG_MAX_METADATA_SIZE=%j',
    async (configured) => {
      const logger = await loadLogger('debug', { maxMetadataSize: configured });
      const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
      const metadata = { note: 'x'.repeat(1100) };
      const serialised = JSON.stringify(metadata);

      logger.info('Summary', metadata);

      // The preview keeps the budget minus the 120 characters reserved for the marker fields.
      expect(info.mock.calls[0][1]).toEqual({
        _truncated: true,
        _originalSize: serialised.length,
        _preview: serialised.slice(0, 880),
      });
    },
  );

  it('honours a configured budget of exactly 200 characters', async () => {
    const logger = await loadLogger('debug', { maxMetadataSize: '200' });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const metadata = { note: 'x'.repeat(260) };
    const serialised = JSON.stringify(metadata);

    logger.info('Summary', metadata);

    expect(info.mock.calls[0][1]).toEqual({
      _truncated: true,
      _originalSize: serialised.length,
      _preview: serialised.slice(0, 80),
    });
  });
});

describe('logger structured mode', () => {
  it('prints each entry on a single line', async () => {
    const logger = await loadLogger('debug', { structured: true });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logger.info('Summary', { outcome: 'accepted', nested: { count: 2 } });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line).not.toContain('\n');
    expect(JSON.parse(line)).toMatchObject({
      level: 'info',
      message: 'Summary',
      metadata: { outcome: 'accepted', nested: { count: 2 } },
    });
  });

  it.each([
    {
      name: 'an Error cause',
      cause: () => new TypeError('upstream unavailable'),
      expected: { name: 'TypeError', message: 'upstream unavailable' },
    },
    {
      name: 'a string cause',
      cause: () => 'upstream failed',
      expected: { name: 'StringError', message: 'upstream failed' },
    },
    {
      name: 'a circular object cause',
      cause: () => {
        const node: Record<string, unknown> = {};
        node.self = node;
        return node;
      },
      expected: { name: 'UnknownError', message: '[object Object]' },
    },
    {
      name: 'an object cause without a prototype',
      cause: () => Object.create(null),
      expected: { name: 'UnknownError', message: '[object Object]' },
    },
  ])('reduces $name to its name and message', async ({ cause, expected }) => {
    const logger = await loadLogger('debug', { structured: true });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logger.error('Failed to persist security event', new Error('wrapper', { cause: cause() }));

    expect(error).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(error.mock.calls[0][0])).error.cause).toEqual(expected);
  });

  it('keeps the cause as logged when structured mode is off', async () => {
    const logger = await loadLogger('debug');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const cause = new TypeError('upstream unavailable');

    logger.error('Failed to persist security event', new Error('wrapper', { cause }));

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][1].cause).toBe(cause);
  });
});

describe('admin guest lookups', () => {
  it('log only the length of a booking reference that matches nothing', async () => {
    await loadLogger();
    const findBookingByReference = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/guestDataStore', () => ({ guestStore: { findBookingByReference } }));
    const { guestDataExport } = await import('@/lib/guestDataExport');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const typed = '+30 694 555 1234';

    await expect(guestDataExport.getBookingByReference(typed)).resolves.toBeNull();

    expect(findBookingByReference).toHaveBeenCalledWith(typed);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toEqual({ referenceLength: typed.length });
    expect(JSON.stringify(info.mock.calls)).not.toContain(typed);
  });

  it('log the typed phone number only as [REDACTED]', async () => {
    await loadLogger();
    const findUserByPhone = vi.fn().mockResolvedValue(undefined);
    vi.doMock('@/lib/guestDataStore', () => ({ guestStore: { findUserByPhone } }));
    const { guestDataExport } = await import('@/lib/guestDataExport');
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await expect(guestDataExport.getBookingsByPhone('+30 694 555 1234')).resolves.toEqual([]);

    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][1]).toEqual({ phone: '[REDACTED]' });
  });
});
