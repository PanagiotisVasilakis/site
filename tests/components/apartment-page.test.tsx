// @vitest-environment jsdom

import type React from 'react';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const contact = vi.hoisted(() => ({ airbnbUrl: '' }));
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/lib/prisma-repositories/availabilityRepository', () => ({ readPublicAvailability: mocks.read }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));

// A plain anchor: the app router is not mounted in jsdom, and the test only needs the link's target.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('@/data/contact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/contact')>()),
  get AIRBNB_LISTING_URL() {
    return contact.airbnbUrl;
  },
}));

import ApartmentPage from '@/app/[locale]/apartment/page';
import FactStrip from '@/components/home/FactStrip';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-18' as IsoDate;

function availability(overrides: Partial<PublicAvailability> = {}): PublicAvailability {
  return {
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: new Date(Date.now() - 3_600_000).toISOString(),
    nights: `obb${'o'.repeat(362)}`,
    rates: [{ start: TODAY, end: '2027-01-01' as IsoDate, nightlyPriceCents: 8500, minimumNights: 2 }],
    ...overrides,
  };
}

const ROOM_IDS = ['living', 'kitchen', 'bedroom-1', 'bedroom-2', 'bathroom', 'balcony'];

// identity §7.3: never shown in the marketing views (duplicates, soft, branded, stay-hub only).
const EXCLUDED = [
  'living_3', 'living_1_booking', 'bedroom_4', 'bedroom_2_2', 'bedroom_2_4',
  'bathroom_5', 'bathroom_1', 'bathroom_8', 'bathroom_2',
];

async function renderPage(locale: 'en' | 'el') {
  return render(await ApartmentPage({ params: Promise.resolve({ locale }) }));
}

beforeEach(() => {
  contact.airbnbUrl = '';
  mocks.read.mockResolvedValue(availability());
});

