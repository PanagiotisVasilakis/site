// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const contact = vi.hoisted(() => ({ listingUrl: '' }));

vi.mock('@/data/contact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/contact')>()),
  get AIRBNB_LISTING_URL() {
    return contact.listingUrl;
  },
}));

import AvailabilityPlanner from '@/components/availability/AvailabilityPlanner';
import { getDictionary } from '@/i18n/dictionaries';
import { addDays, nightsBetween, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-01' as IsoDate;
const HORIZON_END = addDays(TODAY, 365);
const PAGE_PATH = '/en/availability';
const WHATSAPP_BASE = 'https://wa.me/306955810051';
const LISTING_URL = 'https://www.airbnb.com/rooms/12345678';

const t = getDictionary('en').availability;

function nightsWith(codes: Record<string, 'b' | 'u'> = {}): string {
  const nights = Array.from({ length: 365 }, () => 'o');
  for (const [date, code] of Object.entries(codes)) nights[nightsBetween(TODAY, date as IsoDate)] = code;
  return nights.join('');
}

function availability(overrides: Partial<PublicAvailability> = {}): PublicAvailability {
  return {
    today: TODAY,
    horizonEnd: HORIZON_END,
    status: 'fresh',
    lastSyncedAt: '2026-10-01T06:00:00.000Z',
    // 10 October is booked.
    nights: nightsWith({ '2026-10-10': 'b' }),
    rates: [
      { start: '2026-10-01' as IsoDate, end: '2026-10-15' as IsoDate, nightlyPriceCents: 8000, minimumNights: 1 },
      { start: '2026-10-15' as IsoDate, end: '2026-10-20' as IsoDate, nightlyPriceCents: 9500, minimumNights: 3 },
      { start: '2026-10-20' as IsoDate, end: '2026-12-01' as IsoDate, nightlyPriceCents: 8000, minimumNights: 1 },
      // No rate from 1 December: price on request.
    ],
    ...overrides,
  };
}

const fetchMock = vi.fn();

function stubViewport(wide: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: wide,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  }));
}

function renderPlanner(overrides: Partial<PublicAvailability> = {}) {
  return render(<AvailabilityPlanner locale="en" availability={availability(overrides)} />);
}

