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

import AvailabilityPage, { dynamic, generateMetadata } from '@/app/[locale]/availability/page';
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
    rates: [{ start: TODAY, end: '2026-12-01' as IsoDate, nightlyPriceCents: 8000, minimumNights: 1 }],
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
  it('is rendered on every request', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('shows the calendar, the summary and the last update when the calendar is fresh', async () => {
    const t = getDictionary('en').availability;
    const { container } = await renderPage();

    expect(mocks.read).toHaveBeenCalledWith(NOW);
    expect(screen.getByRole('heading', { level: 1, name: t.title })).toBeInTheDocument();
    expect(container.querySelector('[data-day="2026-10-09"] button')).toHaveTextContent('€80');
    expect(screen.getByRole('region', { name: t.summary.title })).toBeInTheDocument();
    // 08:30 UTC is 11:30 in Athens.
    expect(screen.getByText('Availability last updated: 1 Oct 2026, 11:30')).toBeInTheDocument();
    expect(screen.queryByText(t.status.stale)).not.toBeInTheDocument();
    expect(screen.queryByText(t.status.notConfigured)).not.toBeInTheDocument();
    expect(container.querySelector('form')).toBeNull();
  });

  it('warns that booked nights are not shown when the calendar is stale', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValue(availability({ status: 'stale', nights: 'u'.repeat(365), lastSyncedAt: '2026-09-30T08:30:00.000Z' }));
    const { container } = await renderPage();

    expect(screen.getByText(t.status.stale).closest('.ui-callout')).toHaveClass('ui-callout--warning');
    expect(screen.getByText('Availability last updated: 30 Sept 2026, 11:30')).toBeInTheDocument();
    expect(container.querySelector('[data-day="2026-10-09"] button')).toHaveTextContent('€80');
  });

  it('replaces the calendar with an info note and the contact options when the calendar is not configured, even with prices', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValue(availability({ status: 'not_configured', nights: 'u'.repeat(365), lastSyncedAt: null }));
    const { container } = await renderPage();

    expect(screen.getByText(t.status.notConfigured).closest('.ui-callout')).toHaveClass('ui-callout--info');
    expect(screen.queryByText(/Availability last updated/)).not.toBeInTheDocument();
    expect(container.querySelector('.cal')).toBeNull();
    expect(container.textContent).not.toContain('€80');
    expect(screen.getByRole('link', { name: t.booking.call })).toHaveAttribute('href', 'tel:+306955810051');
    expect(await pageMarkup()).not.toContain('<noscript>');
  });

  it('replaces a stale calendar that has neither prices nor booked nights with an info note that promises no prices', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValue(availability({ status: 'stale', nights: 'u'.repeat(365), lastSyncedAt: '2026-09-30T08:30:00.000Z', rates: [] }));
    const { container } = await renderPage();

    expect(screen.getByText(t.status.unavailable).closest('.ui-callout')).toHaveClass('ui-callout--info');
    expect(screen.queryByText(t.status.stale)).not.toBeInTheDocument();
    expect(container.querySelector('.cal')).toBeNull();
    expect(screen.getByRole('link', { name: t.booking.call })).toHaveAttribute('href', 'tel:+306955810051');
    expect(await pageMarkup()).not.toContain('<noscript>');
  });

  it('lists the next 60 nights with prices for browsers without JavaScript', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValue(availability({ nights: `${'o'.repeat(9)}b${'o'.repeat(355)}` }));
    const html = await pageMarkup();

    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? '';
    expect(noscript).toContain(t.noJs.title);
    expect(noscript.match(/<li/g)).toHaveLength(60);
    expect(noscript).toContain('Thu 1 Oct 2026');
    expect(noscript).toContain('€80');
    expect(noscript).toMatch(/Sat 10 Oct 2026<\/span><span[^>]*>booked</);
    expect(noscript).toContain('Sun 29 Nov 2026');
    expect(noscript).not.toContain('Mon 30 Nov 2026');
    // The contact options are plain links, outside the script-only calendar.
    expect(html).toContain('href="tel:+306955810051"');
    expect(html).not.toContain('<form');
  });

  it('lists a free night without a rate as price on request for browsers without JavaScript', async () => {
    const t = getDictionary('en').availability;
    // The rate ends on 5 Oct: the nights from 5 Oct on have no price.
    mocks.read.mockResolvedValue(availability({ rates: [{ start: TODAY, end: '2026-10-05' as IsoDate, nightlyPriceCents: 8000, minimumNights: 1 }] }));
    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(await pageMarkup())?.[1] ?? '';

    expect(noscript).toMatch(/Sun 4 Oct 2026<\/span><span[^>]*>€80</);
    expect(t.day.priceOnRequest).toBe('price on request');
    expect(noscript).toMatch(/Mon 5 Oct 2026<\/span><span[^>]*>price on request</);
  });

  it('logs no details and still offers call and WhatsApp when the repository fails', async () => {
    const t = getDictionary('en').availability;
    const failure = new Error('connect ECONNREFUSED 10.0.0.5:5432 password=secret');
    mocks.read.mockRejectedValue(failure);
    const { container } = await renderPage();

    expect(screen.getByText(t.status.unavailable).closest('.ui-callout')).toHaveClass('ui-callout--info');
    expect(container.querySelector('.cal')).toBeNull();
    expect(screen.getByRole('link', { name: t.booking.call })).toHaveAttribute('href', 'tel:+306955810051');
    expect(screen.getByRole('link', { name: `${t.booking.whatsapp} ${t.booking.opensInNewTab}` }))
      .toHaveAttribute('href', 'https://wa.me/306955810051');
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledWith('Public availability could not be read');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('ECONNREFUSED');
  });

  it.each(['en', 'el'] as const)('renders the booking and legal sections in %s', async (locale) => {
    const t = getDictionary(locale).availability;
    await renderPage(locale);

    for (const title of [t.howToBookTitle, t.cancellationTitle, t.withdrawalTitle, t.climateFeeTitle, t.pricesTitle, t.contactTitle]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
    expect(screen.getByText(t.withdrawal)).toBeInTheDocument();
    for (const item of [...t.cancellation, ...t.prices]) expect(screen.getByText(item)).toBeInTheDocument();
    // The Airbnb step is shown only with a listing URL, which is not set yet.
    expect(screen.queryByText(t.howToBookAirbnb)).not.toBeInTheDocument();
    for (const item of t.howToBook) expect(screen.getByText(item)).toBeInTheDocument();
  });

  it('renders the climate fee rates from the fee schedule', async () => {
    await renderPage('en');
    const fee = screen.getByRole('region', { name: 'Climate resilience fee' });
    expect(within(fee).getByText('April–October: €8 per night')).toBeInTheDocument();
    expect(within(fee).getByText('November–March: €2 per night')).toBeInTheDocument();
  });

  it('renders the Greek climate fee rates with nominative month names', async () => {
    await renderPage('el');
    const fee = screen.getByRole('region', { name: 'Τέλος ανθεκτικότητας στην κλιματική κρίση' });
    expect(within(fee).getByText('Απρίλιος–Οκτώβριος: 8 € ανά διανυκτέρευση')).toBeInTheDocument();
    expect(within(fee).getByText('Νοέμβριος–Μάρτιος: 2 € ανά διανυκτέρευση')).toBeInTheDocument();
    expect(screen.getByText(/ν\. 2251\/1994 άρθ\. 3ιβ/)).toBeInTheDocument();
  });

  it('lists the host phone, e-mail and WhatsApp in the contact section', async () => {
    const t = getDictionary('en').availability;
    await renderPage('en');

    const section = screen.getByRole('region', { name: t.contactTitle });
    expect(within(section).getByRole('link', { name: '+30 695 581 0051' })).toHaveAttribute('href', 'tel:+306955810051');
    expect(within(section).getByRole('link', { name: 'dolcefarnienteapartments@gmail.com' }))
      .toHaveAttribute('href', 'mailto:dolcefarnienteapartments@gmail.com');
    expect(within(section).getByRole('link', { name: `${t.whatsappLabel} ${t.booking.opensInNewTab}` }))
      .toHaveAttribute('href', 'https://wa.me/306955810051');
  });

  it('builds localized metadata for /availability', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'el' }) });

    // The root layout's title template appends the brand.
    expect(metadata.title).toBe(getDictionary('el').availability.title);
    expect(metadata.alternates).toEqual({
      canonical: '/el/availability',
      languages: { en: '/en/availability', el: '/el/availability', 'x-default': '/en/availability' },
    });
  });
});
