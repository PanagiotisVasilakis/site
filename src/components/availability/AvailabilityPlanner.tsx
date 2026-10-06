'use client';

import clsx from 'clsx';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ThHTMLAttributes } from 'react';
import { DayButton, DayPicker, type ClassNames, type DayButtonProps, type Modifiers } from 'react-day-picker';

import { Icon } from '@/components/icons/Icon';
import { Callout } from '@/components/ui/Callout';
import { IconButton } from '@/components/ui/IconButton';
import { CLIMATE_FEE_SCHEDULE } from '@/data/stayPolicy';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { eachNight, fromLocalDate, nightsBetween, toLocalDate, type IsoDate } from '@/lib/availability/calendarDate';
import { formatCentsShort } from '@/lib/availability/money';
import {
  climateFeeGroups,
  minimumNightsFor,
  quoteStay,
  rateForNight,
  validateStay,
  type StayContext,
} from '@/lib/availability/stayQuote';
import type { PublicAvailability } from '@/lib/prisma-repositories/availabilityRepository';

import QuoteBar from './QuoteBar';
import StaySummary from './StaySummary';
import { DAY_PICKER_LOCALES, fill, formatLongDate, formatStayDate, nightsLabel } from './format';
import {
  EMPTY_SELECTION,
  bookedNights,
  checkOutWindow,
  lowestNightlyPrice,
  nightCodeOn,
  readMonthFragment,
  readSelectionFragment,
  selectionFragment,
  type Selection,
} from './plannerState';

const WIDE_SCREEN_QUERY = '(min-width: 768px)';
/** Narrow screens stack this many months at first, and add as many per "Show more". */
const STACK_STEP = 3;

/** Class names of the skinned calendar (src/styles/components/calendar.css); no react-day-picker stylesheet. */
const CALENDAR_CLASSES: Partial<ClassNames> = {
  root: 'cal',
  months: 'cal__months',
  month: 'cal__month',
  month_caption: 'cal__caption',
  caption_label: 'cal__caption-label',
  month_grid: 'cal__grid',
  weekdays: 'cal__weekdays',
  weekday: 'cal__weekday',
  weeks: 'cal__weeks',
  week: 'cal__week',
  day: 'cal__day',
  day_button: 'cal__btn',
  today: 'cal__day--today',
  disabled: 'cal__day--disabled',
  hidden: 'cal__day--hidden',
  outside: 'cal__day--outside',
  focused: 'cal__day--focused',
  selected: 'cal__day--selected',
  range_start: 'cal__day--start',
  range_end: 'cal__day--end',
  range_middle: 'cal__day--middle',
  footer: 'cal__footer',
};

const MODIFIER_CLASSES = {
  booked: 'cal__day--booked',
  checkOutOnly: 'cal__day--out',
};

/** What a day cell shows under its date. */
type DayCell = Readonly<{
  /** The short nightly price of a free night, or null. */
  price: string | null;
  best: boolean;
  /** The label of a check-out-only day ("out"), or null. */
  out: string | null;
  /** Position of a chosen night or the check-out day in the stay (M20 light pass), or null. */
  stayIndex: number | null;
}>;

const NO_CELL: DayCell = { price: null, best: false, out: null, stayIndex: null };
const DayCellContext = createContext<(date: Date) => DayCell>(() => NO_CELL);

function PricedDayButton({ children, style, ...props }: DayButtonProps) {
  const cell = useContext(DayCellContext)(props.day.date);
  const cellStyle = cell.stayIndex === null ? style : ({ ...style, '--i': cell.stayIndex } as CSSProperties);
  return (
    <DayButton {...props} style={cellStyle}>
      <span className="cal__date">{children}</span>
      {cell.out !== null ? (
        <span aria-hidden="true" className="cal__note">{cell.out}</span>
      ) : cell.price !== null ? (
        <span aria-hidden="true" className={clsx('cal__price', cell.best && 'cal__price--best')}>{cell.price}</span>
      ) : null}
    </DayButton>
  );
}

/** Weekday header: the short name, with the full name as the abbreviation title (rdp sets it as the label). */
function WeekdayHeader({ children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th {...props}>
      <abbr className="cal__abbr" title={props['aria-label']}>{children}</abbr>
    </th>
  );
}

