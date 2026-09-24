import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAllBookings: vi.fn(),
  isAdminRequest: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/guestDataExport', () => ({ guestDataExport: { getAllBookings: mocks.getAllBookings } }));
vi.mock('@/lib/rbac', () => ({ isAdminRequest: mocks.isAdminRequest }));
vi.mock('@/lib/logger-enterprise', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/logger-enterprise')>();
  return { ...actual, logger: { ...actual.logger, error: mocks.loggerError, debug: vi.fn(), info: vi.fn(), warn: vi.fn(), getContext: actual.logger.getContext.bind(actual.logger), setContext: actual.logger.setContext.bind(actual.logger) } };
});

import { GET } from '@/app/api/admin/guests/route';

describe('admin guests route error handling', () => {
  it('logs unexpected failures at error level without echoing internal messages', async () => {
    mocks.isAdminRequest.mockResolvedValue(true);
    mocks.getAllBookings.mockRejectedValue(new Error('relation "bookings" does not exist'));

    const response = await GET(
      new NextRequest('https://guest-guide.test/api/admin/guests?action=list'),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('does not exist');
    expect(mocks.loggerError).toHaveBeenCalledWith(
      'Unexpected API error',
      expect.any(Object),
      expect.objectContaining({ message: 'relation "bookings" does not exist' }),
    );
  });
});
