// @vitest-environment jsdom

import type React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/prisma-repositories/availabilityRepository', () => ({ readPublicAvailability: mocks.read }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));
// A plain anchor: the app router is not mounted in jsdom, and the test only needs the link's target.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));

import Home from '@/app/[locale]/page';
import FactStrip from '@/components/home/FactStrip';
import Highlights from '@/components/home/Highlights';
import KineticBand from '@/components/home/KineticBand';
import BalconyWindow from '@/components/home/BalconyWindow';
import RoomsShowcase from '@/components/home/RoomsShowcase';
import { homeRoomsFrom } from '@/components/home/homeRooms';
import { homeSeasonsOn } from '@/components/home/homeSeason';
import { APARTMENT_PHOTOS } from '@/data/apartmentPhotos';
import { CLIMATE_FEE_SCHEDULE } from '@/data/stayPolicy';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';

const TODAY = '2026-10-01' as IsoDate;

beforeEach(() => {
  mocks.read.mockResolvedValue({
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: '2026-10-01T08:30:00.000Z',
    nights: 'o'.repeat(365),
    rates: [{ start: TODAY, end: '2026-12-01' as IsoDate, nightlyPriceCents: 8500, minimumNights: 1 }],
  });
});

describe('home page sections (identity §9.1 items 2-6)', () => {
  it('places the fact strip, kinetic band, intro, balcony and rooms after the hero, in that order', async () => {
    const { container } = render(await Home({ params: Promise.resolve({ locale: 'en' }) }));

    const order = ['[data-hero]', '.facts', '.kinetic', '#intro', '#balcony', '#rooms'].map((selector) => {
      const element = container.querySelector(selector);
      expect(element, selector).not.toBeNull();
      return element as Element;
    });
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('has no link to the check-in page, which 404s while check-in is disabled (R-305)', async () => {
    const { container } = render(await Home({ params: Promise.resolve({ locale: 'en' }) }));

    const hrefs = Array.from(container.querySelectorAll('a[href]'), (link) => link.getAttribute('href'));
    expect(hrefs.some((href) => href?.includes('/check-in'))).toBe(false);
  });
});

describe('FactStrip (identity §8)', () => {
  it('shows the six facts and a link to the free dates, with no price', () => {
    const { container } = render(<FactStrip locale="en" />);

    const strip = screen.getByRole('region', { name: 'Key facts' });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(6);
    expect(strip).toHaveTextContent('90m²floor area');
    expect(strip).toHaveTextContent('2nd');
    expect(screen.getByRole('link', { name: 'See free dates' })).toHaveAttribute('href', '/en/availability');
    expect(container.textContent).not.toMatch(/€|night/);
  });

  it('is localized in Greek', () => {
    render(<FactStrip locale="el" />);

    expect(screen.getByRole('region', { name: 'Βασικά στοιχεία' })).toHaveTextContent('2ος');
    expect(screen.getByRole('link', { name: 'Δείτε ελεύθερες ημερομηνίες' })).toHaveAttribute('href', '/el/availability');
  });

  // The Greek inline variant is covered through the real page in apartment-page.test.tsx.
  it.each(['en'] as const)('has an inline variant (%s, apartment page head) with the same six facts, no link and no overlap card', (locale) => {
    const strip = render(<FactStrip locale={locale} />);
    const items = (root: HTMLElement) => within(root).getAllByRole('listitem').map((item) => item.textContent);
    const stripFacts = items(strip.container);
    strip.unmount();

    const { container } = render(<FactStrip locale={locale} inline />);

    const list = container.firstElementChild as HTMLElement;
    expect(list.tagName).toBe('UL');
    expect(list).toHaveAccessibleName(locale === 'en' ? 'Key facts' : 'Βασικά στοιχεία');
    expect(stripFacts).toHaveLength(6);
    expect(items(container)).toEqual(stripFacts);
    expect(container.querySelector('a, [data-cta-watch], [data-reveal], .facts')).toBeNull();
  });

  describe('number counters (M34, R3-V14)', () => {
    let observed: IntersectionObserverCallback[] = [];
    let frames: FrameRequestCallback[] = [];

    beforeEach(() => {
      observed = [];
      frames = [];
      vi.stubGlobal('IntersectionObserver', class {
        constructor(callback: IntersectionObserverCallback) { observed.push(callback); }
        observe() {}
        disconnect() {}
      });
      vi.stubGlobal('requestAnimationFrame', (frame: FrameRequestCallback) => frames.push(frame));
      vi.stubGlobal('cancelAnimationFrame', () => undefined);
    });

    afterEach(() => document.documentElement.removeAttribute('data-motion'));

    const numbers = (container: HTMLElement) => Array.from(container.querySelectorAll('.fact__num'), (n) => n.firstChild?.textContent);
    const frameAt = (time: number) => act(() => {
      const pending = frames;
      frames = [];
      pending.forEach((frame) => frame(time));
    });

    it('keeps the final numbers in the server markup', () => {
      const html = renderToString(<FactStrip locale="en" />);
      expect(html).toContain('class="fact__num">90<small');
      expect(html).toContain('class="fact__num">2nd</span>');
    });

    it('counts up once in view under full motion and ends on the server text', () => {
      document.documentElement.setAttribute('data-motion', 'full');
      const { container } = render(<FactStrip locale="en" />);
      expect(observed).toHaveLength(1);
      act(() => observed[0]([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
      frameAt(1000);
      // An ordinal stays as rendered: its suffix belongs to the final digit.
      expect(numbers(container)).toEqual(['0', '0', '0', '0', '2nd', 'P']);
      frameAt(1000 + 850);
      expect(numbers(container)).toEqual(['90', '2', '1', '4', '2nd', 'P']);
      expect(frames).toHaveLength(0);
    });

    it('does not count without full motion', () => {
      document.documentElement.setAttribute('data-motion', 'reduce');
      const { container } = render(<FactStrip locale="en" />);
      expect(observed).toHaveLength(0);
      expect(numbers(container)).toEqual(['90', '2', '1', '4', '2nd', 'P']);
    });
  });
});

describe('KineticBand (identity §8, M7)', () => {
  it('is decorative: hidden from assistive technology, one row per language, SVG star separators', () => {
    const { container } = render(<KineticBand />);

    const band = container.querySelector('.kinetic');
    expect(band).toHaveAttribute('aria-hidden', 'true');
    const rows = Array.from(container.querySelectorAll('.kinetic__row'));
    expect(rows.map((row) => row.getAttribute('lang'))).toEqual(['en', 'el']);
    expect(rows[0]).toHaveTextContent('Taygetos');
    expect(rows[1]).toHaveTextContent('Ταΰγετος');
    expect(container.querySelectorAll('.kinetic__row svg').length).toBeGreaterThan(0);
    expect(container.textContent).not.toContain('✦');
  });
});

describe('Highlights + SeasonSwitch (identity §8, graft 10)', () => {
  const pressed = () => screen.getAllByRole('button').find((button) => button.getAttribute('aria-pressed') === 'true');

  it.each([
    // Athens is UTC+2 in winter and UTC+3 in summer time.
    ['2026-10-31T21:59:00Z', 'Summer (Apr–Oct)'],
    ['2026-10-31T22:00:00Z', 'Winter (Nov–Mar)'],
    ['2027-03-31T20:59:00Z', 'Winter (Nov–Mar)'],
    ['2027-03-31T21:00:00Z', 'Summer (Apr–Oct)'],
  ])('defaults to the season of the property date at %s', (instant, season) => {
    render(<Highlights locale="en" now={new Date(instant)} />);

    expect(pressed()).toHaveTextContent(season);
  });

  it('links each season to the availability page at its first month from today', () => {
    expect(homeSeasonsOn('2026-10-31' as IsoDate, CLIMATE_FEE_SCHEDULE)).toEqual({
      current: 'summer',
      firstMonth: { summer: '2026-10', winter: '2026-11' },
    });
    expect(homeSeasonsOn('2026-11-01' as IsoDate, CLIMATE_FEE_SCHEDULE)).toEqual({
      current: 'winter',
      firstMonth: { summer: '2027-04', winter: '2026-11' },
    });
  });

  it('has no seasons without a climate fee rule in force', () => {
    expect(homeSeasonsOn('2026-10-31' as IsoDate, [])).toBeNull();
    expect(homeSeasonsOn('2024-12-31' as IsoDate, CLIMATE_FEE_SCHEDULE)).toBeNull();
  });

  it('renders the intro but no switch, cards or season link when no climate fee rule is in force', () => {
    render(<Highlights locale="en" now={new Date('2024-06-01T10:00:00Z')} />);

    expect(screen.getByRole('heading', { level: 2, name: /A calm home in the city/ })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('controls a polite live list and swaps the cards at once without motion', () => {
    render(<Highlights locale="en" now={new Date('2026-11-15T10:00:00Z')} />);

    const list = screen.getByRole('list', { name: /Winter/ });
    expect(list).toHaveAttribute('aria-live', 'polite');
    const summer = screen.getByRole('button', { name: 'Summer (Apr–Oct)' });
    expect(summer).toHaveAttribute('aria-controls', list.id);
    expect(within(list).getAllByRole('heading', { level: 3 })).toHaveLength(4);
    expect(within(list).getByRole('heading', { name: 'Fireplace and heating' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See winter dates' })).toHaveAttribute('href', '/en/availability#m=2026-11');

    fireEvent.click(summer);

    expect(summer).toHaveAttribute('aria-pressed', 'true');
    expect(within(list).getByRole('heading', { name: 'Balcony facing Taygetos' })).toBeInTheDocument();
    expect(within(list).queryByRole('heading', { name: 'Fireplace and heating' })).toBeNull();
    expect(screen.getByRole('link', { name: 'See summer dates' })).toHaveAttribute('href', '/en/availability#m=2027-04');
  });

  it('flips the cards one by one under full motion (M9), and a change during the flip swaps at once', () => {
    const winter = ['Fireplace and heating', 'Daily needs on foot', 'Fully equipped kitchen', 'Ready for families'];
    const summer = ['Balcony facing Taygetos', 'Air conditioning and Wi-Fi', 'The coast a short drive away', 'Free private parking'];
    vi.useFakeTimers();
    document.documentElement.dataset.motion = 'full';

    try {
      render(<Highlights locale="en" now={new Date('2026-11-15T10:00:00Z')} />);
      const list = screen.getByRole('list', { name: /Winter/ });
      const titles = () => within(list).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);

      // The first card swaps at the edge-on half of its flip (320 ms), the others 70 ms apart.
      fireEvent.click(screen.getByRole('button', { name: 'Summer (Apr–Oct)' }));
      expect(list).toHaveClass('is-flipping');
      expect(titles()).toEqual(winter);
      act(() => vi.advanceTimersByTime(320));
      expect(titles()).toEqual([summer[0], ...winter.slice(1)]);
      act(() => vi.advanceTimersByTime(530));
      expect(titles()).toEqual(summer);
      expect(list).not.toHaveClass('is-flipping');

      // A second change mid-flip shows the chosen season at once, and no pending timer swaps a card back.
      fireEvent.click(screen.getByRole('button', { name: 'Winter (Nov–Mar)' }));
      act(() => vi.advanceTimersByTime(320));
      expect(titles()).toEqual([winter[0], ...summer.slice(1)]);
      fireEvent.click(screen.getByRole('button', { name: 'Summer (Apr–Oct)' }));
      expect(list).not.toHaveClass('is-flipping');
      expect(titles()).toEqual(summer);
      act(() => vi.advanceTimersByTime(2000));
      expect(titles()).toEqual(summer);
    } finally {
      delete document.documentElement.dataset.motion;
      vi.useRealTimers();
    }
  });
});

describe('BalconyWindow (identity §8, M10)', () => {
  it('keeps the photo accessible and hides the decorative shutters', () => {
    const { container } = render(<BalconyWindow locale="en" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Step onto the balcony' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Taygetos/ })).toBeInTheDocument();
    const shutters = Array.from(container.querySelectorAll('.shutter'));
    expect(shutters).toHaveLength(2);
    for (const shutter of shutters) expect(shutter).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('RoomsShowcase (identity §8, M11/M12)', () => {
  const rooms = homeRoomsFrom('en', APARTMENT_PHOTOS);

  it('builds six rooms from the apartment photos, lead photos per §7.3, linked to the apartment room sections', () => {
    expect(rooms.map((room) => [room.href, room.photo])).toEqual([
      ['/en/apartment#living', '/house/living/living_8.jpeg'],
      ['/en/apartment#kitchen', '/house/kitchen/kitchen_2.jpeg'],
      ['/en/apartment#bedroom-1', '/house/bedroom/bedroom_1.jpeg'],
      ['/en/apartment#bedroom-2', '/house/bedroom_2/bedroom_2_5.jpeg'],
      ['/en/apartment#bathroom', '/house/bathroom/bathroom_6.jpeg'],
      ['/en/apartment#balcony', '/house/balcony/balcony_1.jpeg'],
    ]);
    expect(homeRoomsFrom('el', APARTMENT_PHOTOS)[2]).toMatchObject({ name: 'Υπνοδωμάτιο 1', href: '/el/apartment#bedroom-1' });
  });

  it('renders no chip and no card for a room without its photo', () => {
    const withoutBedroom2 = homeRoomsFrom('en', APARTMENT_PHOTOS.filter((photo) => photo.room !== 'bedroom-2'));
    render(<RoomsShowcase rooms={withoutBedroom2} chipsLabel="Rooms" trackLabel="Room photos" />);

    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Bedroom 2' })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('leaves a room out when only its lead photo is missing from the apartment photos', () => {
    const withoutLead = homeRoomsFrom('en', APARTMENT_PHOTOS.filter((photo) => photo.src !== '/house/bedroom_2/bedroom_2_5.jpeg'));

    expect(withoutLead.map((room) => room.href)).not.toContain('/en/apartment#bedroom-2');
    expect(withoutLead).toHaveLength(5);
  });

  it('moves the active card with the arrow keys and keeps the chips in sync', async () => {
    const user = userEvent.setup();
    render(<RoomsShowcase rooms={rooms} chipsLabel="Rooms" trackLabel="Room photos" />);

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1']);
    expect(screen.getByRole('button', { name: 'Living room' })).toHaveAttribute('aria-pressed', 'true');

    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    await user.tab();
    expect(links[0]).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(links[1]).toHaveFocus();
    expect(links[1]).toHaveAttribute('tabindex', '0');
    expect(links[0]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: 'Kitchen' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Living room' })).toHaveAttribute('aria-pressed', 'false');

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(links[0]).toHaveFocus();

    await user.keyboard('{End}');
    expect(links[5]).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Balcony' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens the active room on the apartment page with Enter', async () => {
    const user = userEvent.setup();
    render(<RoomsShowcase rooms={rooms} chipsLabel="Rooms" trackLabel="Room photos" />);
    const opened: string[] = [];
    const preventedByComponent: boolean[] = [];
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element).closest('a');
      if (link) {
        opened.push(link.getAttribute('href') ?? '');
        preventedByComponent.push(event.defaultPrevented);
      }
      event.preventDefault();
    };
    document.addEventListener('click', onClick);

    try {
      fireEvent.click(screen.getByRole('button', { name: 'Kitchen' }));
      act(() => screen.getAllByRole('link')[1].focus());
      await user.keyboard('{Enter}');
    } finally {
      document.removeEventListener('click', onClick);
    }

    expect(opened).toEqual(['/en/apartment#kitchen']);
    expect(preventedByComponent).toEqual([false]);
  });

  it('makes a card active on the first click and follows its link on the next', () => {
    render(<RoomsShowcase rooms={rooms} chipsLabel="Rooms" trackLabel="Room photos" />);
    const kitchen = screen.getAllByRole('link')[1];
    const preventedByComponent: boolean[] = [];
    const onClick = (event: MouseEvent) => {
      preventedByComponent.push(event.defaultPrevented);
      event.preventDefault();
    };
    document.addEventListener('click', onClick);

    try {
      fireEvent.click(kitchen);
      expect(screen.getByRole('button', { name: 'Kitchen' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(kitchen);
    } finally {
      document.removeEventListener('click', onClick);
    }

    expect(preventedByComponent).toEqual([true, false]);
  });
});
