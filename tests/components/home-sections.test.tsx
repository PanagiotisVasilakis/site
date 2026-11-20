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
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
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
import { nextFreeNight, nightsTeaserFrom } from '@/components/home/homeNights';
import { HOME_POINT, reliefPins, reliefPoint } from '@/components/home/homeRelief';
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

describe('home page composition and error handling', () => {
  it('renders sections in editorial order without check-in links or contact duplicates', async () => {
    const { container } = await renderHome();
    const order = ['[data-hero]', '.facts', '#intro', '#balcony', '#rooms', '#nights', '#location', '#host', '#faq'].map((selector) => {
      const el = container.querySelector(selector);
      expect(el, selector).not.toBeNull();
      return el as Element;
    });
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(container.querySelector('#contact')).toBeNull();
    expect(Array.from(container.querySelectorAll('a[href]'), (l) => l.getAttribute('href')).some((h) => h?.includes('/check-in'))).toBe(false);
  });

  it('still renders the hero without the nights strip or BookBar when availability read fails or is stale', async () => {
    mocks.read.mockRejectedValueOnce(new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    const failed = await renderHome();
    expect(failed.container.querySelector('[data-hero]')).not.toBeNull();
    expect(failed.container.querySelector('#nights')).toBeNull();
    expect(mocks.logger.error).toHaveBeenCalledWith('Home availability could not be read');
    expect(JSON.stringify(mocks.logger.error.mock.calls)).not.toContain('ECONNREFUSED');
    failed.unmount();

    mocks.read.mockResolvedValueOnce(availability({ status: 'stale', nights: 'u'.repeat(365) }));
    const stale = await renderHome();
    expect(stale.container.querySelector('#nights')).toBeNull();
    expect(stale.container.querySelector('.bookbar')).toBeNull();
    expect(stale.container.querySelector('#location')).not.toBeNull();
  });
});

describe('FactStrip and reduced motion', () => {
  afterEach(() => document.documentElement.removeAttribute('data-motion'));

  it('shows the six facts without prices and skips counter animation without full motion', () => {
    const observed: IntersectionObserverCallback[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: IntersectionObserverCallback) { observed.push(cb); }
      observe() {}
      disconnect() {}
    });
    document.documentElement.setAttribute('data-motion', 'reduce');

    const { container } = render(<FactStrip locale="en" />);
    const strip = screen.getByRole('region', { name: 'Key facts' });
    expect(within(strip).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('link', { name: 'See free dates' })).toHaveAttribute('href', '/en/availability');
    expect(container.textContent).not.toMatch(/€|night/);
    expect(observed).toHaveLength(0);
    expect(Array.from(container.querySelectorAll('.fact__num'), (n) => n.firstChild?.textContent)).toEqual(['90', '2', '1', '4', '2nd', 'P']);
  });
});

