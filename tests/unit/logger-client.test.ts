import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/lib/logger-client';

describe('client logger metadata', () => {
  it('keeps the message of an Error nested in metadata', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    logger.warn('request failed', { error: new Error('boom') });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"message": "boom"'));
  });

  it('does not throw on circular metadata', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const circular: Record<string, unknown> = { name: 'node' };
    circular.self = circular;

    expect(() => logger.warn('circular', { circular })).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[unserializable metadata]'));
  });
});
