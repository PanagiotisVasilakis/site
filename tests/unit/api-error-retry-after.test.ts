import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ApiErrorCode, withErrorHandler } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';

const context = { params: Promise.resolve({}) };

async function respondWith(error: ApiError) {
  const wrapped = withErrorHandler(async () => {
    throw error;
  });
  return wrapped(new NextRequest('https://guest.test/api/example'), context);
}

describe('withErrorHandler Retry-After header', () => {
  beforeEach(() => {
    vi.spyOn(logger, 'info').mockImplementation(() => {});
    vi.spyOn(logger, 'debug').mockImplementation(() => {});
  });

  it('sends the retry hint of a 503 as a Retry-After header', async () => {
    const response = await respondWith(new ApiError(ApiErrorCode.SERVICE_UNAVAILABLE, 'Unavailable', { retryAfterSeconds: 5 }));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
  });

  it('sends no Retry-After header for a 503 without a hint', async () => {
    const response = await respondWith(new ApiError(ApiErrorCode.SERVICE_UNAVAILABLE, 'Unavailable'));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
  });

  it('ignores a retry hint on any other status', async () => {
    const response = await respondWith(new ApiError(ApiErrorCode.NOT_FOUND, 'Missing', { retryAfterSeconds: 5 }));

    expect(response.status).toBe(404);
    expect(response.headers.get('retry-after')).toBeNull();
  });

  it('ignores a retry hint that is not a number', async () => {
    const response = await respondWith(new ApiError(ApiErrorCode.SERVICE_UNAVAILABLE, 'Unavailable', { retryAfterSeconds: 'soon' }));

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
  });
});