describe('Highlights, SeasonSwitch, and homeSeason', () => {
  it.each([
    ['2026-10-31T21:59:00Z', 'Summer (Apr–Oct)'],
    ['2026-10-31T22:00:00Z', 'Winter (Nov–Mar)'],
    ['2027-03-31T20:59:00Z', 'Winter (Nov–Mar)'],
    ['2027-03-31T21:00:00Z', 'Summer (Apr–Oct)'],
  ])('picks property-timezone season at %s', (instant, season) => {
    render(<Highlights locale="en" now={new Date(instant)} />);
    expect(screen.getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true')).toHaveTextContent(season);
  });

  it('computes first month per season and swaps the live list on toggle', () => {
    expect(homeSeasonsOn('2026-10-31' as IsoDate)).toEqual({ current: 'summer', firstMonth: { summer: '2026-10', winter: '2026-11' } });
    expect(homeSeasonsOn('2026-11-01' as IsoDate)).toEqual({ current: 'winter', firstMonth: { summer: '2027-04', winter: '2026-11' } });

    render(<Highlights locale="en" now={new Date('2026-11-15T10:00:00Z')} />);
    const list = screen.getByRole('list', { name: /Winter/ });
    expect(list).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('link', { name: 'See winter dates' })).toHaveAttribute('href', '/en/availability#m=2026-11');

    const summer = screen.getByRole('button', { name: 'Summer (Apr–Oct)' });
    fireEvent.click(summer);
    expect(summer).toHaveAttribute('aria-pressed', 'true');
    expect(within(list).getByRole('heading', { name: 'Balcony facing Taygetos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'See summer dates' })).toHaveAttribute('href', '/en/availability#m=2027-04');
  });
});

describe('RoomsShowcase and homeRoomsFrom', () => {
  const rooms = homeRoomsFrom('en', APARTMENT_PHOTOS);

  it('builds localized rooms from lead photos and omits rooms missing their photo', () => {
    expect(rooms.map((r) => [r.href, r.photo])).toEqual([
      ['/en/apartment#living', '/house/living/living_8.jpeg'],
      ['/en/apartment#kitchen', '/house/kitchen/kitchen_2.jpeg'],
      ['/en/apartment#bedroom-1', '/house/bedroom/bedroom_1.jpeg'],
      ['/en/apartment#bedroom-2', '/house/bedroom_2/bedroom_2_5.jpeg'],
      ['/en/apartment#bathroom', '/house/bathroom/bathroom_6.jpeg'],
      ['/en/apartment#balcony', '/house/balcony/balcony_2.jpeg'],
    ]);
    expect(homeRoomsFrom('el', APARTMENT_PHOTOS)[2]).toMatchObject({ name: 'Υπνοδωμάτιο 1', href: '/el/apartment#bedroom-1' });

    const withoutBedroom2 = homeRoomsFrom('en', APARTMENT_PHOTOS.filter((p) => p.room !== 'bedroom-2'));
    render(<RoomsShowcase rooms={withoutBedroom2} chipsLabel="Rooms" trackLabel="Room photos" />);
    expect(screen.queryByRole('button', { name: 'Bedroom 2' })).toBeNull();
    expect(screen.getAllByRole('link')).toHaveLength(5);
  });

  it('supports arrow/End keyboard navigation, Enter activation, and click-to-activate before navigating', async () => {
    const user = userEvent.setup();
    render(<RoomsShowcase rooms={rooms} chipsLabel="Rooms" trackLabel="Room photos" />);

    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1', '-1', '-1']);

    act(() => links[0].focus());
    await user.keyboard('{ArrowRight}');
    expect(links[1]).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Kitchen' })).toHaveAttribute('aria-pressed', 'true');

    await user.keyboard('{ArrowLeft}{End}');
    expect(links[5]).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Balcony' })).toHaveAttribute('aria-pressed', 'true');

    const prevented: boolean[] = [];
    const onClick = (e: MouseEvent) => { prevented.push(e.defaultPrevented); e.preventDefault(); };
    document.addEventListener('click', onClick);
    try {
      fireEvent.click(links[1]);
      expect(screen.getByRole('button', { name: 'Kitchen' })).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(links[1]);
    } finally {
      document.removeEventListener('click', onClick);
    }
    expect(prevented).toEqual([true, false]);
  });
});

describe('nights teaser, BookBar, FAQ, HostLetter, and LocationRelief', () => {
  it('renders 14 nights and BookBar on fresh data and computes teaser/nextFreeNight helpers', async () => {
    const { container } = await renderHome();
    const cells = within(screen.getByRole('list', { name: 'The next 14 nights' })).getAllByRole('listitem');
    expect(cells).toHaveLength(14);
    expect(cells[1]).toHaveTextContent('Monday 19 October, booked');
    expect(cells[1]).toHaveClass('night--booked');
    expect(container.querySelector('.bookbar')).toHaveTextContent('Free tonight');
    expect(container.querySelector('.bookbar')).not.toHaveTextContent('€');

    expect(nightsTeaserFrom(availability({ nights: `ooooo${'u'}${'o'.repeat(359)}` }))).toBeNull();
    expect(nightsTeaserFrom(availability({ status: 'unavailable' }))).toBeNull();
    expect(nextFreeNight(availability())).toEqual({ tonight: true, date: '2026-10-18' });
    expect(nextFreeNight(availability({ nights: `bbo${'o'.repeat(362)}` }))).toEqual({ tonight: false, date: '2026-10-20' });
    expect(nextFreeNight(availability({ status: 'stale' }))).toBeNull();
  });

  it('skips a free night shorter than its minimum stay', () => {
    const rates = [{ start: TODAY, end: addDays(TODAY, 365), minimumNights: 2 }];
    expect(nextFreeNight(availability({ nights: `obo${'o'.repeat(362)}`, rates }))).toEqual({ tonight: false, date: '2026-10-20' });
    expect(nextFreeNight(availability({ nights: `ob${'b'.repeat(363)}`, rates }))).toBeNull();
  });

  it('renders exclusive FAQ accordion and conditional HostLetter signature/metadata', () => {
    const faq = render(<FaqSection locale="en" />);
    const items = Array.from(faq.container.querySelectorAll('details'));
    expect(items).toHaveLength(3);
    expect(items.every((i) => i.getAttribute('name') === 'faq')).toBe(true);
    expect(items.map((i) => i.open)).toEqual([true, false, false]);
    expect(faq.container).not.toHaveTextContent(/cancel/i);
    faq.unmount();

    const plainLetter = render(<HostLetter locale="en" />);
    expect(plainLetter.container.querySelector('.letter__sig')).toBeNull();
    expect(plainLetter.container.querySelector('dl')).toBeNull();
    plainLetter.unmount();

    Object.assign(mocks.contact, { hostName: 'Maria', languages: 'Greek, English' });
    const signedLetter = render(<HostLetter locale="en" />);
    expect(signedLetter.container.querySelector('.letter__sig')).toHaveTextContent('Maria');
    expect(signedLetter.container.querySelector('dl')).toHaveTextContent('LanguagesGreek, English');
    expect(signedLetter.container.querySelector('dl')).not.toHaveTextContent('Usually replies');
  });

  it('projects relief coordinates into the LocationSection plan', () => {
    expect(reliefPoint([22.075, 37.05])).toEqual({ left: 0, top: 0 });
    expect(reliefPoint([30, 10])).toEqual({ left: 100, top: 100 });
    const pins = reliefPins(['townHall', 'bus', 'beach', 'centre', 'museum', 'airport'], 'en');
    expect(pins.map((p) => p.key)).toEqual(['beach', 'centre', 'museum']);
    expect(HOME_POINT.left).toBeLessThan(pins.find((p) => p.key === 'centre')?.left ?? 0);

    const { container } = render(<LocationSection locale="en" />);
    expect(within(screen.getByRole('list', { name: 'Distances from the apartment' })).getAllByRole('listitem')).toHaveLength(7);
    expect(container.querySelectorAll('.pin:not(.pin--home):not(.pin--peak)')).toHaveLength(3);
    expect(container.querySelector('.pin--home')).toHaveTextContent("You're staying here");
  });
});
