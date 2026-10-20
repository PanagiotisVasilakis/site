// @vitest-environment jsdom

import type React from 'react';
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('names booked nights in Greek', async () => {
    await renderHome('el');

    const cells = within(screen.getByRole('list', { name: 'Οι επόμενες 14 νύχτες' })).getAllByRole('listitem');
    expect(cells[1]).toHaveTextContent('Δευτέρα 19 Οκτωβρίου, κρατημένη');
  });

  it.each([
    ['stale', () => mocks.read.mockResolvedValue(availability({ status: 'stale', nights: 'u'.repeat(365) }))],
    ['not configured',() => mocks.read.mockResolvedValue(availability({ status: 'not_configured', nights: 'u'.repeat(365) }))],
    ['unavailable', () => mocks.read.mockRejectedValue(new Error('connect ECONNREFUSED'))],
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
