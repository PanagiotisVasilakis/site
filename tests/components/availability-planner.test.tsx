// @vitest-environment jsdom

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const contact = vi.hoisted(() => ({ bookingUrl: '' }));

vi.mock('@/data/contact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/data/contact')>()),
  get BOOKING_COM_LISTING_URL() {
    return contact.bookingUrl;
  },
}));

import AvailabilityPlanner from '@/components/availability/AvailabilityPlanner';
import { nextFreeNight } from '@/components/home/homeNights';
import { getDictionary } from '@/i18n/dictionaries';
import { addDays, nightsBetween, type IsoDate } from '@/lib/availability/calendarDate';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

const TODAY = '2026-10-01' as IsoDate;
const HORIZON_END = addDays(TODAY, 365);
/** A server date that is not the 1st of its month; a year on, the horizon end is then mid-month too. */
const MID_MONTH = '2026-10-07' as IsoDate;
const PAGE_PATH = '/en/availability';
const WHATSAPP_BASE = 'https://wa.me/306955810051';
const BOOKING_URL = 'https://www.booking.com/Share-AiCapK';
const MAX_NIGHTS_NOTE = 'A stay can be at most 30 nights. For a longer stay, call us or send a WhatsApp message.';

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
      { start: '2026-10-01' as IsoDate, end: '2026-10-15' as IsoDate, minimumNights: 1 },
      { start: '2026-10-15' as IsoDate, end: '2026-10-20' as IsoDate, minimumNights: 3 },
      { start: '2026-10-20' as IsoDate, end: '2026-12-01' as IsoDate, minimumNights: 1 },
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

/** The planner on another server date, with the same 365-night horizon and every night free. */
function renderPlannerOn(today: IsoDate) {
  return renderPlanner({ today, horizonEnd: addDays(today, 365), nights: nightsWith() });
}