/** Calendar months from `from`'s month to `to`'s month: 0 for the same month. */
function monthsBetween(from: IsoDate, to: IsoDate): number {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

/** Stacked months: enough blocks of STACK_STEP months (at least `shown`) to include `date`'s month. */
function stackedMonthsFor(today: IsoDate, date: IsoDate, shown: number, total: number): number {
  const needed = Math.ceil((monthsBetween(today, date) + 1) / STACK_STEP) * STACK_STEP;
  return Math.min(Math.max(shown, needed), total);
}

type Turn = Readonly<{ direction: 'next' | 'prev'; count: number }>;

type AvailabilityPlannerProps = {
  locale: Locale;
  availability: PublicAvailability;
};

/**
 * The calendar and the quote. Check-in and check-out follow the stay rules
 * (stayQuote); `today` comes from the server, never from the browser clock.
 * The selection is kept in the URL fragment only: no form, no request.
 */
export default function AvailabilityPlanner({ locale, availability }: AvailabilityPlannerProps) {
  const t = getDictionary(locale).availability;
  const { today, horizonEnd, nights, rates } = availability;
  const context = useMemo<StayContext>(
    () => ({ today, horizonEnd, blockedNights: bookedNights(today, nights), ratePeriods: rates }),
    [today, horizonEnd, nights, rates],
  );
  const bestPrice = useMemo(() => lowestNightlyPrice(today, nights, rates), [today, nights, rates]);
  const totalMonths = monthsBetween(today, horizonEnd) + 1;

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  /** The booked night crossed by the last choice, which made that day the new check-in. */
  const [crossedNight, setCrossedNight] = useState<IsoDate | null>(null);
  const [month, setMonth] = useState(() => toLocalDate(today));
  const [shownMonths, setShownMonths] = useState(STACK_STEP);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [wideScreen, setWideScreen] = useState(false);
  const [cardInView, setCardInView] = useState(true);
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const query = window.matchMedia(WIDE_SCREEN_QUERY);
    const update = () => setWideScreen(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // The QuoteBar shows only while the SummaryCard is out of view.
  useEffect(() => {
    const card = cardRef.current;
    if (card === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setCardInView(entry.isIntersecting);
    });
    observer.observe(card);
    return () => observer.disconnect();
  }, []);

  // Applies the fragment of a shared or reloaded link, and of later hash
  // changes. A check-in without check-out must be able to start a stay; a
  // complete stay is kept even if it is no longer possible, so the summary can
  // say why. Without such a stay, a month ('#m=YYYY-MM') opens that month.
  useEffect(() => {
    const applyMonth = () => {
      const monthStart = readMonthFragment(window.location.hash, today, horizonEnd);
      if (monthStart === null) return;
      setMonth(toLocalDate(monthStart));
      setShownMonths((count) => stackedMonthsFor(today, monthStart, count, totalMonths));
    };
    const applyFragment = () => {
      const fromFragment = readSelectionFragment(window.location.hash);
      if (
        fromFragment === null
        || fromFragment.checkIn === null
        || (fromFragment.checkOut === null && checkOutWindow(fromFragment.checkIn, context) === null)
      ) {
        applyMonth();
        return;
      }
      setSelection(fromFragment);
      setCrossedNight(null);
      const { checkIn } = fromFragment;
      const shown = checkIn < today ? today : checkIn >= horizonEnd ? horizonEnd : checkIn;
      setMonth(toLocalDate(shown));
      const lastShown = fromFragment.checkOut !== null && fromFragment.checkOut <= horizonEnd ? fromFragment.checkOut : shown;
      setShownMonths((count) => stackedMonthsFor(today, lastShown, count, totalMonths));
    };
    applyFragment();
    window.addEventListener('hashchange', applyFragment);
    return () => window.removeEventListener('hashchange', applyFragment);
  }, [context, today, horizonEnd, totalMonths]);

  const select = useCallback((next: Selection, crossed: IsoDate | null = null) => {
    setSelection(next);
    setCrossedNight(crossed);
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}${selectionFragment(next)}`);
  }, []);

  const choosingCheckOut = selection.checkIn !== null && selection.checkOut === null;
  const checkOutDays = choosingCheckOut && selection.checkIn !== null ? checkOutWindow(selection.checkIn, context) : null;
  const inCheckOutWindow = (day: IsoDate) => checkOutDays !== null && day >= checkOutDays.first && day <= checkOutDays.last;
  /** Crossing rule: past the latest check-out, a day that can start a stay becomes the new check-in. */
  const startsNewStay = (day: IsoDate) =>
    checkOutDays !== null && day > checkOutDays.last && checkOutWindow(day, context) !== null;

  const priceFor = useCallback((night: IsoDate): number | null => {
    const code = nightCodeOn(night, today, nights);
    if (code !== 'o' && code !== 'u') return null;
    return rateForNight(night, rates)?.nightlyPriceCents ?? null;
  }, [today, nights, rates]);

  const validation = selection.checkIn !== null && selection.checkOut !== null
    ? validateStay(selection.checkIn, selection.checkOut, context)
    : null;
  const stay = validation?.ok ? { checkIn: validation.checkIn, checkOut: validation.checkOut } : undefined;

  const cellFor = (date: Date): DayCell => {
    const day = fromLocalDate(date);
    const cents = priceFor(day);
    const out = checkOutDays !== null && day === checkOutDays.last && nightCodeOn(day, today, nights) === 'b' ? t.day.out : null;
    const stayIndex = stay !== undefined && day > stay.checkIn && day <= stay.checkOut ? nightsBetween(stay.checkIn, day) : null;
    return {
      price: cents === null ? null : formatCentsShort(cents, locale),
      best: cents !== null && cents === bestPrice,
      out,
      stayIndex,
    };
  };

  const isDisabled = (date: Date): boolean => {
    const day = fromLocalDate(date);
    if (choosingCheckOut) {
      // The check-in stays clickable: choosing it again clears the selection.
      return day !== selection.checkIn && !inCheckOutWindow(day) && !startsNewStay(day);
    }
    return checkOutWindow(day, context) === null;
  };

  const modifiers = {
    booked: (date: Date) => nightCodeOn(fromLocalDate(date), today, nights) === 'b',
    priceOnRequest: (date: Date) => {
      const night = fromLocalDate(date);
      const code = nightCodeOn(night, today, nights);
      return (code === 'o' || code === 'u') && rateForNight(night, rates) === null;
    },
    checkOutOnly: (date: Date) => {
      const day = fromLocalDate(date);
      return checkOutDays !== null && day === checkOutDays.last && nightCodeOn(day, today, nights) === 'b';
    },
  };

  const labelDayButton = (date: Date, dayModifiers: Modifiers): string => {
    const parts = [formatLongDate(date, locale)];
    if (dayModifiers.today) parts.unshift(t.day.today);
    const cents = priceFor(fromLocalDate(date));
    if (dayModifiers.booked) parts.push(t.day.booked);
    else if (cents !== null) parts.push(fill(t.day.perNight, { price: formatCentsShort(cents, locale) }));
    else if (dayModifiers.priceOnRequest) parts.push(t.day.priceOnRequest);
    if (dayModifiers.checkOutOnly) parts.push(t.day.checkOutOnly);
    if (dayModifiers.selected) parts.push(t.day.selected);
    return parts.join(', ');
  };

  const handleSelect = (_range: unknown, triggerDate: Date) => {
    const day = fromLocalDate(triggerDate);
    if (choosingCheckOut && selection.checkIn !== null) {
      const checkIn = selection.checkIn;
      if (day === checkIn) {
        select(EMPTY_SELECTION);
      } else if (inCheckOutWindow(day)) {
        select({ checkIn, checkOut: day });
      } else {
        const crossed = day > checkIn ? eachNight(checkIn, day).find((night) => nightCodeOn(night, today, nights) === 'b') : undefined;
        select({ checkIn: day, checkOut: null }, crossed ?? null);
      }
    } else {
      select({ checkIn: day, checkOut: null });
    }
  };

  const handleMonthChange = (next: Date) => {
    if (!wideScreen) {
      // Stacked months never page: keyboard moves past the last month add months instead.
      setShownMonths((count) => stackedMonthsFor(today, fromLocalDate(next), count, totalMonths));
      return;
    }
    setTurn((previous) => ({ direction: next > month ? 'next' : 'prev', count: (previous?.count ?? 0) + 1 }));
    setMonth(next);
  };

  const quote = validation?.ok ? quoteStay(validation.checkIn, validation.checkOut, rates, CLIMATE_FEE_SCHEDULE) : null;
  const feeGroups = validation?.ok ? climateFeeGroups(validation.checkIn, validation.checkOut, CLIMATE_FEE_SCHEDULE) : [];
  const minimumNights = selection.checkIn === null ? 1 : minimumNightsFor(selection.checkIn, rates);

  // The live note inside the calendar (polite): what to do next, the minimum stay and the crossing rule.
  const note: string[] = [];
  let noteIsWarning = false;
  if (selection.checkIn === null) {
    note.push(t.prompts.checkIn);
  } else if (checkOutDays !== null) {
    if (crossedNight !== null) {
      note.push(fill(t.prompts.crossing, { booked: formatStayDate(crossedNight, locale), date: formatStayDate(selection.checkIn, locale) }));
      noteIsWarning = true;
    }
    note.push(fill(t.prompts.checkOut, { date: formatStayDate(checkOutDays.last, locale) }));
    if (minimumNights > 1) {
      note.push(fill(t.prompts.minimumStay, { nights: nightsLabel(minimumNights, t.nights, locale) }));
      noteIsWarning = true;
    }
  }

  const first = toLocalDate(today);
  const last = toLocalDate(horizonEnd);
  const visibleMonths = wideScreen ? 2 : Math.min(shownMonths, totalMonths);
  const secondMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
  const canGoBack = month > new Date(first.getFullYear(), first.getMonth(), 1);
  const canGoForward = secondMonth < new Date(last.getFullYear(), last.getMonth(), 1);

  const turnTo = (direction: 'next' | 'prev') => {
    handleMonthChange(new Date(month.getFullYear(), month.getMonth() + (direction === 'next' ? 1 : -1), 1));
  };

  const scrollToCard = () => {
    const card = cardRef.current;
    if (card === null) return;
    card.scrollIntoView({ block: 'start' });
    card.focus({ preventScroll: true });
  };

  return (
    <div className="planner">
      <div className="planner__calendar">
        <div className="planner__toolbar">
          {wideScreen ? (
            <div className="planner__nav">
              <IconButton label={t.previousMonths} disabled={!canGoBack} onClick={() => turnTo('prev')}>
                <Icon name="chevron-left" size={20} />
              </IconButton>
              <IconButton label={t.nextMonths} disabled={!canGoForward} onClick={() => turnTo('next')}>
                <Icon name="chevron-right" size={20} />
              </IconButton>
            </div>
          ) : null}
          {selection.checkIn === null ? null : (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm planner__clear" onClick={() => select(EMPTY_SELECTION)}>
              {t.clearDates}
            </button>
          )}
        </div>

        <Callout variant={noteIsWarning ? 'warning' : 'info'} role="status" hidden={note.length === 0} className="cal-note">
          {note.map((line) => <p key={line} className="ui-callout__text">{line}</p>)}
        </Callout>

        <div role="group" aria-label={t.calendarLabel}>
          <DayCellContext.Provider value={cellFor}>
            <DayPicker
              mode="range"
              selected={selection.checkIn === null
                ? undefined
                : { from: toLocalDate(selection.checkIn), to: selection.checkOut === null ? undefined : toLocalDate(selection.checkOut) }}
              onSelect={handleSelect}
              disabled={isDisabled}
              modifiers={modifiers}
              modifiersClassNames={MODIFIER_CLASSES}
              classNames={CALENDAR_CLASSES}
              today={first}
              month={wideScreen ? month : first}
              onMonthChange={handleMonthChange}
              startMonth={first}
              endMonth={last}
              numberOfMonths={visibleMonths}
              hideNavigation
              showOutsideDays={false}
              locale={DAY_PICKER_LOCALES[locale]}
              labels={{ labelDayButton }}
              components={{ DayButton: PricedDayButton, Weekday: WeekdayHeader }}
              data-layout={wideScreen ? 'pair' : 'stack'}
              data-turn={turn?.direction}
              data-turn-parity={turn === null ? undefined : turn.count % 2}
            />
          </DayCellContext.Provider>
        </div>

        {!wideScreen && visibleMonths < totalMonths ? (
          <button
            type="button"
            className="ui-btn ui-btn--secondary ui-btn--md ui-btn--block planner__more"
            onClick={() => setShownMonths((shown) => Math.min(shown + STACK_STEP, totalMonths))}
          >
            {t.showMoreMonths}
          </button>
        ) : null}

        <div className="cal-legend">
          <p className="cal-legend__title">{t.legendTitle}</p>
          <ul className="cal-legend__list">
            <li className="cal-legend__item"><span aria-hidden="true" className="cal-legend__swatch cal-legend__swatch--free">€</span>{t.legend.free}</li>
            {bestPrice === null ? null : (
              <li className="cal-legend__item"><span aria-hidden="true" className="cal-legend__swatch cal-legend__swatch--best">€</span>{t.legend.best}</li>
            )}
            <li className="cal-legend__item"><span aria-hidden="true" className="cal-legend__swatch cal-legend__swatch--booked" />{t.legend.booked}</li>
            <li className="cal-legend__item"><span aria-hidden="true" className="cal-legend__swatch cal-legend__swatch--free" />{t.legend.priceOnRequest}</li>
            <li className="cal-legend__item"><span aria-hidden="true" className="cal-legend__swatch cal-legend__swatch--stay" />{t.legend.selected}</li>
          </ul>
        </div>
      </div>

      <div className="planner__summary">
        <StaySummary
          ref={cardRef}
          locale={locale}
          checkIn={selection.checkIn}
          checkOut={selection.checkOut}
          validation={validation}
          quote={quote}
          feeGroups={feeGroups}
          minimumNights={minimumNights}
          stay={stay}
        />
      </div>

      {quote !== null && stay !== undefined && !cardInView ? (
        <QuoteBar locale={locale} quote={quote} stay={stay} onDetails={scrollToCard} />
      ) : null}
    </div>
  );
}
