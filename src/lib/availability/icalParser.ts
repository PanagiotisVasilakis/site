// Blocked nights from the Airbnb calendar export (iCalendar, RFC 5545,
// https://www.rfc-editor.org/rfc/rfc5545). A strict subset: only VEVENT
// components directly inside the VCALENDAR are read, and of those only
// DTSTART, DTEND and DURATION with DATE values, STATUS and the recurrence
// properties. The export can carry personal data (DESCRIPTION holds a
// reservation URL and the last digits of the guest's phone), so every other
// property is dropped: results hold dates only, and errors hold a code and at
// most a line number, never input text. Anything outside the subset throws,
// because a silently missed blocked night is worse than a failed sync.

import { addDays, parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';

type BlockedRange = { start: IsoDate; end: IsoDate };

const MAX_TEXT_BYTES = 1_048_576; // 1 MiB of UTF-8
const MAX_LINES = 50_000; // physical lines, before unfolding
const MAX_EVENTS = 5_000; // VEVENT components, cancelled ones included

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
  /** No valid property name, no ':' outside double quotes, or a parameter without name=value. */
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
 * `line` is the 1-based physical line where the offending content line starts
 * (for event-level errors, the BEGIN:VEVENT line); size caps have none.
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
type EventState = { line: number; seen: Set<string>; start?: IsoDate; end?: IsoDate; days?: number; cancelled: boolean };

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

function parseDurationDays(value: string, line: number): number {
  const match = DURATION_VALUE.exec(value.toUpperCase());
  if (match === null) throw new IcalParseError('invalid_duration', line);
  return Number(match[1]) * (match[2] === 'W' ? 7 : 1);
}

function readEventProperty(event: EventState, property: Property, line: number): void {
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
    case 'DURATION':
      event.days = parseDurationDays(property.value, line);
      break;
    case 'STATUS':
      event.cancelled = property.value.toUpperCase() === 'CANCELLED';
      break;
  }
}

function eventRange(event: EventState): BlockedRange {
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
 * nights. The result is sorted by start, and overlapping or adjacent ranges
 * are merged, so no two ranges touch. Throws IcalParseError for anything
 * outside the supported subset.
 */
export function parseBlockedRanges(text: string): BlockedRange[] {
  if (text.length > MAX_TEXT_BYTES || new TextEncoder().encode(text).byteLength > MAX_TEXT_BYTES) {
    throw new IcalParseError('too_large');
  }
  const body = text.startsWith('﻿') ? text.slice(1) : text;

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
        event = { line, seen: new Set(), cancelled: false };
      }
      stack.push(component);
    } else if (property.name === 'END') {
      if (componentName(property, line) !== stack[stack.length - 1]) throw new IcalParseError('unbalanced', line);
      stack.pop();
      if (event !== null && stack.length === 1) {
        const range = eventRange(event);
        if (!event.cancelled) ranges.push(range);
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
