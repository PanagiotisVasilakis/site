// @vitest-environment jsdom

import type React from 'react';
import { act, render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const contact = vi.hoisted(() => ({ bookingUrl: '' }));
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/prisma-repositories/availabilityRepository', () => ({ readPublicAvailability: mocks.read }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('@/data/contact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/contact')>()),
  get BOOKING_COM_LISTING_URL() {
    return contact.bookingUrl;
  },
}));

import ApartmentPage from '@/app/[locale]/apartment/page';
import FactStrip from '@/components/home/FactStrip';
import { HOST_CONTACT } from '@/data/contact';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

import { installDialogMethods, removeDialogMethods, stubIntersectionObserver } from '../support/dom';

const TODAY = '2026-10-18' as IsoDate;
const ROOM_IDS = ['living', 'kitchen', 'bedroom-1', 'bedroom-2', 'bathroom', 'balcony', 'parking', 'details'];
const EXCLUDED = [
  'living_1', 'living_2', 'living_3', 'living_1_booking', 'bedroom_4',
  'bedroom_2_2', 'bedroom_2_4', 'bathroom_5', 'bathroom_1', 'bathroom_8', 'bathroom_2',
];

function availability(overrides: Partial<PublicAvailability> = {}): PublicAvailability {
  return {
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: new Date(Date.now() - 3_600_000).toISOString(),
    nights: `obb${'o'.repeat(362)}`,
    rates: [],
    ...overrides,
  };
}

async function renderPage(locale: 'en' | 'el') {
  return render(await ApartmentPage({ params: Promise.resolve({ locale }) }));
}

beforeEach(() => {
  contact.bookingUrl = '';
  mocks.read.mockResolvedValue(availability());
});

