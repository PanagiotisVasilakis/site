// Blocked nights from the Booking.com calendar export (iCalendar, RFC 5545,
// https://www.rfc-editor.org/rfc/rfc5545). A strict subset: only VEVENT
// components directly inside the VCALENDAR are read, and of those only
// DTSTART and DTEND with DATE values, DURATION in whole days or weeks, and
// STATUS. SUMMARY is never read, so a reservation and a closed period are
// alike: every event that is not cancelled blocks its nights. An export can
// carry personal data in other properties (for example SUMMARY or
// DESCRIPTION), so nothing but dates is kept: results hold dates only, and
// errors hold a code and at most a line number, never input text. Components
// other than VEVENT are skipped unread, though their lines must still be
// well formed and balanced. These throw: a text over the size caps, text
// that is not exactly one well formed, balanced VCALENDAR, a nested
// VCALENDAR, a misplaced VEVENT, and an event with a recurrence property, a
// missing DTSTART, a repeated or conflicting DTSTART, DTEND, DURATION or
// STATUS, a value that is not a valid DATE or DURATION, or an end on or
// before its start or after the year 9999. A silently missed blocked night
// is worse than a failed sync.
//
// Two kinds of event are set aside before their dates are validated, because
// neither can block a night that is still to come: an event with exactly one
// STATUS, CANCELLED (it blocks nothing, whatever its other properties say),
// and, when the caller passes `today`, an event that lies wholly in the past.
// The second is judged leniently from the raw values (a DATE-TIME counts by
// its date) and only when every start, end and duration it has can be read:
// a recurrence, a missing DTSTART or an unreadable value keeps the event
// strict, and so does an end within PAST_GRACE_DAYS of today. The line
// structure of every event stays strict either way.

