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
  it('is rendered on every request', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('shows the calendar, the summary and the last update when the calendar is fresh', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValue(availability({ rates: [{ start: TODAY, end: addDays(TODAY, 365), minimumNights: 1 }] }));
    const { container } = await renderPage();

    expect(mocks.read).toHaveBeenCalledWith(NOW);
    expect(screen.getByRole('heading', { level: 1, name: t.title })).toBeInTheDocument();
    expect(container.querySelector('[data-day="2026-10-09"] button')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: t.summary.title })).toBeInTheDocument();
    // 08:30 UTC is 11:30 in Athens.
    expect(screen.getByText('Availability last updated: 1 Oct 2026, 11:30')).toBeInTheDocument();
    expect(screen.queryByText(t.status.notConfigured)).not.toBeInTheDocument();
    expect(container.querySelector('form')).toBeNull();
    expect(container.textContent).not.toContain('€');
  });

  it('replaces the calendar with an info note and the contact options when the calendar is not configured', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValue(availability({ status: 'not_configured', nights: 'u'.repeat(365), lastSyncedAt: null, rates: [{ start: TODAY, end: addDays(TODAY, 365), minimumNights: 1 }] }));
    const { container } = await renderPage();

    expect(screen.getByText(t.status.notConfigured).closest('.ui-callout')).toHaveClass('ui-callout--info');
    expect(screen.queryByText(/Availability last updated/)).not.toBeInTheDocument();
    expect(container.querySelector('.cal')).toBeNull();
    // Without a calendar, the lead and the how-to-book steps that refer to it are left out; the others stay.
    for (const text of [t.intro, t.howToBook[0], t.howToBookBookingCom]) expect(screen.queryByText(text)).not.toBeInTheDocument();
    for (const item of t.howToBook.slice(1)) expect(screen.getByText(item)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.booking.call })).toHaveAttribute('href', 'tel:+306955810051');
    expect(await pageMarkup()).not.toContain('<noscript>');
  });

  it('replaces a stale calendar with an info note and the contact options', async () => {
    const t = getDictionary('en').availability;
    // Known nights on purpose: a stale calendar is hidden by its status alone.
    mocks.read.mockResolvedValue(availability({ status: 'stale', nights: 'o'.repeat(365), lastSyncedAt: '2026-09-30T08:30:00.000Z', rates: [{ start: TODAY, end: addDays(TODAY, 365), minimumNights: 1 }] }));
    const { container } = await renderPage();

    expect(screen.getByText(t.status.unavailable).closest('.ui-callout')).toHaveClass('ui-callout--info');
    expect(screen.getByText('Availability last updated: 30 Sept 2026, 11:30')).toBeInTheDocument();
    expect(container.querySelector('.cal')).toBeNull();
    for (const text of [t.intro, t.howToBook[0], t.howToBookBookingCom]) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.booking.call })).toHaveAttribute('href', 'tel:+306955810051');
    expect(await pageMarkup()).not.toContain('<noscript>');
  });

  it('lists the next 60 nights as free or booked for browsers without JavaScript', async () => {
    const t = getDictionary('en').availability;
    mocks.read.mockResolvedValue(availability({ nights: `${'o'.repeat(9)}b${'o'.repeat(355)}` }));
    const html = await pageMarkup();

    const noscript = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? '';
    expect(noscript).toContain(t.noJs.title);
    expect(noscript.match(/<li/g)).toHaveLength(60);
    expect(noscript).toContain('Thu 1 Oct 2026');
    expect(noscript).toContain(`>${t.legend.free}<`);
    expect(noscript).not.toContain('€');
    expect(noscript).toMatch(/Sat 10 Oct 2026<\/span><span[^>]*>booked</);
    expect(noscript).toContain('Sun 29 Nov 2026');
    expect(noscript).not.toContain('Mon 30 Nov 2026');
    // The contact options are plain links, outside the script-only calendar.
    expect(html).toContain('href="tel:+306955810051"');
    expect(html).not.toContain('<form');
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

  it.each(['en', 'el'] as const)('renders the how-to-book and contact sections in %s', async (locale) => {
    const t = getDictionary(locale).availability;
    await renderPage(locale);

    for (const title of [t.howToBookTitle, t.contactTitle]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    }
    for (const item of t.howToBook) expect(screen.getByText(item)).toBeInTheDocument();
    // The shipped Booking.com link is valid: its step and its card link are shown.
    expect(screen.getByText(t.howToBookBookingCom)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: `${t.booking.bookingCom} ${t.booking.opensInNewTab}` }))
      .toHaveAttribute('href', BOOKING_COM_LISTING_URL);
    // Owner decision of 2026-10-15: no cancellation policy and no price on the page.
    expect(document.body.textContent).not.toMatch(/€|cancel|ακύρωσ/i);
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

  it('shows the host identity block in the page head (en)', async () => {
    const labels = getDictionary('en').shell.identity;
    const { container } = await renderPage('en');
    const head = container.querySelector('.avail-page__head') as HTMLElement;
    const identity = head.querySelector('.host-identity') as HTMLElement;
    expect(identity).not.toBeNull();
    for (const text of [labels.registryLabel, labels.legalNameLabel, HOST_CONTACT.registrationNumber, HOST_CONTACT.legalName, HOST_CONTACT.address]) {
      expect(within(identity).getByText(text)).toBeInTheDocument();
    }
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
