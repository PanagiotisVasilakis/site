// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/prisma-repositories/availabilityRepository', () => ({ readPublicAvailability: mocks.read }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import Home from '@/app/[locale]/page';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-01' as IsoDate;

function availability(): PublicAvailability {
  return {
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: '2026-10-01T08:30:00.000Z',
    nights: 'o'.repeat(365),
    rates: [
      { start: TODAY, end: '2026-10-20' as IsoDate, nightlyPriceCents: 9500, minimumNights: 1 },
      { start: '2026-10-20' as IsoDate, end: '2026-12-01' as IsoDate, nightlyPriceCents: 7000, minimumNights: 1 },
    ],
  };
}

async function renderHome() {
  return render(await Home({ params: Promise.resolve({ locale: 'en' }) }));
}

beforeEach(() => {
  mocks.read.mockResolvedValue(availability());
});

describe('home page hero price (identity §1.4)', () => {
  it('shows the lowest nightly rate from the availability data', async () => {
    const { container } = await renderHome();

    expect(container.querySelector('.hero__price')).toHaveTextContent('from €70 / night');
    expect(mocks.logger.error).not.toHaveBeenCalled();
  });

  it('still renders the hero, without a price, when the availability read fails', async () => {
    mocks.read.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const { container } = await renderHome();

    expect(container.querySelector('[data-hero]')).not.toBeNull();
    expect(container.querySelector('.hero__price')).toHaveTextContent('See prices & free dates');
    expect(container.querySelector('.hero__price-value')).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledWith('Home price could not be read');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('ECONNREFUSED');
  });
});