import { addDays, parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';

type BlockedRange = { start: IsoDate; end: IsoDate };

const MAX_TEXT_BYTES = 1_048_576; // 1 MiB of UTF-8
const MAX_LINES = 50_000; // physical lines, before unfolding
const MAX_EVENTS = 5_000; // VEVENT components, cancelled ones included
/**
 * An event that fails validation is set aside as past only when it lay before today minus this many
 * days: more than any UTC offset, so a DATE-TIME read by its date cannot hide a night that is still ahead.
 */
const PAST_GRACE_DAYS = 2;

const NAME = /^[A-Za-z0-9-]+$/;
const DATE_VALUE = /^[0-9]{8}$/;
const DATE_TIME_VALUE = /^[0-9]{8}T[0-9]{6}Z?$/i;
const DURATION_VALUE = /^P([0-9]{1,5})([DW])$/;

const SINGLE_PROPERTIES = new Set(['DTSTART', 'DTEND', 'DURATION', 'STATUS']);
const RECURRENCE_PROPERTIES = new Set(['RRULE', 'RDATE', 'EXDATE', 'RECURRENCE-ID']);

export type IcalParseErrorCode =
  | 'too_large'
  | 'too_many_lines'
  | 'too_many_events'
  /**
   * No valid property name, no ':' outside double quotes, a parameter without name=value, or a
   * BEGIN/END value that is not a component name.
   */
  | 'malformed_line'
  /** The text is not exactly one VCALENDAR object. */
  | 'not_vcalendar'
  /** An END that does not close the open component, or a component still open at the end. */
  | 'unbalanced'
  /** A nested VCALENDAR, or a VEVENT that is not directly inside the VCALENDAR. */
  | 'unexpected_component'
  /** A VEVENT without DTSTART, a repeated DTSTART/DTEND/DURATION/STATUS, or DTEND with DURATION. */
  | 'invalid_event'
  /** DTSTART or DTEND is not a DATE value (e.g. DATE-TIME). */
  | 'unsupported_value'
  /** RRULE, RDATE, EXDATE or RECURRENCE-ID. */
  | 'unsupported_recurrence'
  | 'invalid_date'
  /** The event ends on or before its start, or after the year 9999. */
  | 'invalid_range'
  /** DURATION other than P<n>D or P<n>W, or one that ends after the year 9999. */
  | 'invalid_duration';

/**
 * `line` is the 1-based physical line where the offending content line starts.
 * For a missing DTSTART, for an end on or before the start or after the year
 * 9999, and for too_many_events it is the BEGIN:VEVENT line of the event. It
 * is undefined for too_large, for too_many_lines and for a text that ends
 * without a closed VCALENDAR.
 */
export class IcalParseError extends Error {
  readonly code: IcalParseErrorCode;
  readonly line: number | undefined;

  constructor(code: IcalParseErrorCode, line?: number) {
    super(line === undefined ? `iCal ${code}` : `iCal ${code} at line ${line}`);
    this.name = 'IcalParseError';
    this.code = code;
    this.line = line;
  }
}

type ContentLine = { text: string; line: number };
type Property = { name: string; params: Array<{ name: string; value: string }>; value: string };
type EventState = {
  line: number;
  seen: Set<string>;
  start?: IsoDate;
  end?: IsoDate;
  days?: number;
  /** The first problem with the event's own properties; thrown when the event is finished, unless it is set aside. */
  problem?: IcalParseError;
  /** Raw values of the properties that decide whether the event is cancelled or past; they never leave this file. */
  starts: string[];
  ends: string[];
  durations: string[];
  statuses: string[];
  recurring: boolean;
};

/** What the parser may be told about the calendar it reads. */
export type IcalParseOptions = Readonly<{
  /** The property's calendar date today: an event that fails validation and lay wholly before it is set aside. */
  today: IsoDate;
}>;

function contentLines(text: string): ContentLine[] {
  const physical = text.split(/\r?\n/);
  if (physical[physical.length - 1] === '') physical.pop();
  if (physical.length > MAX_LINES) throw new IcalParseError('too_many_lines');

  const lines: ContentLine[] = [];
  physical.forEach((raw, index) => {
    const previous = lines[lines.length - 1];
    // Unfolding: a line end followed by one space or tab continues the previous line.
    if (previous !== undefined && (raw.startsWith(' ') || raw.startsWith('\t'))) {
      previous.text += raw.slice(1);
    } else {
      lines.push({ text: raw, line: index + 1 });
    }
  });
  return lines.filter((entry) => entry.text !== '');
}

function parseProperty({ text, line }: ContentLine): Property {
  // name *(";" param) ":" value; parameter values may quote ';' and ':'.
  const head: string[] = [];
  let segmentStart = 0;
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      quoted = !quoted;
    } else if (!quoted && (char === ';' || char === ':')) {
      head.push(text.slice(segmentStart, index));
      segmentStart = index + 1;
      if (char === ':') return buildProperty(head, text.slice(segmentStart), line);
    }
  }
  throw new IcalParseError('malformed_line', line);
}

function buildProperty([name, ...params]: string[], value: string, line: number): Property {
  if (!NAME.test(name)) throw new IcalParseError('malformed_line', line);
  return {
    name: name.toUpperCase(),
    params: params.map((param) => {
      const separator = param.indexOf('=');
      const paramName = param.slice(0, Math.max(separator, 0));
      if (!NAME.test(paramName)) throw new IcalParseError('malformed_line', line);
      return { name: paramName.toUpperCase(), value: param.slice(separator + 1) };
    }),
    value,
  };
}

function componentName(property: Property, line: number): string {
  if (!NAME.test(property.value)) throw new IcalParseError('malformed_line', line);
  return property.value.toUpperCase();
}