describe('apartment page (identity §9.2)', () => {
  it.each(['en', 'el'] as const)('links each room chip (%s) to the room section with the same id', async (locale) => {
    const { container } = await renderPage(locale);

    const nav = container.querySelector('nav.apt-chips');
    expect(nav).not.toBeNull();
    const hrefs = within(nav as HTMLElement).getAllByRole('link').map((link) => link.getAttribute('href'));
    expect(hrefs).toEqual(ROOM_IDS.map((id) => `#${id}`));
    for (const id of ROOM_IDS) {
      const section = container.querySelector(`section#${id}`);
      expect(section, id).not.toBeNull();
      expect(within(section as HTMLElement).getByRole('heading', { level: 2 })).toBeInTheDocument();
    }
  });

  it('shows the 25 marketing photos in the §7.3 order and never an excluded one', async () => {
    const { container } = await renderPage('en');

    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '');
    for (const name of EXCLUDED) {
      expect(sources.filter((src) => src.includes(`/${name}.`)), name).toEqual([]);
    }
    // The lead photo (living_8, LCP) and the 24 room tiles.
    const lead = container.querySelector('.apt-lead img');
    expect(lead?.getAttribute('src')).toBe('/house/living/living_8.jpeg');
    expect(lead?.getAttribute('loading')).toBe('eager');
    expect(lead?.getAttribute('fetchpriority')).toBe('high');
    const tiles = [...container.querySelectorAll('.apt-masonry img')].map((img) => img.getAttribute('src'));
    expect(tiles).toEqual([
      '/house/living/living_6.jpeg', '/house/living/living_2.jpeg', '/house/living/living_7.jpeg',
      '/house/living/living_1.jpeg', '/house/living/living_4.jpeg', '/house/living/living_5.jpeg',
      '/house/kitchen/kitchen_2.jpeg', '/house/kitchen/kitchen_6.jpeg', '/house/kitchen/kitchen_3.jpeg',
      '/house/kitchen/kitchen_4.jpeg', '/house/kitchen/kitchen_5.jpeg', '/house/kitchen/kitchen_1.jpeg',
      '/house/bedroom/bedroom_1.jpeg', '/house/bedroom/bedroom_2.jpeg', '/house/bedroom/bedroom_3.jpeg',
      '/house/bedroom_2/bedroom_2_5.jpeg', '/house/bedroom_2/bedroom_2_6.jpeg', '/house/bedroom_2/bedroom_2_3.jpeg',
      '/house/bedroom_2/bedroom_2_1.jpeg',
      '/house/bathroom/bathroom_6.jpeg', '/house/bathroom/bathroom_7.jpeg', '/house/bathroom/bathroom_3.jpeg',
      '/house/bathroom/bathroom_4.jpeg',
      '/house/balcony/balcony_1.jpeg',
    ]);
    for (const img of container.querySelectorAll('.apt-masonry img')) {
      expect(img.getAttribute('alt'), img.getAttribute('src') ?? '').not.toBe('');
      expect(img.getAttribute('loading')).toBe('lazy');
    }
  });

  it.each([
    ['en', 'See free dates', '/en/availability', '/en#contact'],
    ['el', 'Δείτε ελεύθερες ημερομηνίες', '/el/availability', '/el#contact'],
  ] as const)('links (%s) to the free dates and to the home contact section', async (locale, seeDates, availability, contactHref) => {
    const { container } = await renderPage(locale);

    const cta = container.querySelector('#book') as HTMLElement;
    expect(within(cta).getByRole('link', { name: seeDates })).toHaveAttribute('href', availability);
    const contactLinks = [...container.querySelectorAll('a')].filter((a) => a.getAttribute('href')?.endsWith('#contact'));
    expect(contactLinks.map((a) => a.getAttribute('href'))).toEqual([contactHref]);
    // The old page sent "Contact" to the phones directory (plan V6).
    expect(container.querySelector(`a[href="/${locale}/phones"]`)).toBeNull();
  });

  it('hides "Book on Airbnb" without a valid listing URL (identity §1.4)', async () => {
    for (const url of ['', 'https://example.com/rooms/1', 'http://www.airbnb.com/rooms/1']) {
      contact.airbnbUrl = url;
      const { container, unmount } = await renderPage('en');
      expect(screen.queryByRole('link', { name: /Airbnb/ }), url).toBeNull();
      expect(container.querySelector('a[href*="airbnb"]'), url).toBeNull();
      unmount();
    }
  });

  it('shows "Book on Airbnb" as the secondary CTA with a valid listing URL', async () => {
    contact.airbnbUrl = 'https://www.airbnb.com/rooms/123456';
    const { container } = await renderPage('en');

    const cta = container.querySelector('#book') as HTMLElement;
    const airbnb = within(cta).getByRole('link', { name: /Book on Airbnb/ });
    expect(airbnb).toHaveAttribute('href', 'https://www.airbnb.com/rooms/123456');
    expect(airbnb).toHaveAttribute('target', '_blank');
    expect(airbnb).toHaveAttribute('rel', 'noopener noreferrer');
    expect(airbnb.className).toContain('ui-btn--secondary');
  });

  // Owner decision O45 (2026-10-04): the sea view is confirmed by the owner, so the amenity lists it
  // (this lifts identity §1.4 rule 1 for the apartment data).
  it.each([
    ['en', 'Sea, mountain, and city views'],
    ['el', 'Θέα σε θάλασσα, βουνό και πόλη'],
  ] as const)('lists the owner-confirmed view amenity (%s, O45)', async (locale, amenity) => {
    const { container } = await renderPage(locale);
    expect(container.textContent).toContain(amenity);
  });

  it.each(['en', 'el'] as const)('shows the six home facts inline in the page head (%s), without a link', async (locale) => {
    const { container, unmount } = await renderPage(locale);
    const head = container.querySelector('.apt-head') as HTMLElement;
    const list = within(head).getByRole('list', { name: locale === 'en' ? 'Key facts' : 'Βασικά στοιχεία' });
    const apartmentFacts = within(list).getAllByRole('listitem').map((item) => item.textContent);
    expect(within(head).queryByRole('link')).toBeNull();
    unmount();

    const home = render(<FactStrip locale={locale} />);
    const homeFacts = within(home.container.querySelector('ul') as HTMLElement).getAllByRole('listitem').map((item) => item.textContent);

    expect(apartmentFacts).toHaveLength(6);
    expect(apartmentFacts).toEqual(homeFacts);
  });

  it('has one h1 and amenity groups built from the apartment data', async () => {
    const { container } = await renderPage('en');

    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['The apartment']);
    const amenities = container.querySelector('#amenities') as HTMLElement;
    expect(within(amenities).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Essentials', 'Comfort', 'Kitchen', 'Bathroom', 'Outdoor and views', 'Safety',
    ]);
    expect(within(amenities).getByText('Free Wi-Fi throughout the property')).toBeInTheDocument();
  });
});

