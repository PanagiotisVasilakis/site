// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/prisma-repositories/availabilityRepository', () => ({ readPublicAvailability: mocks.read }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

import AvailabilityPage, { dynamic } from '@/app/[locale]/availability/page';
import { BOOKING_COM_LISTING_URL, HOST_CONTACT } from '@/data/contact';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-01' as IsoDate;
const NOW = new Date('2026-10-01T09:00:00.000Z');

function availability(overrides: Partial<PublicAvailability> = {}): PublicAvailability {
  return {
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: '2026-10-01T08:30:00.000Z',
    nights: 'o'.repeat(365),
    rates: [],
    ...overrides,
  };
}

async function pageMarkup(locale: Locale = 'en') {
  return renderToStaticMarkup(await AvailabilityPage({ params: Promise.resolve({ locale }) }));
}

async function renderPage(locale: Locale = 'en') {
  return render(await AvailabilityPage({ params: Promise.resolve({ locale }) }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  window.history.replaceState(null, '', '/en/availability');
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  mocks.read.mockResolvedValue(availability());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('availability page', () => {
  it('renders dynamically with calendar, Athens timestamp, Booking.com CTA, host identity, and no prices', async () => {
    expect(dynamic).toBe('force-dynamic');
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValue(availability({ rates: [{ start: TODAY, end: addDays(TODAY, 365), minimumNights: 1 }] }));
    const { container } = await renderPage();

    expect(mocks.read).toHaveBeenCalledWith(NOW);
    expect(screen.getByRole('heading', { level: 1, name: t.title })).toBeInTheDocument();
    expect(container.querySelector('[data-day="2026-10-09"] button')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: t.summary.title })).toBeInTheDocument();
    expect(screen.getByText('Availability last updated: 1 Oct 2026, 11:30')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `${t.booking.bookingCom} ${t.booking.opensInNewTab}` }))
      .toHaveAttribute('href', BOOKING_COM_LISTING_URL);
    expect(within(container.querySelector('.avail-page__head') as HTMLElement).getByText(HOST_CONTACT.legalName)).toBeInTheDocument();
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).not.toMatch(/€|cancel|ακύρωσ/i);
  });

  it('replaces unconfigured or stale calendars with an info callout and contact links without <noscript>', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValueOnce(availability({
      status: 'not_configured',
      nights: 'u'.repeat(365),
      lastSyncedAt: null,
      rates: [{ start: TODAY, end: addDays(TODAY, 365), minimumNights: 1 }],
    }));
    const unconfigured = await renderPage();
    expect(screen.getByText(t.status.notConfigured).closest('.ui-callout')).toHaveClass('ui-callout--info');
    expect(unconfigured.container.querySelector('.cal')).toBeNull();
    for (const text of [t.intro, t.howToBook[0], t.howToBookBookingCom]) expect(screen.queryByText(text)).not.toBeInTheDocument();
    for (const item of t.howToBook.slice(1)) expect(screen.getByText(item)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.booking.call })).toHaveAttribute('href', 'tel:+306955810051');
    unconfigured.unmount();

    mocks.read.mockResolvedValue(availability({
      status: 'stale',
      nights: 'o'.repeat(365),
      lastSyncedAt: '2026-09-30T08:30:00.000Z',
    }));
    const stale = await renderPage();
    expect(screen.getByText(t.status.unavailable).closest('.ui-callout')).toHaveClass('ui-callout--info');
    expect(screen.getByText('Availability last updated: 30 Sept 2026, 11:30')).toBeInTheDocument();
    expect(stale.container.querySelector('.cal')).toBeNull();
    expect(await pageMarkup()).not.toContain('<noscript>');
    mocks.read.mockResolvedValue(availability());
  });

  it('renders a 60-night noscript summary and safely hides repository errors', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValueOnce(availability({ nights: `${'o'.repeat(9)}b${'o'.repeat(355)}` }));
    const html = await pageMarkup();
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? '';
    expect(noscript.match(/<li/g)).toHaveLength(60);
    expect(noscript).toContain('Thu 1 Oct 2026');
    expect(noscript).toMatch(/Sat 10 Oct 2026<\/span><span[^>]*>booked</);
    expect(noscript).toContain('Sun 29 Nov 2026');
    expect(noscript).not.toContain('Mon 30 Nov 2026');

    mocks.read.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret'));
    const { container } = await renderPage();
    expect(screen.getByText(t.status.unavailable).closest('.ui-callout')).toHaveClass('ui-callout--info');
    expect(container.querySelector('.cal')).toBeNull();
    expect(screen.getByRole('link', { name: `${t.booking.whatsapp} ${t.booking.opensInNewTab}` }))
      .toHaveAttribute('href', 'https://wa.me/306955810051');
    expect(mocks.logger.error).toHaveBeenCalledWith('Public availability could not be read');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('ECONNREFUSED');
  });
});