function parseDate(property: Property, line: number): IsoDate {
  const { value } = property;
  const declaresOtherType = property.params.some(
    (param) => param.name === 'VALUE' && param.value.toUpperCase() !== 'DATE',
  );
  if (declaresOtherType || DATE_TIME_VALUE.test(value)) throw new IcalParseError('unsupported_value', line);
  const date = DATE_VALUE.test(value)
    ? parseIsoDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`)
    : null;
  if (date === null) throw new IcalParseError('invalid_date', line);
  return date;
}

function durationDays(value: string): number | null {
  const match = DURATION_VALUE.exec(value.toUpperCase());
  return match === null ? null : Number(match[1]) * (match[2] === 'W' ? 7 : 1);
}

/** Keeps the raw value of a property that bears on whether the event is cancelled or past. */
function recordEventProperty(event: EventState, property: Property): void {
  if (RECURRENCE_PROPERTIES.has(property.name)) event.recurring = true;
  else if (property.name === 'DTSTART') event.starts.push(property.value);
  else if (property.name === 'DTEND') event.ends.push(property.value);
  else if (property.name === 'DURATION') event.durations.push(property.value);
  else if (property.name === 'STATUS') event.statuses.push(property.value);
}

/** Reads one property of an event. A problem is kept, not thrown: finishEvent decides whether the event still fails. */
function readEventProperty(event: EventState, property: Property, line: number): void {
  recordEventProperty(event, property);
  if (event.problem !== undefined) return;
  try {
    validateEventProperty(event, property, line);
  } catch (error) {
    if (!(error instanceof IcalParseError)) throw error;
    event.problem = error;
  }
}

function validateEventProperty(event: EventState, property: Property, line: number): void {
  if (RECURRENCE_PROPERTIES.has(property.name)) throw new IcalParseError('unsupported_recurrence', line);
  if (!SINGLE_PROPERTIES.has(property.name)) return; // SUMMARY, DESCRIPTION, UID...: dropped unread

  // An event has one end: DTEND or DURATION (RFC 5545 section 3.6.1).
  const key = property.name === 'DURATION' ? 'DTEND' : property.name;
  if (event.seen.has(key)) throw new IcalParseError('invalid_event', line);
  event.seen.add(key);

  switch (property.name) {
    case 'DTSTART':
      event.start = parseDate(property, line);
      break;
    case 'DTEND':
      event.end = parseDate(property, line);
      break;
    case 'DURATION': {
      const days = durationDays(property.value);
      if (days === null) throw new IcalParseError('invalid_duration', line);
      event.days = days;
      break;
    }
  }
}

function eventRange(event: EventState): BlockedRange {
  if (event.problem !== undefined) throw event.problem;
  const { start, line } = event;
  if (start === undefined) throw new IcalParseError('invalid_event', line);
  let end = event.end;
  if (end === undefined) {
    // Without DTEND or DURATION a DATE event lasts one day (RFC 5545 section 3.6.1).
    try {
      end = addDays(start, event.days ?? 1);
    } catch {
      throw new IcalParseError(event.days === undefined ? 'invalid_range' : 'invalid_duration', line);
    }
  }
  if (end <= start) throw new IcalParseError('invalid_range', line);
  return { start, end };
}

/** Exactly one STATUS, and it is CANCELLED: a repeated STATUS is a conflict, not a cancellation. */
function isCancelled(event: EventState): boolean {
  return event.statuses.length === 1 && event.statuses[0].toUpperCase() === 'CANCELLED';
}

/** The date of a DATE value, or of a DATE-TIME value by its date; null for anything else. */
function lenientDay(value: string): IsoDate | null {
  if (!DATE_VALUE.test(value) && !DATE_TIME_VALUE.test(value)) return null;
  return parseIsoDate(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`);
}

function lenientDays(values: readonly string[]): IsoDate[] | null {
  const days: IsoDate[] = [];
  for (const value of values) {
    const day = lenientDay(value);
    if (day === null) return null;
    days.push(day);
  }
  return days;
}

/**
 * True only when the event provably lay before `cutoff`: every start, every end and every start plus
 * duration it carries (or its one day, when it has no end) is earlier. Anything doubtful says false:
 * a recurrence, a missing DTSTART, a start, end or duration that cannot be read. False keeps the event
 * strict, so a night that might still be ahead is never dropped.
 */
