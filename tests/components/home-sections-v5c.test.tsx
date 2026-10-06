// @vitest-environment jsdom

import type React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  contact: { airbnb: '', hostName: '', languages: '', replyTime: '' },
}));

vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@/lib/prisma-repositories/availabilityRepository', () => ({ readPublicAvailability: mocks.read }));
vi.mock('@/lib/logger-enterprise', () => ({ logger: mocks.logger }));
// A plain anchor: the app router is not mounted in jsdom, and the test only needs the link's target.
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => <a href={href} {...props}>{children}</a>,
}));
// The owner data (Airbnb listing, host profile) is empty in the repository; tests switch it per case.
vi.mock('@/data/contact', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/contact')>();
  return {
    ...actual,
    get AIRBNB_LISTING_URL() { return mocks.contact.airbnb; },
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
import ContactBand from '@/components/home/ContactBand';
import FaqSection from '@/components/home/FaqSection';
import HostLetter from '@/components/home/HostLetter';
import LocationSection from '@/components/home/LocationSection';
import { addDays, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-18' as IsoDate;

function availability(overrides: Partial<PublicAvailability> = {}): PublicAvailability {
  return {
    today: TODAY,
    horizonEnd: addDays(TODAY, 365),
    status: 'fresh',
    lastSyncedAt: new Date(Date.now() - 14 * 3_600_000 - 60_000).toISOString(),
    nights: `obb${'o'.repeat(362)}`,
    rates: [{ start: TODAY, end: '2027-01-01' as IsoDate, nightlyPriceCents: 8500, minimumNights: 2 }],
    ...overrides,
  };
}

async function renderHome(locale = 'en') {
  return render(await Home({ params: Promise.resolve({ locale }) }));
}

beforeEach(() => {
  mocks.read.mockResolvedValue(availability());
  Object.assign(mocks.contact, { airbnb: '', hostName: '', languages: '', replyTime: '' });
});

describe('home page order (identity §9.1 items 7-12)', () => {
  it('places the teaser, location, host letter, FAQ and contact band after the rooms, in that order', async () => {
    const { container } = await renderHome();

    const order = ['#rooms', '#nights', '#location', '#host', '#faq', '#contact'].map((selector) => {
      const element = container.querySelector(selector);
      expect(element, selector).not.toBeNull();
      return element as Element;
    });
    for (let index = 1; index < order.length; index += 1) {
      expect(order[index - 1].compareDocumentPosition(order[index]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe('NightsTeaser (identity §8)', () => {
  const strip = () => screen.getByRole('list', { name: 'The next 14 nights and their prices' });

  it('shows 14 nights from fresh data, booked nights named "booked" and no stale note', async () => {
    const { container } = await renderHome();

    const cells = within(strip()).getAllByRole('listitem');
    expect(cells).toHaveLength(14);
    expect(cells[0]).toHaveTextContent('Sunday 18 October, €85 per night, lowest price');
    expect(cells[1]).toHaveTextContent('Monday 19 October, booked');
    expect(cells[1]).not.toHaveTextContent('€');
    expect(cells[1]).toHaveClass('night--booked');
    expect(container.querySelector('#nights')).toHaveTextContent('First night at this price: Sun 18 Oct');
    expect(container.querySelector('.teaser__stale')).toBeNull();
    expect(screen.getByRole('link', { name: 'See availability & prices' })).toHaveAttribute('href', '/en/availability');
  });

  it('names booked nights in Greek', async () => {
    await renderHome('el');

    const cells = within(screen.getByRole('list', { name: 'Οι επόμενες 14 νύχτες και οι τιμές τους' })).getAllByRole('listitem');
    expect(cells[1]).toHaveTextContent('Δευτέρα 19 Οκτωβρίου, κρατημένη');
  });

  it('shows stale data with the hours since the last sync and no booked night', async () => {
    mocks.read.mockResolvedValue(availability({ status: 'stale', nights: 'u'.repeat(365) }));

    const { container } = await renderHome();

    expect(container.querySelector('.teaser__stale')).toHaveTextContent('Calendar updated 14 hours ago, so booked nights are hidden for now. The prices are current.');
    expect(within(strip()).getAllByRole('listitem')).toHaveLength(14);
    expect(container.querySelectorAll('.night--booked')).toHaveLength(0);
  });

  it.each([
    ['not configured', () => mocks.read.mockResolvedValue(availability({ status: 'not_configured', nights: 'u'.repeat(365) }))],
    ['unavailable', () => mocks.read.mockRejectedValue(new Error('connect ECONNREFUSED'))],
  ])('is hidden when the calendar is %s', async (_state, arrange) => {
    arrange();

    const { container } = await renderHome();

    expect(container.querySelector('#nights')).toBeNull();
    expect(container.querySelector('#location')).not.toBeNull();
  });
});

describe('BookBar on the home page (identity §8)', () => {
  it('carries the "from" price and tonight', async () => {
    const { container } = await renderHome();

    const bar = container.querySelector('.bookbar');
    expect(bar).toHaveTextContent('from €85 / night');
    expect(bar).toHaveTextContent('Free tonight');
    expect(within(bar as HTMLElement).getByRole('link', { hidden: true })).toHaveAttribute('href', '/en/availability');
  });

  it('is not rendered without price data', async () => {
    mocks.read.mockResolvedValue(availability({ rates: [] }));

    const { container } = await renderHome();

    expect(container.querySelector('.bookbar')).toBeNull();
  });
});

describe('FAQ (identity §8 FAQAccordion)', () => {
  it('is an exclusive accordion with the first item open', () => {
    const { container } = render(<FaqSection locale="en" today={TODAY} />);

    const items = Array.from(container.querySelectorAll('details'));
    expect(items.length).toBe(5);
    expect(items.every((item) => item.getAttribute('name') === 'faq')).toBe(true);
    expect(items.map((item) => item.open)).toEqual([true, false, false, false, false]);
    expect(items.map((item) => item.querySelector('summary')?.textContent)).toEqual([
      'How do check-in and check-out work?',
      'Is there parking?',
      'What is the climate resilience fee?',
      'Can I cancel?',
      'Is it suitable for children?',
    ]);
    expect(items[2]).toHaveTextContent('April–October: €8 per night');
    expect(items[2]).toHaveTextContent('November–March: €2 per night');
    expect(items[3]).toHaveTextContent('Free cancellation up to 30 days before arrival');
  });
});

describe('ContactBand (identity §8)', () => {
  it('is the #contact target with WhatsApp, Call, e-mail and Instagram, and no Airbnb button without a listing URL', () => {
    const { container } = render(<ContactBand locale="en" />);

    expect(container.querySelector('section#contact')).not.toBeNull();
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', expect.stringMatching(/^https:\/\/wa\.me\//));
    expect(screen.getByRole('link', { name: 'Call' })).toHaveAttribute('href', expect.stringMatching(/^tel:\+30/));
    expect(screen.getByRole('link', { name: /@/ })).toHaveAttribute('href', expect.stringMatching(/^mailto:/));
    expect(screen.getByRole('link', { name: /Instagram/ })).toHaveAttribute('href', expect.stringContaining('instagram.com'));
    expect(screen.queryByRole('link', { name: /Airbnb/ })).toBeNull();
    expect(container.innerHTML).not.toContain('airbnb');
  });

  it('shows "Book on Airbnb" only with a valid listing URL', () => {
    mocks.contact.airbnb = 'https://evil.example/rooms/1';
    const { unmount } = render(<ContactBand locale="en" />);
    expect(screen.queryByRole('link', { name: /Airbnb/ })).toBeNull();
    unmount();

    mocks.contact.airbnb = 'https://www.airbnb.com/rooms/12345';
    render(<ContactBand locale="en" />);
    expect(screen.getByRole('link', { name: /Book on Airbnb/ })).toHaveAttribute('href', 'https://www.airbnb.com/rooms/12345');
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
