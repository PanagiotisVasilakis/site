import { afterEach, describe, expect, it, vi } from 'vitest';

// The logger reads its configuration once, when the module is first loaded.
async function loadLogger(level = 'debug') {
  vi.resetModules();
  vi.stubEnv('LOG_LEVEL', level);
  vi.stubEnv('LOG_CONSOLE', 'true');
  vi.stubEnv('LOG_STRUCTURED', 'false');
  vi.stubEnv('LOG_MAX_METADATA_SIZE', '1000');
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
  it.each(['WARN', 'verbose', 'fatal', 'constructor'])(
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
