// @vitest-environment jsdom

import type React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  contact: { hostName: '', languages: '', replyTime: '' },
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/prisma-repositories/availabilityRepository', () => ({ readPublicAvailability: mocks.read }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));
// A plain anchor: the app router is not mounted in jsdom, and the test only needs the link's target.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
// The owner data (host profile) is empty in the repository; tests switch it per case.
vi.mock('@/data/contact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/contact')>();
  return {
    ...actual,
    get HOST_PROFILE() {
      return {
        name: mocks.contact.hostName,
        languages: { en: mocks.contact.languages, el: mocks.contact.languages },
        replyTime: { en: mocks.contact.replyTime, el: mocks.contact.replyTime },
      };
    },
  };
});

import Home from '@/app/[locale]/page';
import FactStrip from '@/components/home/FactStrip';
import FaqSection from '@/components/home/FaqSection';
import Highlights from '@/components/home/Highlights';
import HostLetter from '@/components/home/HostLetter';
import LocationSection from '@/components/home/LocationSection';
import RoomsShowcase from '@/components/home/RoomsShowcase';
import { homeRoomsFrom } from '@/components/home/homeRooms';
import { homeSeasonsOn } from '@/components/home/homeSeason';
import { APARTMENT_PHOTOS } from '@/data/apartmentPhotos';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-18' as IsoDate;

function availability(overrides: Partial<PublicAvailability> = {}): PublicAvailability {
  return {
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: '2026-10-18T06:00:00.000Z',
    nights: `obb${'o'.repeat(362)}`,
    rates: [],
    ...overrides,
  };
}

async function renderHome(locale = 'en') {
  return render(await Home({ params: Promise.resolve({ locale }) }));
}

