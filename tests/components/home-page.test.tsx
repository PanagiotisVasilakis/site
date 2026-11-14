// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/prisma-repositories/availabilityRepository', () => ({ readPublicAvailability: mocks.read }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import Home from '@/app/[locale]/page';

async function renderHome() {
  return render(await Home({ params: Promise.resolve({ locale: 'en' }) }));
}

describe('home page without availability data', () => {
  it('still renders the hero, without the nights strip, when the availability read fails, and logs no details', async () => {
    mocks.read.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const { container } = await renderHome();

    expect(container.querySelector('[data-hero]')).not.toBeNull();
    expect(container.querySelector('#nights')).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledWith('Home availability could not be read');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('ECONNREFUSED');
  });
});