function day(container: HTMLElement, date: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-day="${date}"] button`);
  if (!button) throw new Error(`No day button for ${date}`);
  return button;
}

/** A controllable IntersectionObserver: `setVisible` reports the observed SummaryCard in or out of view. */
function stubIntersectionObserver() {
  const callbacks: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
      callbacks.push(callback);
    }
    observe() {}
    disconnect() {}
  });
  return { setVisible: (isIntersecting: boolean) => act(() => callbacks.forEach((callback) => callback([{ isIntersecting }]))) };
}

const summary = () => screen.getByRole('region', { name: t.summary.title });
const calendarNote = () => {
  const note = document.querySelector<HTMLElement>('.cal-note');
  if (!note) throw new Error('No calendar note');
  return note;
};
const quoteBar = () => screen.queryByRole('complementary', { name: t.quoteBar.label });
const whatsappLink = () => screen.getByRole('link', { name: `${t.booking.whatsapp} ${t.booking.opensInNewTab}` });

beforeEach(() => {
  contact.listingUrl = '';
  window.history.replaceState(null, '', PAGE_PATH);
  vi.stubGlobal('fetch', fetchMock);
  stubViewport(false);
});

describe('AvailabilityPlanner', () => {
  it('shows the nightly price on free days and none on booked days', () => {
    const { container } = renderPlanner();

    expect(day(container, '2026-10-09')).toHaveTextContent('€80');
    expect(day(container, '2026-10-09')).toHaveAccessibleName(/^Friday, 9 October 2026, €80 per night$/);
    expect(day(container, '2026-10-10')).not.toHaveTextContent('€');
    expect(day(container, '2026-10-10')).toHaveAccessibleName(/^Saturday, 10 October 2026, booked$/);
    // The lowest of the two prices (€80, €95) carries the "best price" pill.
    expect(day(container, '2026-10-09').querySelector('.cal__price')).toHaveClass('cal__price--best');
    expect(day(container, '2026-10-16').querySelector('.cal__price')).not.toHaveClass('cal__price--best');
  });

  it('shows no "best price" pill when every night has the same price', () => {
    const { container } = renderPlanner({
      rates: [{ start: TODAY, end: '2026-12-01' as IsoDate, nightlyPriceCents: 8000, minimumNights: 1 }],
    });

    expect(day(container, '2026-10-09')).toHaveTextContent('€80');
    expect(container.querySelector('.cal__price--best')).toBeNull();
  });

  it('gives the "best price" pill to the lowest price of the nights that are not booked', () => {
    const { container } = renderPlanner({
      rates: [
        { start: '2026-10-01' as IsoDate, end: '2026-10-10' as IsoDate, nightlyPriceCents: 8000, minimumNights: 1 },
        // The cheapest price is on the booked 10 October only.
        { start: '2026-10-10' as IsoDate, end: '2026-10-11' as IsoDate, nightlyPriceCents: 6000, minimumNights: 1 },
        { start: '2026-10-11' as IsoDate, end: '2026-10-15' as IsoDate, nightlyPriceCents: 8000, minimumNights: 1 },
        { start: '2026-10-15' as IsoDate, end: '2026-10-20' as IsoDate, nightlyPriceCents: 9500, minimumNights: 3 },
      ],
    });

    expect(day(container, '2026-10-09').querySelector('.cal__price')).toHaveClass('cal__price--best');
    expect(day(container, '2026-10-16').querySelector('.cal__price')).not.toHaveClass('cal__price--best');
  });

  it('does not let a booked day be a check-in, but lets it be the check-out', () => {
    const { container } = renderPlanner();

    expect(day(container, '2026-10-10')).toBeDisabled();
    fireEvent.click(day(container, '2026-10-07'));

    // The first booked night after the check-in is a check-out-only day, labelled "out".
    expect(day(container, '2026-10-10')).toBeEnabled();
    expect(day(container, '2026-10-10')).toHaveTextContent(t.day.out);
    expect(day(container, '2026-10-10')).toHaveAccessibleName(/^Saturday, 10 October 2026, booked, check-out only$/);
    fireEvent.click(day(container, '2026-10-10'));

    expect(within(summary()).getByText('3 nights')).toBeInTheDocument();
    expect(window.location.hash).toBe('#checkin=2026-10-07&checkout=2026-10-10');
  });

  it('applies the crossing rule: a day past a booked night becomes the new check-in', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-07'));
    expect(within(calendarNote()).getByText('Now choose your check-out day, at the latest Sat 10 Oct 2026.')).toBeInTheDocument();
    expect(calendarNote()).toHaveClass('ui-callout--info');

    // A stay across the booked 10 October is impossible: 12 October starts a new stay instead.
    expect(day(container, '2026-10-12')).toBeEnabled();
    fireEvent.click(day(container, '2026-10-12'));

    expect(window.location.hash).toBe('#checkin=2026-10-12');
    expect(within(calendarNote()).getByText('Sat 10 Oct 2026 is booked, so Mon 12 Oct 2026 is your new check-in.')).toBeInTheDocument();
    expect(calendarNote()).toHaveAttribute('role', 'status');
    expect(calendarNote()).toHaveClass('ui-callout--warning');
    expect(within(summary()).getByText(t.summary.checkIn).nextElementSibling).toHaveTextContent('Mon 12 Oct 2026');
    // Days before the check-in stay disabled while a check-out is chosen.
    expect(day(container, '2026-10-06')).toBeDisabled();
  });

  it('disables days that cannot start a stay as long as their minimum', () => {
    const { container } = renderPlanner({
      nights: nightsWith({ '2026-10-10': 'b', '2026-10-17': 'b' }),
    });

    // 15 October needs 3 nights, but 17 October is booked.
    expect(day(container, '2026-10-15')).toBeDisabled();
    // 16 October is in the same period (minimum 3) and 17 October is booked.
    expect(day(container, '2026-10-16')).toBeDisabled();
    expect(day(container, '2026-10-14')).toBeEnabled();
    expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
  });

  it('explains the minimum stay and only enables check-out days that meet it', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-15'));

    expect(within(calendarNote()).getByText('Minimum stay from this check-in: 3 nights.')).toBeInTheDocument();
    expect(calendarNote()).toHaveClass('ui-callout--warning');
    expect(day(container, '2026-10-16')).toBeDisabled();
    expect(day(container, '2026-10-17')).toBeDisabled();
    expect(day(container, '2026-10-18')).toBeEnabled();
  });

  it('quotes 3 × €80 plus a €24 climate fee as €264', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-10'));

    const card = summary();
    expect(within(card).getByText('3 nights × €80')).toBeInTheDocument();
    expect(within(card).getByText(t.summary.climateFee).nextElementSibling).toHaveTextContent('€24');
    expect(within(card).getByText(t.summary.total).nextElementSibling).toHaveTextContent('€264');
  });

  it('groups the climate fee by season: 29 Oct to 3 Nov is 3 × €8 and 2 × €2', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-29&checkout=2026-11-03`);
    renderPlanner();

    const card = summary();
    expect(within(card).getByText('3 × €8 Apr–Oct')).toBeInTheDocument();
    expect(within(card).getByText('2 × €2 Nov–Mar')).toBeInTheDocument();
    expect(within(card).getByText(t.summary.climateFee).nextElementSibling).toHaveTextContent('€28');
    expect(within(card).getByText('29 Oct – 3 Nov')).toBeInTheDocument();
  });

  it('groups nights by price and adds them up', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-13&checkout=2026-10-18`);
    renderPlanner();

    const card = summary();
    expect(within(card).getByText('2 nights × €80')).toBeInTheDocument();
    expect(within(card).getByText('3 nights × €95')).toBeInTheDocument();
    expect(within(card).getByText(t.summary.subtotal).nextElementSibling).toHaveTextContent('€445');
    expect(within(card).getByText(t.summary.total).nextElementSibling).toHaveTextContent('€485');
  });

  it('hides the total when a night has no price', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-11-29&checkout=2026-12-02`);
    stubViewport(true); // November and December
    const { container } = renderPlanner();

    const card = summary();
    expect(within(card).getByText(t.summary.priceOnRequest)).toBeInTheDocument();
    expect(within(card).queryByText(t.summary.total)).not.toBeInTheDocument();
    expect(within(card).queryByText(t.summary.subtotal)).not.toBeInTheDocument();
    expect(day(container, '2026-12-01')).not.toHaveTextContent('€');
    expect(day(container, '2026-12-01')).toHaveAccessibleName(/^Tuesday, 1 December 2026, price on request, selected$/);
  });

  it('pre-selects the stay from the URL fragment', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-07&checkout=2026-10-10`);
    const { container } = renderPlanner();

    expect(within(summary()).getByText('3 nights')).toBeInTheDocument();
    expect(day(container, '2026-10-07')).toHaveAccessibleName(/selected/);
    expect(day(container, '2026-10-10')).toHaveAccessibleName(/selected/);
  });

  it('pre-selects a check-in alone and waits for the check-out', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-07`);
    const { container } = renderPlanner();

    expect(day(container, '2026-10-06')).toBeDisabled();
    expect(day(container, '2026-10-10')).toHaveTextContent(t.day.out);
    expect(screen.getByText('Now choose your check-out day, at the latest Sat 10 Oct 2026.')).toBeInTheDocument();
  });

  it.each([
    '#checkin=2026-02-30&checkout=2026-03-02',
    '#checkin=2026-10-12&checkout=2026-10-08',
    '#checkin=2026-10-12&checkout=2026-10-12',
    '#checkin=2026-10-07&checkout=soon',
    '#checkout=2026-10-12',
    '#checkin=2026-10-10',
    '#contact',
  ])('ignores the fragment %s', (fragment) => {
    window.history.replaceState(null, '', `${PAGE_PATH}${fragment}`);
    renderPlanner();

    expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
    expect(screen.getByText(t.prompts.checkIn)).toBeInTheDocument();
  });

  it.each([
    ['#checkin=2026-10-08&checkout=2026-10-12', 'Some of those nights are already booked. Choose other dates.'],
    ['#checkin=2026-10-15&checkout=2026-10-17', 'The minimum stay from this check-in is 3 nights.'],
    ['#checkin=2026-10-11&checkout=2026-11-12', 'A stay can be at most 30 nights. For a longer stay, call us or send a WhatsApp message.'],
    ['#checkin=2026-09-20&checkout=2026-09-23', 'That check-in date has passed. Choose new dates.'],
  ])('explains why the stay %s cannot be booked', (fragment, message) => {
    window.history.replaceState(null, '', `${PAGE_PATH}${fragment}`);
    renderPlanner();

    expect(within(summary()).getByText(message)).toBeInTheDocument();
    expect(within(summary()).queryByText(t.summary.total)).not.toBeInTheDocument();
    expect(whatsappLink()).toHaveAttribute('href', WHATSAPP_BASE);
  });

  it('follows a fragment changed after load', () => {
    renderPlanner();

    act(() => {
      window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-07&checkout=2026-10-10`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(within(summary()).getByText('3 nights')).toBeInTheDocument();
  });

  it('clears the selection and the fragment', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}?x=1#checkin=2026-10-07&checkout=2026-10-10`);
    renderPlanner();

    fireEvent.click(screen.getByRole('button', { name: t.clearDates }));

    expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?x=1');
  });

  it('clears the selection when the check-in is chosen again', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-07'));

    expect(window.location.hash).toBe('');
    expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
    expect(screen.getByText(t.prompts.checkIn)).toBeInTheDocument();
  });

  it('starts a new stay when a day is chosen after a complete one', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-10'));
    fireEvent.click(day(container, '2026-10-20'));

    expect(window.location.hash).toBe('#checkin=2026-10-20');
    expect(within(summary()).getByText(t.summary.checkIn).nextElementSibling).toHaveTextContent('Tue 20 Oct 2026');
    expect(within(summary()).queryByText(t.summary.checkOut)).not.toBeInTheDocument();
    expect(screen.getByText('Now choose your check-out day, at the latest Thu 19 Nov 2026.')).toBeInTheDocument();
  });

  it('puts only the chosen dates into the WhatsApp message', () => {
    const { container } = renderPlanner();

    expect(whatsappLink()).toHaveAttribute('href', WHATSAPP_BASE);
    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-10'));

    const text = 'Hello! Is the apartment free from Wed 7 Oct 2026 to Sat 10 Oct 2026?';
    expect(whatsappLink()).toHaveAttribute('href', `${WHATSAPP_BASE}?text=${encodeURIComponent(text)}`);
    expect(whatsappLink()).toHaveAttribute('target', '_blank');
    expect(whatsappLink()).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: t.booking.call })).toHaveAttribute('href', 'tel:+306955810051');
  });

  it('renders no Airbnb button while the listing URL is empty', () => {
    renderPlanner();

    expect(screen.queryByRole('link', { name: /Airbnb/ })).not.toBeInTheDocument();
    // The trust line does not say that payment happens on Airbnb.
    expect(within(summary()).getByText(t.summary.trust)).toBeInTheDocument();
    expect(within(summary()).queryByText(t.summary.trustAirbnb)).not.toBeInTheDocument();
  });

  it('links the Airbnb button to the plain listing URL once it is set', () => {
    contact.listingUrl = LISTING_URL;
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-10'));

    const airbnb = screen.getByRole('link', { name: `${t.booking.airbnb} ${t.booking.opensInNewTab}` });
    expect(airbnb).toHaveAttribute('href', LISTING_URL);
    expect(airbnb).toHaveAttribute('target', '_blank');
    expect(airbnb).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(summary()).getByText(t.summary.trustAirbnb)).toBeInTheDocument();
    expect(within(summary()).queryByText(t.summary.trust)).not.toBeInTheDocument();
  });

  it('renders no Airbnb button for a URL that is not an Airbnb listing', () => {
    contact.listingUrl = 'https://example.com/rooms/12345678';
    renderPlanner();

    expect(screen.queryByRole('link', { name: /Airbnb/ })).not.toBeInTheDocument();
  });

  it('lets every night be chosen when availability is unknown, with prices still shown', () => {
    const { container } = renderPlanner({ status: 'stale', nights: 'u'.repeat(365) });

    expect(day(container, '2026-10-10')).toBeEnabled();
    expect(day(container, '2026-10-10')).toHaveTextContent('€80');
    fireEvent.click(day(container, '2026-10-08'));
    fireEvent.click(day(container, '2026-10-12'));
    expect(within(summary()).getByText(t.summary.total).nextElementSibling).toHaveTextContent('€352');
  });

  it('stacks three months on narrow screens and adds three more up to the horizon', () => {
    const { container } = renderPlanner();
    expect(container.querySelectorAll('.cal__month')).toHaveLength(3);

    for (const shown of [6, 9, 12]) {
      fireEvent.click(screen.getByRole('button', { name: t.showMoreMonths }));
      expect(container.querySelectorAll('.cal__month')).toHaveLength(shown);
    }
    // October 2026 to the horizon end (1 October 2027) is 13 months.
    fireEvent.click(screen.getByRole('button', { name: t.showMoreMonths }));
    expect(container.querySelectorAll('.cal__month')).toHaveLength(13);
    expect(screen.queryByRole('button', { name: t.showMoreMonths })).not.toBeInTheDocument();
  });

  it('shows two months with previous and next buttons on wide screens', () => {
    stubViewport(true);
    const { container } = renderPlanner();
    expect(container.querySelectorAll('.cal__month')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: t.showMoreMonths })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.nextMonths }));
    expect(container.querySelector('[data-day="2026-11-09"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2026-10-09"]')).toBeNull();
    expect(container.querySelector('.cal')).toHaveAttribute('data-turn', 'next');
  });

  // The home SeasonSwitch links to '#m=YYYY-MM', the first month of a season.
  it('stacks months down to the month of the fragment #m=2027-06', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#m=2027-06`);
    const { container } = renderPlanner();

    // October 2026 to June 2027 is 9 months: three blocks of three.
    expect(container.querySelectorAll('.cal__month')).toHaveLength(9);
    expect(container.querySelector('[data-day="2027-06-15"]')).not.toBeNull();
    expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
  });

  it('opens the two months from the month of the fragment #m=2027-06 on wide screens', () => {
    stubViewport(true);
    window.history.replaceState(null, '', `${PAGE_PATH}#m=2027-06`);
    const { container } = renderPlanner();

    expect(container.querySelectorAll('.cal__month')).toHaveLength(2);
    expect(container.querySelector('[data-day="2027-06-15"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2027-07-15"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2026-10-09"]')).toBeNull();
    expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
  });

  it.each([
    // One case per rejection branch (malformed, past, from the horizon end on);
    // the other malformed forms are covered by readMonthFragment's unit test.
    '#m=2027-13',
    '#m=2026-09',
    '#m=2027-10',
  ])('ignores the month fragment %s', (fragment) => {
    window.history.replaceState(null, '', `${PAGE_PATH}${fragment}`);
    const stacked = renderPlanner();
    expect(stacked.container.querySelectorAll('.cal__month')).toHaveLength(3);
    stacked.unmount();

    stubViewport(true);
    const { container } = renderPlanner();
    expect(container.querySelector('[data-day="2026-10-09"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2026-11-09"]')).not.toBeNull();
  });

  it.each([
    '#checkin=2026-10-07&checkout=2026-10-10&m=2027-06',
  ])('lets the stay win over the month in %s', (fragment) => {
    stubViewport(true);
    window.history.replaceState(null, '', `${PAGE_PATH}${fragment}`);
    const { container } = renderPlanner();

    expect(within(summary()).getByText('3 nights')).toBeInTheDocument();
    expect(container.querySelector('[data-day="2026-10-09"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2027-06-15"]')).toBeNull();
  });

  it('follows a month fragment changed after load', () => {
    stubViewport(true);
    const { container } = renderPlanner();

    act(() => {
      window.history.replaceState(null, '', `${PAGE_PATH}#m=2027-03`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(container.querySelector('[data-day="2027-03-15"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2026-10-09"]')).toBeNull();
  });

  it('moves the focus with the arrow keys and selects with Enter', async () => {
    const user = userEvent.setup();
    const { container } = renderPlanner();

    act(() => day(container, '2026-10-07').focus());
    await user.keyboard('{ArrowRight}');
    expect(day(container, '2026-10-08')).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(day(container, '2026-10-15')).toHaveFocus();
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('#checkin=2026-10-15');
  });

  it('shows the QuoteBar only for a complete stay while the SummaryCard is out of view', () => {
    const observer = stubIntersectionObserver();
    const { container } = renderPlanner();

    observer.setVisible(false);
    expect(quoteBar()).not.toBeInTheDocument();
    fireEvent.click(day(container, '2026-10-07'));
    observer.setVisible(false);
    expect(quoteBar()).not.toBeInTheDocument();

    fireEvent.click(day(container, '2026-10-10'));
    observer.setVisible(false);
    const bar = quoteBar();
    expect(bar).toBeInTheDocument();
    expect(bar).toHaveTextContent('€264 · 3 nights · total');
    // Without an Airbnb listing the bar leads to the card.
    const scrollIntoView = vi.fn();
    Object.defineProperty(summary(), 'scrollIntoView', { value: scrollIntoView, configurable: true });
    fireEvent.click(within(bar as HTMLElement).getByRole('button', { name: t.quoteBar.details }));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    observer.setVisible(true);
    expect(quoteBar()).not.toBeInTheDocument();
  });

  it('shows price on request in the QuoteBar when a night of the stay has no price', () => {
    const observer = stubIntersectionObserver();
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-11-29&checkout=2026-12-02`);
    renderPlanner();

    observer.setVisible(false);
    const bar = quoteBar();
    expect(bar).toHaveTextContent('3 nights · price on request');
    expect(bar).not.toHaveTextContent('€');
  });

  it('offers the Airbnb listing in the QuoteBar once the URL is set', () => {
    contact.listingUrl = LISTING_URL;
    const observer = stubIntersectionObserver();
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-07&checkout=2026-10-10`);
    renderPlanner();

    observer.setVisible(false);
    expect(within(quoteBar() as HTMLElement).getByRole('link', { name: `${t.booking.airbnb} ${t.booking.opensInNewTab}` }))
      .toHaveAttribute('href', LISTING_URL);
  });

  it('renders no form and sends nothing to the server', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-10'));
    fireEvent.click(screen.getByRole('button', { name: t.clearDates }));

    expect(container.querySelector('form')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the month of the fragment with no form and no request', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#m=2027-06`);
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2027-06-15'));

    expect(window.location.hash).toBe('#checkin=2027-06-15');
    expect(container.querySelector('form')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('speaks Greek', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-07&checkout=2026-10-10`);
    const { container } = render(<AvailabilityPlanner locale="el" availability={availability()} />);
    const el = getDictionary('el').availability;

    const card = screen.getByRole('region', { name: el.summary.title });
    expect(within(card).getByText('3 νύχτες × 80 €')).toBeInTheDocument();
    expect(within(card).getByText(el.summary.total).nextElementSibling).toHaveTextContent('264 €');
    expect(day(container, '2026-10-09')).toHaveAccessibleName(/^Παρασκευή, 9 Οκτωβρίου 2026, 80\s€ ανά νύχτα, επιλεγμένη$/);
    const text = 'Γεια σας! Είναι ελεύθερο το διαμέρισμα από Τετ 7 Οκτ 2026 έως Σάβ 10 Οκτ 2026;';
    expect(screen.getByRole('link', { name: `${el.booking.whatsapp} ${el.booking.opensInNewTab}` }))
      .toHaveAttribute('href', `${WHATSAPP_BASE}?text=${encodeURIComponent(text)}`);
  });
});