beforeEach(() => {
  mocks.read.mockResolvedValue(availability());
  Object.assign(mocks.contact, { hostName: '', languages: '', replyTime: '' });
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

describe('home page order (identity §9.1 items 7-11)', () => {
  it('places the teaser, location, host letter and FAQ after the rooms, in that order, and ends with the FAQ', async () => {
    const { container } = await renderHome();

    const order = ['#rooms', '#nights', '#location', '#host', '#faq'].map((selector) => {
      const element = container.querySelector(selector);
      expect(element, selector).not.toBeNull();
      return element as Element;
    });
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    // The ContactBand was removed on 2026-10-11 (owner request): the #contact target is the footer's contact block
    // (SiteFooter in the locale layout; tests/components/site-shell.test.tsx), so the page has none and ends with the FAQ.
    expect(container.querySelector('#contact')).toBeNull();
    const sections = container.querySelectorAll('section');
    expect(sections[sections.length - 1]).toHaveAttribute('id', 'faq');
  });
});

describe('NightsTeaser (identity §8)', () => {
  const strip = () => screen.getByRole('list', { name: 'The next 14 nights' });

  it('shows 14 nights from fresh data, booked nights named "booked", and no price', async () => {
    const { container } = await renderHome();

    const cells = within(strip()).getAllByRole('listitem');
    expect(cells).toHaveLength(14);
    expect(cells[0]).toHaveTextContent('Sunday 18 October');
    expect(cells[0]).not.toHaveClass('night--booked');
    expect(cells[1]).toHaveTextContent('Monday 19 October, booked');
    expect(cells[1]).toHaveClass('night--booked');
    expect(container.querySelector('#nights')?.textContent).not.toMatch(/€|price/i);
    expect(screen.getByRole('link', { name: 'See availability' })).toHaveAttribute('href', '/en/availability');
  });

  it.each([
    ['stale', () => mocks.read.mockResolvedValue(availability({ status: 'stale', nights: 'u'.repeat(365) }))],
    ['not configured', () => mocks.read.mockResolvedValue(availability({ status: 'not_configured', nights: 'u'.repeat(365) }))],
  ])('is hidden when the calendar is %s', async (_state, arrange) => {
    arrange();

    const { container } = await renderHome();

    expect(container.querySelector('#nights')).toBeNull();
    expect(container.querySelector('#location')).not.toBeNull();
  });
});

describe('BookBar on the home page (identity §8)', () => {
  it('carries tonight and the Check dates link, with no price', async () => {
    const { container } = await renderHome();

    const bar = container.querySelector('.bookbar');
    expect(bar).toHaveTextContent('Free tonight');
    expect(bar).not.toHaveTextContent('€');
    expect(within(bar as HTMLElement).getByRole('link', { hidden: true })).toHaveAttribute('href', '/en/availability');
  });

  it('is not rendered without a fresh calendar', async () => {
    mocks.read.mockResolvedValue(availability({ status: 'stale', nights: 'u'.repeat(365) }));

    const { container } = await renderHome();

    expect(container.querySelector('.bookbar')).toBeNull();
  });
});

describe('FAQ (identity §8 FAQAccordion)', () => {
  it('is an exclusive accordion with the first item open, and no cancellation item', () => {
    const { container } = render(<FaqSection locale="en" />);

    const items = Array.from(container.querySelectorAll('details'));
    expect(items.length).toBe(3);
    expect(items.every((item) => item.getAttribute('name') === 'faq')).toBe(true);
    expect(items.map((item) => item.open)).toEqual([true, false, false]);
    expect(items.map((item) => item.querySelector('summary')?.textContent)).toEqual([
      'How do check-in and check-out work?',
      'Is there parking?',
      'Is it suitable for children?',
    ]);
    expect(items[0]).toHaveTextContent('Arrival instructions are shared with you before check-in.');
    expect(container).not.toHaveTextContent(/cancel/i);
  });
});

describe('HostLetter (identity §8, §1.4)', () => {
  it('is the #host target with the letter only, without owner data', () => {
    const { container } = render(<HostLetter locale="en" />);

    expect(container.querySelector('section#host')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Stay a little longer than you planned.');
    expect(container.querySelector('.letter__eyebrow')).toHaveTextContent(/^A letter from your host$/);
    expect(container.querySelectorAll('.letter__p')).toHaveLength(3);
    expect(container.querySelector('.letter__p')).toHaveTextContent(/^Dolce Far Niente is looked after by its host herself\./);
    expect(container.querySelector('.letter__sig')).toBeNull();
    expect(container.querySelector('dl')).toBeNull();
    expect(container.textContent).not.toMatch(/\[|placeholder/i);
  });

  it('adds the signature and each meta row only when the owner supplied it', () => {
    Object.assign(mocks.contact, { hostName: 'Maria', languages: 'Greek, English' });

    const { container } = render(<HostLetter locale="en" />);

    expect(container.querySelector('.letter__sig')).toHaveTextContent('Maria');
    expect(container.querySelector('dl')).toHaveTextContent('LanguagesGreek, English');
    expect(container.querySelector('dl')).not.toHaveTextContent('Usually replies');
  });
});

describe('Location band (identity §8 LocationRelief + DistanceList)', () => {
  it('lists the distances and shows the relief as an image with a text alternative and pins from the map data', () => {
    const { container } = render(<LocationSection locale="en" />);

    const list = screen.getByRole('list', { name: 'Distances from the apartment' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(7);
    expect(list).toHaveTextContent('Public Library–Art Gallery15 minon foot · 5 min by car');
    const map = screen.getByRole('img', { name: /Illustrative map of Kalamata/ });
    expect(map).toHaveAccessibleDescription("Illustrative map, not to scale. Positions from the guide's map data.");
    expect(container.querySelectorAll('.pin:not(.pin--home):not(.pin--peak)')).toHaveLength(3);
    expect(container.querySelector('.pin:not(.pin--home):not(.pin--peak):nth-child(4) .pin__label')).toHaveTextContent(/^Benakeion Museum$/);
    expect(container.querySelector('.pin--home')).toHaveTextContent("You're staying here");
  });
});