function endedBefore(event: EventState, cutoff: IsoDate): boolean {
  if (event.recurring) return false;
  const starts = lenientDays(event.starts);
  const ends = lenientDays(event.ends);
  if (starts === null || ends === null || starts.length === 0) return false;

  const latestStart = starts.reduce((latest, day) => (day > latest ? day : latest));
  const reached = [...starts, ...ends];
  try {
    for (const value of event.durations) {
      const days = durationDays(value);
      if (days === null) return false;
      reached.push(addDays(latestStart, days));
    }
    if (ends.length === 0 && event.durations.length === 0) reached.push(addDays(latestStart, 1));
  } catch {
    return false;
  }
  return reached.every((day) => day < cutoff);
}

/**
 * The nights a finished event blocks, or null when it blocks none: it is cancelled, or (with a cutoff) it
 * fails validation but lay wholly before the cutoff. Otherwise throws the event's first problem.
 */
function finishEvent(event: EventState, cutoff: IsoDate | null): BlockedRange | null {
  if (isCancelled(event)) return null;
  try {
    return eventRange(event);
  } catch (error) {
    if (error instanceof IcalParseError && cutoff !== null && endedBefore(event, cutoff)) return null;
    throw error;
  }
}

function mergeRanges(ranges: BlockedRange[]): BlockedRange[] {
  const sorted = [...ranges].sort((a, b) => (a.start === b.start ? 0 : a.start < b.start ? -1 : 1));
  const merged: BlockedRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && range.start <= last.end) {
      if (range.end > last.end) last.end = range.end;
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }
  return merged;
}

/**
 * The blocked nights of an iCalendar text as ranges start..end (end
 * exclusive, like DTEND). Every VEVENT that is not STATUS:CANCELLED blocks its
 * nights; a cancelled event is set aside without validating its dates, and so
 * is an event that fails validation but lay wholly before `options.today` minus
 * PAST_GRACE_DAYS (see the top of this file). The result is sorted by start,
 * and overlapping or adjacent ranges are merged, so no two ranges touch.
 * Components other than VEVENT are skipped unread. Throws IcalParseError for
 * the cases listed at the top of this file.
 */
export function parseBlockedRanges(text: string, options?: IcalParseOptions): BlockedRange[] {
  if (text.length > MAX_TEXT_BYTES || new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
    throw new IcalParseError('too_large');
  }
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const cutoff = options === undefined ? null : addDays(options.today, -PAST_GRACE_DAYS);

  const stack: string[] = [];
  const ranges: BlockedRange[] = [];
  let closed = false;
  let eventCount = 0;
  let event: EventState | null = null;

  for (const content of contentLines(body)) {
    const { line } = content;
    const property = parseProperty(content);
    if (closed) throw new IcalParseError('not_vcalendar', line);

    if (stack.length === 0) {
      if (property.name !== 'BEGIN' || componentName(property, line) !== 'VCALENDAR') {
        throw new IcalParseError('not_vcalendar', line);
      }
      stack.push('VCALENDAR');
    } else if (property.name === 'BEGIN') {
      const component = componentName(property, line);
      if (component === 'VCALENDAR' || (component === 'VEVENT' && stack.length !== 1)) {
        throw new IcalParseError('unexpected_component', line);
      }
      if (component === 'VEVENT') {
        eventCount += 1;
        if (eventCount > MAX_EVENTS) throw new IcalParseError('too_many_events', line);
        event = { line, seen: new Set(), starts: [], ends: [], durations: [], statuses: [], recurring: false };
      }
      stack.push(component);
    } else if (property.name === 'END') {
      if (componentName(property, line) !== stack[stack.length - 1]) throw new IcalParseError('unbalanced', line);
      stack.pop();
      if (event !== null && stack.length === 1) {
        const range = finishEvent(event, cutoff);
        if (range !== null) ranges.push(range);
        event = null;
      }
      closed = stack.length === 0;
    } else if (event !== null && stack.length === 2) {
      // Only the event's own properties: those of a nested VALARM are ignored.
      readEventProperty(event, property, line);
    }
  }

  if (!closed) throw new IcalParseError(stack.length === 0 ? 'not_vcalendar' : 'unbalanced');
  return mergeRanges(ranges);
}