describe('apartment page gallery wiring (identity §9.2, §8 GalleryLightbox)', () => {
  // jsdom has no HTMLDialogElement.showModal/close and no Element.scrollTo (as in gallery-lightbox.test.tsx).
  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', ''); }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      }),
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
  });

  function viewer() {
    // By selector: a closed <dialog> is not exposed with its role.
    const dialog = document.querySelector('dialog.lightbox') as HTMLDialogElement;
    expect(dialog).toHaveAttribute('aria-label', 'Photo viewer');
    return {
      dialog,
      counter: dialog.querySelector('.lightbox__count'),
      room: dialog.querySelector('.lightbox__room'),
    };
  }

  it('opens the viewer at the photo that was clicked, lead photo included', async () => {
    const user = userEvent.setup();
    const { container } = await renderPage('en');
    const tile = (src: string) => container.querySelector(`.apt-masonry img[src="${src}"]`)?.closest('button') as HTMLElement;

    await user.click(tile('/house/kitchen/kitchen_2.jpeg'));
    expect(viewer().dialog).toHaveAttribute('open');
    expect(viewer().counter).toHaveTextContent('8 / 25');
    expect(viewer().room).toHaveTextContent('Kitchen');
    await user.click(within(viewer().dialog).getByRole('button', { name: 'Close photo viewer' }));
    expect(viewer().dialog).not.toHaveAttribute('open');

    await user.click(tile('/house/balcony/balcony_1.jpeg'));
    expect(viewer().counter).toHaveTextContent('25 / 25');
    expect(viewer().room).toHaveTextContent('Balcony');
    await user.click(within(viewer().dialog).getByRole('button', { name: 'Close photo viewer' }));

    await user.click(container.querySelector('.apt-lead__open') as HTMLElement);
    expect(viewer().counter).toHaveTextContent('1 / 25');
    expect(viewer().room).toHaveTextContent('Living room');
  });

  it('marks the first room chip as current and moves it to a clicked chip', async () => {
    const user = userEvent.setup();
    const { container } = await renderPage('en');
    const nav = container.querySelector('nav.apt-chips') as HTMLElement;
    const current = () => [...nav.querySelectorAll('[aria-current="true"]')].map((chip) => chip.getAttribute('href'));

    expect(current()).toEqual(['#living']);
    await user.click(within(nav).getByRole('link', { name: 'Kitchen' }));
    expect(current()).toEqual(['#kitchen']);
  });

  it('follows the scroll with the room chips and returns to the first room above the rooms', async () => {
    // The room sections' observer only (the BookBar has its own).
    let notify: IntersectionObserverCallback = () => {};
    vi.stubGlobal('IntersectionObserver', class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe(target: Element) { if (target.matches('section.apt-room')) notify = this.callback; }
      disconnect() {}
    });
    const { container } = await renderPage('en');
    const nav = container.querySelector('nav.apt-chips') as HTMLElement;
    const current = () => [...nav.querySelectorAll('[aria-current="true"]')].map((chip) => chip.getAttribute('href'));
    const entry = (id: string, isIntersecting: boolean) =>
      ({ isIntersecting, target: container.querySelector(`section#${id}`) }) as unknown as IntersectionObserverEntry;

    act(() => notify([entry('bedroom-1', true)], {} as IntersectionObserver));
    expect(current()).toEqual(['#bedroom-1']);

    // Scrolled back up: no room in the band and the first room starts below the top of the viewport.
    const living = container.querySelector('section#living') as HTMLElement;
    vi.spyOn(living, 'getBoundingClientRect').mockReturnValue({ top: 500 } as DOMRect);
    act(() => notify([entry('bedroom-1', false)], {} as IntersectionObserver));
    expect(current()).toEqual(['#living']);
  });
});