describe('apartment page (identity §9.2)', () => {
  it('links room chips to sections, enforces photo exclusions/layout, and matches FactStrip + host identity', async () => {
    const { container, unmount } = await renderPage('en');

    const nav = container.querySelector('nav.apt-chips') as HTMLElement;
    expect(within(nav).getAllByRole('link').map((l) => l.getAttribute('href'))).toEqual(ROOM_IDS.map((id) => `#${id}`));
    for (const id of ROOM_IDS) {
      expect(within(container.querySelector(`section#${id}`) as HTMLElement).getByRole('heading', { level: 2 })).toBeInTheDocument();
    }

    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');
    expect(sources).toHaveLength(42);
    for (const name of EXCLUDED) expect(sources.filter((src) => src.includes(`/${name}.`)), name).toEqual([]);
    const lead = container.querySelector('.apt-lead img');
    expect(lead?.getAttribute('src')).toBe('/house/living/living_8.jpeg');
    expect(lead?.getAttribute('loading')).toBe('eager');
    expect(lead?.getAttribute('fetchpriority')).toBe('high');

    const layout = (id: string) => (container.querySelector(`section#${id} ul.apt-masonry`) as HTMLElement).className;
    expect(layout('details')).toBe('apt-masonry apt-masonry--grid');
    expect(layout('bedroom-2')).toBe('apt-masonry apt-masonry--grid');
    expect(layout('living')).toBe('apt-masonry');
    expect(layout('parking')).toBe('apt-masonry apt-masonry--single');

    const head = container.querySelector('.apt-head') as HTMLElement;
    expect(within(head).getByText(HOST_CONTACT.legalName)).toBeInTheDocument();
    expect(within(head).queryByRole('link')).toBeNull();
    const apartmentFacts = within(within(head).getByRole('list', { name: 'Key facts' })).getAllByRole('listitem').map((i) => i.textContent);
    unmount();

    const homeFacts = within(render(<FactStrip locale="en" />).container.querySelector('ul') as HTMLElement)
      .getAllByRole('listitem')
      .map((i) => i.textContent);
    expect(apartmentFacts).toEqual(homeFacts);
  });

  it('gates the Booking.com secondary CTA to HTTPS booking.com URLs and links to availability and contact', async () => {
    for (const url of ['', 'https://example.com/Share-AiCapK', 'http://www.booking.com/Share-AiCapK']) {
      contact.bookingUrl = url;
      const { container, unmount } = await renderPage('en');
      expect(container.querySelector('a[href*="booking.com"]'), url).toBeNull();
      unmount();
    }

    contact.bookingUrl = 'https://www.booking.com/Share-AiCapK';
    const { container } = await renderPage('en');
    const cta = container.querySelector('#book') as HTMLElement;
    expect(within(cta).getByRole('link', { name: 'See free dates' })).toHaveAttribute('href', '/en/availability');
    expect([...container.querySelectorAll('a')].filter((a) => a.getAttribute('href')?.endsWith('#contact')).map((a) => a.getAttribute('href'))).toEqual(['/en#contact']);
    const bookingLink = within(cta).getByRole('link', { name: /Book on Booking\.com/ });
    expect(bookingLink).toHaveAttribute('href', 'https://www.booking.com/Share-AiCapK');
    expect(bookingLink).toHaveAttribute('target', '_blank');
    expect(bookingLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

describe('apartment page gallery and chips interaction', () => {
  beforeEach(() => {
    installDialogMethods();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    removeDialogMethods();
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  });

  it('opens the lightbox at the clicked tile or lead photo, and syncs room chips on click and scroll', async () => {
    let notify: IntersectionObserverCallback = () => {};
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) { if (target.matches('section.apt-room')) notify = this.callback; }
      disconnect() {}
    });

    const user = userEvent.setup();
    const { container } = await renderPage('en');
    const dialog = document.querySelector('dialog.lightbox') as HTMLDialogElement;

    await user.click(container.querySelector('.apt-masonry img[src="/house/kitchen/kitchen_2.jpeg"]')?.closest('button') as HTMLElement);
    expect(dialog).toHaveAttribute('open');
    expect(dialog.querySelector('.lightbox__count')).toHaveTextContent('9 / 42');
    expect(dialog.querySelector('.lightbox__room')).toHaveTextContent('Kitchen');
    await user.click(within(dialog).getByRole('button', { name: 'Close photo viewer' }));
    expect(dialog).not.toHaveAttribute('open');

    await user.click(container.querySelector('.apt-lead__open') as HTMLElement);
    expect(dialog.querySelector('.lightbox__count')).toHaveTextContent('1 / 42');

    const nav = container.querySelector('nav.apt-chips') as HTMLElement;
    const current = () => [...nav.querySelectorAll('[aria-current="true"]')].map((chip) => chip.getAttribute('href'));
    expect(current()).toEqual(['#living']);
    await user.click(within(nav).getByRole('link', { name: 'Kitchen' }));
    expect(current()).toEqual(['#kitchen']);

    const entry = (id: string, isIntersecting: boolean) =>
      ({ isIntersecting, target: container.querySelector(`section#${id}`) }) as unknown as IntersectionObserverEntry;
    act(() => notify([entry('bedroom-1', true)], {} as IntersectionObserver));
    expect(current()).toEqual(['#bedroom-1']);

    vi.spyOn(container.querySelector('section#living') as HTMLElement, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
    act(() => notify([entry('bedroom-1', false)], {} as IntersectionObserver));
    expect(current()).toEqual(['#living']);
  });
});

describe('BookBar on the apartment page', () => {
  it('omits BookBar without leaking DB details when availability read fails, and toggles visibility via observer', async () => {
    mocks.read.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const failed = await renderPage('en');
    expect(failed.container.querySelector('.bookbar')).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledWith('Apartment availability could not be read');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('ECONNREFUSED');
    failed.unmount();

    const io = stubIntersectionObserver();
    const { container } = await renderPage('en');
    const bar = container.querySelector('.bookbar');
    const shown = () => Boolean(bar?.classList.contains('is-shown')) && !bar?.hasAttribute('inert');
    const head = container.querySelector('.apt-head') as Element;
    const ctas = within(container.querySelector('#book') as HTMLElement).getByRole('link', { name: 'See free dates' }).closest('[data-cta-watch]') as Element;

    expect(shown()).toBe(false);
    io.report(new Map([[head, false], [ctas, false]]));
    expect(shown()).toBe(true);
    io.report(new Map([[ctas, true]]));
    expect(shown()).toBe(false);
    io.report(new Map([[ctas, false], [head, true]]));
    expect(shown()).toBe(false);
  });
});
