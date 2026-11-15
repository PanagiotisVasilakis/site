// @vitest-environment jsdom

import type React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
import RoomsShowcase from '@/components/home/RoomsShowcase';
import { homeRoomsFrom } from '@/components/home/homeRooms';
import { homeSeasonsOn } from '@/components/home/homeSeason';
import { APARTMENT_PHOTOS } from '@/data/apartmentPhotos';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';

const TODAY = '2026-10-01' as IsoDate;

beforeEach(() => {
  mocks.read.mockResolvedValue({
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: '2026-10-01T08:30:00.000Z',
    nights: 'o'.repeat(365),
    rates: [],
  });
});

describe('home page sections (identity §9.1 items 2-6)', () => {
  it('places the fact strip after the hero and the intro directly after it, then the balcony and the rooms', async () => {
    const { container } = render(await Home({ params: Promise.resolve({ locale: 'en' }) }));

    const order = ['[data-hero]', '.facts', '#intro', '#balcony', '#rooms'].map((selector) => {
      const element = container.querySelector(selector);
      expect(element, selector).not.toBeNull();
      return element as Element;
    });
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The KineticBand was removed on 2026-10-11 (owner request): nothing sits between the fact strip and the intro.
    expect(container.querySelector('.kinetic')).toBeNull();
    expect(container.querySelector('.facts')?.nextElementSibling).toHaveAttribute('id', 'intro');
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

    it('does not count without full motion', () => {
      document.documentElement.setAttribute('data-motion', 'reduce');
      const { container } = render(<FactStrip locale="en" />);
      expect(observed).toHaveLength(0);
      expect(numbers(container)).toEqual(['90', '2', '1', '4', '2nd', 'P']);
    });
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
    expect(homeSeasonsOn('2026-10-31' as IsoDate)).toEqual({
      current: 'summer',
      firstMonth: { summer: '2026-10', winter: '2026-11' },
    });
    expect(homeSeasonsOn('2026-11-01' as IsoDate)).toEqual({
      current: 'winter',
      firstMonth: { summer: '2027-04', winter: '2026-11' },
    });
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
      ['/en/apartment#balcony', '/house/balcony/balcony_2.jpeg'],
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