type ObserverCallback = (entries: Array<Pick<IntersectionObserverEntry, 'target' | 'isIntersecting'>>) => void;

/** A controllable IntersectionObserver: each observer hears only about the elements it observes. */
function stubObserver() {
  const observers: Array<{ callback: ObserverCallback; targets: Element[] }> = [];
  vi.stubGlobal('IntersectionObserver', class {
    private readonly entry: { callback: ObserverCallback; targets: Element[] };
    constructor(callback: ObserverCallback) {
      this.entry = { callback, targets: [] };
      observers.push(this.entry);
    }
    observe(target: Element) { this.entry.targets.push(target); }
    unobserve() {}
    disconnect() { this.entry.targets = []; }
  });
  return {
    report(inView: Map<Element, boolean>) {
      act(() => {
        for (const { callback, targets } of observers) {
          const entries = targets.filter((target) => inView.has(target)).map((target) => ({ target, isIntersecting: inView.get(target) ?? false }));
          if (entries.length > 0) callback(entries);
        }
      });
    },
  };
}

describe('BookBar on the apartment page (identity §8, §9.2)', () => {
  it.each([
    ['en', /^from €85 \/ night/, 'Free tonight', '/en/availability', 'Check dates'],
    ['el', /^από .*85.* \/ νύχτα/, 'Ελεύθερο απόψε', '/el/availability', 'Δείτε ημερομηνίες'],
  ] as const)('carries the lowest bookable price and tonight (%s), from the same source as home', async (locale, price, note, href, label) => {
    const { container } = await renderPage(locale);

    const bar = container.querySelector('.bookbar') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.textContent).toMatch(price);
    expect(bar).toHaveTextContent(note);
    expect(within(bar).getByRole('link', { hidden: true })).toHaveAttribute('href', href);
    expect(within(bar).getByRole('link', { hidden: true })).toHaveTextContent(label);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  });

  it('is not rendered without price data', async () => {
    mocks.read.mockResolvedValue(availability({ rates: [] }));

    const { container } = await renderPage('en');

    expect(container.querySelector('.bookbar')).toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('is not rendered when the availability read fails, and logs no details', async () => {
    mocks.read.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const { container } = await renderPage('en');

    expect(container.querySelector('.bookbar')).toBeNull();
    expect(container.querySelector('#book')).not.toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledTimes(1);
    expect(mocks.logger.error).toHaveBeenCalledWith('Apartment price could not be read');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('ECONNREFUSED');
  });

  it('stays hidden until the page head leaves the view, and while the #book CTAs are visible', async () => {
    const io = stubObserver();
    const { container } = await renderPage('en');
    const bar = container.querySelector('.bookbar');
    const shown = () => Boolean(bar?.classList.contains('is-shown')) && !bar?.hasAttribute('inert');
    const head = container.querySelector('.apt-head') as Element;
    const book = container.querySelector('#book') as HTMLElement;
    const ctas = within(book).getByRole('link', { name: 'See free dates' }).closest('[data-cta-watch]') as Element;
    expect(ctas).not.toBeNull();

    expect(shown()).toBe(false);
    io.report(new Map([[head, true], [ctas, false]]));
    expect(shown()).toBe(false);

    io.report(new Map([[head, false]]));
    expect(shown()).toBe(true);

    io.report(new Map([[ctas, true]]));
    expect(shown()).toBe(false);

    io.report(new Map([[ctas, false]]));
    expect(shown()).toBe(true);

    io.report(new Map([[head, true]]));
    expect(shown()).toBe(false);
  });
});