function day(container: HTMLElement, date: string): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-day="${date}"] button`);
  if (!button) throw new Error(`No day button for ${date}`);
  return button;
}

const summary = () => screen.getByRole('region', { name: t.summary.title });
const calendarNote = () => {
  const note = document.querySelector<HTMLElement>('.cal-note');
  if (!note) throw new Error('No calendar note');
  return note;
};
const whatsappLink = () => screen.getByRole('link', { name: `${t.booking.whatsapp} ${t.booking.opensInNewTab}` });

beforeEach(() => {
  contact.bookingUrl = '';
  window.history.replaceState(null, '', PAGE_PATH);
  vi.stubGlobal('fetch', fetchMock);
  stubViewport(false);
});

describe('AvailabilityPlanner', () => {
  it('shows no price on any day and names a booked day as booked', () => {
    const { container } = renderPlanner();

    expect(day(container, '2026-10-09')).toHaveAccessibleName(/^Friday, 9 October 2026$/);
    expect(day(container, '2026-10-10')).toHaveAccessibleName(/^Saturday, 10 October 2026, booked$/);
    expect(container.querySelector('.cal__price')).toBeNull();

    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-10'));
    expect(container).not.toHaveTextContent('€');
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

  it('explains the 30-night limit when a day past it becomes the new check-in', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-11-02'));
    // No booked night lies ahead: only the limit ends the check-out days, on Wed 2 Dec 2026.
    expect(within(calendarNote()).getByText('Now choose your check-out day, at the latest Wed 2 Dec 2026.')).toBeInTheDocument();
    expect(calendarNote()).toHaveClass('ui-callout--info');
    expect(within(calendarNote()).queryByText(MAX_NIGHTS_NOTE)).not.toBeInTheDocument();

    // 10 December is 38 nights on, but it can start a stay: it becomes the new check-in.
    fireEvent.click(day(container, '2026-12-10'));

    expect(window.location.hash).toBe('#checkin=2026-12-10');
    expect(within(calendarNote()).getByText(MAX_NIGHTS_NOTE)).toBeInTheDocument();
    expect(calendarNote()).toHaveClass('ui-callout--warning');
    expect(within(calendarNote()).getByText('Now choose your check-out day, at the latest Sat 9 Jan 2027.')).toBeInTheDocument();
    expect(within(calendarNote()).queryByText(/is booked/)).not.toBeInTheDocument();

    // A later click inside the new window clears the explanation, and the next stay does not bring it back.
    fireEvent.click(day(container, '2026-12-15'));

    expect(window.location.hash).toBe('#checkin=2026-12-10&checkout=2026-12-15');
    expect(screen.queryByText(MAX_NIGHTS_NOTE)).not.toBeInTheDocument();

    fireEvent.click(day(container, '2026-12-20'));

    expect(window.location.hash).toBe('#checkin=2026-12-20');
    expect(within(calendarNote()).getByText('Now choose your check-out day, at the latest Tue 19 Jan 2027.')).toBeInTheDocument();
    expect(within(calendarNote()).queryByText(MAX_NIGHTS_NOTE)).not.toBeInTheDocument();
  });

  it('explains the 30-night limit when a booked night lies beyond it', () => {
    const { container } = renderPlanner({ nights: nightsWith({ '2026-12-20': 'b' }) });

    fireEvent.click(day(container, '2026-11-02'));
    // The limit ends the check-out days 30 nights on, on Wed 2 Dec 2026: the booked 20 December lies beyond that.
    expect(within(calendarNote()).getByText('Now choose your check-out day, at the latest Wed 2 Dec 2026.')).toBeInTheDocument();

    // 25 December can start a stay, so it becomes the new check-in. The limit is the reason, not 20 December.
    fireEvent.click(day(container, '2026-12-25'));

    expect(window.location.hash).toBe('#checkin=2026-12-25');
    expect(within(calendarNote()).getByText(MAX_NIGHTS_NOTE)).toBeInTheDocument();
    expect(calendarNote()).toHaveClass('ui-callout--warning');
    expect(within(calendarNote()).queryByText(/is booked/)).not.toBeInTheDocument();
    expect(within(calendarNote()).getByText('Now choose your check-out day, at the latest Sun 24 Jan 2027.')).toBeInTheDocument();
  });

  it('drops the 30-night explanation when the fragment sets another check-in', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-11-02'));
    fireEvent.click(day(container, '2026-12-10'));
    expect(within(calendarNote()).getByText(MAX_NIGHTS_NOTE)).toBeInTheDocument();

    act(() => {
      window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-12-12`);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(within(calendarNote()).getByText('Now choose your check-out day, at the latest Mon 11 Jan 2027.')).toBeInTheDocument();
    expect(within(calendarNote()).queryByText(MAX_NIGHTS_NOTE)).not.toBeInTheDocument();
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

  it('says in the accessible name why a free night cannot start a stay', () => {
    // The scenario above, on 7 October so that days before today are on screen too:
    // the nights start at 7 October, six characters on from the nights of TODAY.
    const { container } = renderPlanner({
      today: MID_MONTH,
      horizonEnd: addDays(MID_MONTH, 365),
      nights: nightsWith({ '2026-10-10': 'b', '2026-10-17': 'b' }).slice(6).padEnd(365, 'o'),
    });

    // 15 and 16 October need 3 nights, but 17 October is booked.
    expect(day(container, '2026-10-15')).toBeDisabled();
    expect(day(container, '2026-10-15'))
      .toHaveAccessibleName('Thursday, 15 October 2026, free, but a stay must be at least 3 nights');
    expect(day(container, '2026-10-16')).toBeDisabled();
    expect(day(container, '2026-10-16'))
      .toHaveAccessibleName('Friday, 16 October 2026, free, but a stay must be at least 3 nights');
    // A night that can start a stay, the booked night and a past day carry no such sentence.
    expect(day(container, '2026-10-14')).toBeEnabled();
    expect(day(container, '2026-10-14')).toHaveAccessibleName('Wednesday, 14 October 2026');
    expect(day(container, '2026-10-17')).toHaveAccessibleName('Saturday, 17 October 2026, booked');
    expect(day(container, '2026-10-06')).toBeDisabled();
    expect(day(container, '2026-10-06')).toHaveAccessibleName('Tuesday, 6 October 2026');
  });

  // PS-12: a free night that is too short to start a stay is neither a booked night nor a past day.
  describe('a free night that cannot start a stay', () => {
    /** 15 and 16 October need 3 nights (the period's minimum) but 17 October is booked. */
    const SHORT_GAP = { today: MID_MONTH, horizonEnd: addDays(MID_MONTH, 365), nights: nightsWith({ '2026-10-10': 'b', '2026-10-17': 'b' }).slice(6).padEnd(365, 'o') };
    const cell = (container: HTMLElement, date: string) => {
      const element = container.querySelector<HTMLElement>(`[data-day="${date}"]`);
      if (!element) throw new Error(`No day cell for ${date}`);
      return element;
    };

    it('is styled apart from a past day and from a booked day', () => {
      const { container } = renderPlanner(SHORT_GAP);

      for (const date of ['2026-10-15', '2026-10-16']) {
        expect(cell(container, date)).toHaveClass('cal__day--short', 'cal__day--disabled');
        expect(cell(container, date)).not.toHaveClass('cal__day--booked');
      }
      expect(cell(container, '2026-10-06')).toHaveClass('cal__day--disabled');
      expect(cell(container, '2026-10-06')).not.toHaveClass('cal__day--short');
      expect(cell(container, '2026-10-17')).toHaveClass('cal__day--booked');
      expect(cell(container, '2026-10-17')).not.toHaveClass('cal__day--short');
      expect(cell(container, '2026-10-14')).not.toHaveClass('cal__day--short');
    });

    it('is not selectable, and choosing it does nothing', () => {
      const { container } = renderPlanner(SHORT_GAP);

      fireEvent.click(day(container, '2026-10-15'));

      expect(window.location.hash).toBe('');
      expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
      expect(screen.getByText(t.prompts.checkIn)).toBeInTheDocument();
    });

    it('shows no such style while a check-out is being chosen', () => {
      const { container } = renderPlanner(SHORT_GAP);

      fireEvent.click(day(container, '2026-10-12'));

      expect(container.querySelector('.cal__day--short')).toBeNull();
      expect(day(container, '2026-10-15')).not.toHaveAccessibleName(/free, but/);
    });

    it('keeps the style off the nights of a chosen stay that ends right before the booked night', () => {
      const { container } = renderPlanner(SHORT_GAP);

      // 11 to 16 October: 15 and 16 are inside the stay but cannot start one (3 nights needed, 17 October is booked).
      fireEvent.click(day(container, '2026-10-11'));
      fireEvent.click(day(container, '2026-10-16'));

      for (const date of ['2026-10-15', '2026-10-16']) {
        expect(cell(container, date)).toHaveClass('cal__day--selected');
        expect(cell(container, date)).not.toHaveClass('cal__day--short');
        expect(day(container, date).getAttribute('aria-label')).not.toMatch(/free, but/);
      }
    });

    it('keeps the style on a too-short night outside the chosen stay', () => {
      const { container } = renderPlanner(SHORT_GAP);

      fireEvent.click(day(container, '2026-10-11'));
      fireEvent.click(day(container, '2026-10-14'));

      for (const date of ['2026-10-15', '2026-10-16']) {
        expect(cell(container, date)).toHaveClass('cal__day--short');
        expect(day(container, date)).toHaveAccessibleName(/free, but a stay must be at least 3 nights$/);
      }
      expect(cell(container, '2026-10-14')).not.toHaveClass('cal__day--short');
    });

    it('is explained in the legend only while such a night exists', () => {
      const withGap = renderPlanner(SHORT_GAP);
      expect(within(withGap.container.querySelector<HTMLElement>('.cal-legend')!).getByText(t.legend.tooShort)).toBeInTheDocument();
      withGap.unmount();

      renderPlanner();
      expect(screen.queryByText(t.legend.tooShort)).not.toBeInTheDocument();
    });

    it('names the minimum without a price, fee, total or cancellation text', () => {
      const { container } = renderPlanner(SHORT_GAP);

      const name = day(container, '2026-10-15').getAttribute('aria-label') ?? '';
      expect(name).toContain('3 nights');
      expect(`${name} ${t.legend.tooShort} ${t.day.tooShort}`).not.toMatch(/€|\bprice|\bfee|\btotal|cancel/i);
    });

    it('speaks Greek', () => {
      const el = getDictionary('el').availability;
      const { container } = render(<AvailabilityPlanner locale="el" availability={availability(SHORT_GAP)} />);

      expect(day(container, '2026-10-15')).toHaveAccessibleName(
        'Πέμπτη, 15 Οκτωβρίου 2026, ελεύθερη, αλλά η διαμονή πρέπει να είναι τουλάχιστον 3 νύχτες',
      );
      expect(within(container.querySelector<HTMLElement>('.cal-legend')!).getByText(el.legend.tooShort)).toBeInTheDocument();
    });

    // AC-03: the BookBar names a night only if this calendar lets the visitor choose it as a check-in.
    it('is never the night the BookBar names', () => {
      const scenario = {
        nights: nightsWith({ '2026-10-03': 'b', '2026-10-06': 'b' }),
        rates: [{ start: TODAY, end: '2026-10-08' as IsoDate, minimumNights: 3 }],
      };
      const { container } = renderPlanner(scenario);

      // 1, 2, 4 and 5 October are free but cannot start a 3-night stay before the booked 3rd and 6th.
      for (const date of ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05']) {
        expect(day(container, date)).toBeDisabled();
      }
      expect(day(container, '2026-10-07')).toBeEnabled();
      expect(nextFreeNight(availability(scenario))).toEqual({ tonight: false, date: '2026-10-07' });
    });
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
    expect(whatsappLink()).toHaveAttribute('href', WHATSAPP_BASE);
  });

  it('clears the selection and the fragment', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}?x=1#checkin=2026-10-07&checkout=2026-10-10`);
    renderPlanner();

    fireEvent.click(screen.getByRole('button', { name: t.clearDates }));

    expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(window.location.search).toBe('?x=1');
  });

  // FGM-05 (WCAG 2.4.3): the button exists only while a check-in is chosen, so clearing removes the focused element
  // and the browser would send focus back to the top of the page. It goes to the calendar instead.
  it.each([
    ['with a complete stay', '#checkin=2026-10-07&checkout=2026-10-10'],
    ['with a check-in only', '#checkin=2026-10-07'],
  ])('moves focus to the calendar when "Clear dates" is activated from the keyboard %s', async (_name, fragment) => {
    window.history.replaceState(null, '', `${PAGE_PATH}${fragment}`);
    const user = userEvent.setup();
    renderPlanner();
    const clear = screen.getByRole('button', { name: t.clearDates });
    const calendar = screen.getByRole('group', { name: t.calendarLabel });

    await user.tab();
    while (document.activeElement !== clear) await user.tab();
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('button', { name: t.clearDates })).not.toBeInTheDocument();
    expect(within(summary()).getByText(t.summary.empty)).toBeInTheDocument();
    expect(calendar).toHaveFocus();
    expect(document.body).not.toHaveFocus();
    // The calendar is a programmatic focus target only: it is no extra tab stop.
    expect(calendar).toHaveAttribute('tabindex', '-1');
  });

  it('keeps the calendar as the next step after clearing: Tab enters its first day', async () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-07`);
    const user = userEvent.setup();
    renderPlanner();

    fireEvent.click(screen.getByRole('button', { name: t.clearDates }));
    await user.tab();

    expect(document.activeElement?.tagName).toBe('BUTTON');
    expect(screen.getByRole('group', { name: t.calendarLabel })).toContainElement(document.activeElement as HTMLElement);
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

  it('renders no Booking.com button while the listing link is empty', () => {
    renderPlanner();

    expect(screen.queryByRole('link', { name: /Booking\.com/ })).not.toBeInTheDocument();
    expect(screen.queryByText(t.booking.bookingCom)).not.toBeInTheDocument();
    expect(within(summary()).getByText(t.summary.trust)).toBeInTheDocument();
  });

  it('renders no Booking.com button for a URL that is not a Booking.com listing link', () => {
    contact.bookingUrl = 'https://example.com/Share-AiCapK';
    renderPlanner();

    expect(screen.queryByRole('link', { name: /Booking\.com/ })).not.toBeInTheDocument();
    expect(screen.queryByText(t.booking.bookingCom)).not.toBeInTheDocument();
  });

  it('links the primary Booking.com button to the listing link once it is set', () => {
    contact.bookingUrl = BOOKING_URL;
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-10'));
    const booking = within(summary()).getByRole('link', { name: `${t.booking.bookingCom} ${t.booking.opensInNewTab}` });
    expect(booking).toHaveAttribute('href', BOOKING_URL);
    expect(booking).toHaveAttribute('target', '_blank');
    expect(booking).toHaveAttribute('rel', 'noopener noreferrer');
    expect(booking).toHaveClass('ui-btn--primary');
    expect(within(summary()).getByText(t.summary.trust)).toBeInTheDocument();
  });

  it('lets every night be chosen when availability is unknown', () => {
    const { container } = renderPlanner({ status: 'stale', nights: 'u'.repeat(365) });

    expect(day(container, '2026-10-10')).toBeEnabled();
    fireEvent.click(day(container, '2026-10-08'));
    fireEvent.click(day(container, '2026-10-12'));
    expect(within(summary()).getByText('4 nights')).toBeInTheDocument();
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

  it('disables Previous on the first view when today is not the 1st, and one Next press shows the next two months', () => {
    stubViewport(true);
    const { container } = renderPlannerOn(MID_MONTH);
    const previous = screen.getByRole('button', { name: t.previousMonths });
    const next = screen.getByRole('button', { name: t.nextMonths });

    // The first view starts at the 1st of October, so nothing lies before it.
    expect(container.querySelector('[data-day="2026-10-09"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2026-11-09"]')).not.toBeNull();
    expect(previous).toBeDisabled();
    expect(next).toBeEnabled();

    // A press on the disabled Previous does nothing, so it cannot swallow the next press.
    fireEvent.click(previous);
    fireEvent.click(next);
    expect(container.querySelector('[data-day="2026-11-09"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2026-12-09"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2026-10-09"]')).toBeNull();
    expect(previous).toBeEnabled();
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

  it('moves the two months back at the first Previous press after opening the horizon-end month with #m=2027-10', () => {
    stubViewport(true);
    // The horizon end is 7 October 2027, so October still has nights and '#m=2027-10' is accepted.
    window.history.replaceState(null, '', `${PAGE_PATH}#m=2027-10`);
    const { container } = renderPlannerOn(MID_MONTH);

    // The last two months are on screen, September and October 2027, with nothing after them.
    expect(container.querySelector('[data-day="2027-09-15"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2027-10-15"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: t.nextMonths })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: t.previousMonths }));
    expect(container.querySelector('[data-day="2027-08-15"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2027-09-15"]')).not.toBeNull();
    expect(container.querySelector('[data-day="2027-10-15"]')).toBeNull();
    expect(screen.getByRole('button', { name: t.nextMonths })).toBeEnabled();
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

  it('renders no form and sends nothing to the server', () => {
    const { container } = renderPlanner();

    fireEvent.click(day(container, '2026-10-07'));
    fireEvent.click(day(container, '2026-10-10'));
    fireEvent.click(screen.getByRole('button', { name: t.clearDates }));

    expect(container.querySelector('form')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('speaks Greek', () => {
    window.history.replaceState(null, '', `${PAGE_PATH}#checkin=2026-10-07&checkout=2026-10-10`);
    const { container } = render(<AvailabilityPlanner locale="el" availability={availability()} />);
    const el = getDictionary('el').availability;

    const card = screen.getByRole('region', { name: el.summary.title });
    expect(within(card).getByText('3 νύχτες')).toBeInTheDocument();
    expect(day(container, '2026-10-09')).toHaveAccessibleName(/^Παρασκευή, 9 Οκτωβρίου 2026, επιλεγμένη$/);
    const text = 'Γεια σας! Είναι ελεύθερο το διαμέρισμα από Τετ 7 Οκτ 2026 έως Σάβ 10 Οκτ 2026;';
    expect(screen.getByRole('link', { name: `${el.booking.whatsapp} ${el.booking.opensInNewTab}` }))
      .toHaveAttribute('href', `${WHATSAPP_BASE}?text=${encodeURIComponent(text)}`);
  });
});
