import { describe, expect, it } from 'vitest';

import { addDays, parseIsoDate, type IsoDate } from '@/lib/availability/calendarDate';
import { IcalParseError, parseBlockedRanges, type IcalParseErrorCode } from '@/lib/availability/icalParser';

// Synthetic fixtures shaped like an Airbnb "Export calendar" feed. Only the
// shape is realistic: the UIDs, dates, reservation code and phone digits are
// made up. HMSENTINEL and 4821 stand in for the personal data Airbnb puts in
// DESCRIPTION (reservation URL, last 4 digits of the guest's phone).
const PII_SENTINELS = ['HMSENTINEL', '4821'];

const CRLF = '\r\n';

const AIRBNB_HEADER = [
  'BEGIN:VCALENDAR',
  'PRODID;X-RICAL-TZSOURCE=TZINFO:-//Airbnb Inc//Hosting Calendar 0.8.8//EN',
  'CALSCALE:GREGORIAN',
  'VERSION:2.0',
];
const FIRST_BODY_LINE = AIRBNB_HEADER.length + 1;

const RESERVED_EVENT = [
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261004',
  'DTSTART;VALUE=DATE:20261001',
  'UID:1418fb94e984-4c7e1f0a9b2d8e3f5a6c7b8d9e0f1a2b@airbnb.com',
  // Folded at 75 octets like the real export.
  'DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/',
  ' details/HMSENTINEL\\nPhone Number (Last 4 Digits): 4821',
  'SUMMARY:Reserved',
  'END:VEVENT',
];

const NOT_AVAILABLE_EVENT = [
  'BEGIN:VEVENT',
  'DTEND;VALUE=DATE:20261020',
  'DTSTART;VALUE=DATE:20261015',
  'UID:7f3a9c2e1b4d-5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c@airbnb.com',
  'SUMMARY:Airbnb (Not available)',
  'END:VEVENT',
];

function calendar(body: readonly string[], eol = CRLF): string {
  return [...AIRBNB_HEADER, ...body, 'END:VCALENDAR'].join(eol) + eol;
}

function vevent(...properties: string[]): string[] {
  return ['BEGIN:VEVENT', ...properties, 'END:VEVENT'];
}

function iso(value: string): IsoDate {
  const parsed = parseIsoDate(value);
  if (parsed === null) throw new Error(`test fixture is not an ISO date: ${value}`);
  return parsed;
}

function icalDate(date: IsoDate): string {
  return date.replaceAll('-', '');
}

function parseError(text: string): IcalParseError {
  try {
    parseBlockedRanges(text);
  } catch (error) {
    if (error instanceof IcalParseError) return error;
    throw error;
  }
  throw new Error('expected an IcalParseError');
}

describe('parseBlockedRanges: Airbnb export', () => {
  const expected = [
    { start: '2026-10-01', end: '2026-10-04' },
    { start: '2026-10-15', end: '2026-10-20' },
  ];

  it('reads Reserved and Not available events with CRLF line ends', () => {
    expect(parseBlockedRanges(calendar([...RESERVED_EVENT, ...NOT_AVAILABLE_EVENT]))).toEqual(expected);
  });

  it('reads the same export with LF line ends', () => {
    expect(parseBlockedRanges(calendar([...RESERVED_EVENT, ...NOT_AVAILABLE_EVENT], '\n'))).toEqual(expected);
  });

  it('strips a UTF-8 byte order mark', () => {
    expect(parseBlockedRanges(`﻿${calendar(NOT_AVAILABLE_EVENT)}`)).toEqual([expected[1]]);
  });

  it('accepts a last line without a line end and skips blank lines', () => {
    const text = [...AIRBNB_HEADER, '', ...NOT_AVAILABLE_EVENT, '', 'END:VCALENDAR'].join(CRLF);
    expect(parseBlockedRanges(`${text}${CRLF}${CRLF}`)).toEqual([expected[1]]);
    expect(parseBlockedRanges(text)).toEqual([expected[1]]);
  });

  it('returns no ranges for a calendar without events', () => {
    expect(parseBlockedRanges(calendar([]))).toEqual([]);
  });
});

describe('parseBlockedRanges: content lines', () => {
  it.each([
    ['CRLF and a space', CRLF, ' '],
    ['LF and a tab', '\n', '\t'],
  ])('unfolds DTSTART folded mid-value with %s', (_label, eol, whitespace) => {
    const text = calendar(vevent(`DTSTART;VALUE=DATE:2026${eol}${whitespace}1001`, 'DTEND;VALUE=DATE:20261003'), eol);
    expect(parseBlockedRanges(text)).toEqual([{ start: '2026-10-01', end: '2026-10-03' }]);
  });

  it('unfolds a line folded inside the property name', () => {
    const text = calendar(vevent(`DTST${CRLF} ART;VALUE=DATE:20261001`, 'DTEND;VALUE=DATE:20261003'));
    expect(parseBlockedRanges(text)).toEqual([{ start: '2026-10-01', end: '2026-10-03' }]);
  });

  it('removes exactly one whitespace character per fold', () => {
    const text = calendar(vevent(`DTSTART;VALUE=DATE:2026${CRLF}  1001`));
    expect(parseError(text)).toMatchObject({ code: 'invalid_date', line: FIRST_BODY_LINE + 1 });
  });

  it('reads property, parameter, component and enumerated values case-insensitively', () => {
    const text = [
      'begin:vcalendar',
      'version:2.0',
      'begin:vevent',
      'dtstart;value=date:20261001',
      'dtend;value=date:20261003',
      'end:vevent',
      'Begin:VEvent',
      'DtStart;Value=Date:20261010',
      'duration:p2d',
      'End:VEvent',
      'begin:vevent',
      'dtstart;value=date:20261020',
      'status:cancelled',
      'end:vevent',
      'end:vcalendar',
    ].join(CRLF);
    expect(parseBlockedRanges(text)).toEqual([
      { start: '2026-10-01', end: '2026-10-03' },
      { start: '2026-10-10', end: '2026-10-12' },
    ]);
  });

  it('takes the value after the first colon outside double quotes', () => {
    const text = calendar(
      vevent(
        'DTSTART;X-NOTE="check-in: 15:00";VALUE=DATE:20261001',
        'DTEND;VALUE=DATE:20261003',
        'DESCRIPTION;ALTREP="cid:part1.0001@example.org":Reserved',
      ),
    );
    expect(parseBlockedRanges(text)).toEqual([{ start: '2026-10-01', end: '2026-10-03' }]);
  });

  it.each([
    ['no colon', 'SUMMARY Reserved'],
    ['an unterminated quoted parameter', 'SUMMARY;X-NOTE="Reserved:yes'],
    ['an empty property name', ';VALUE=DATE:20261001'],
    ['an invalid property name', 'DT START;VALUE=DATE:20261001'],
    ['a parameter without "="', 'DTSTART;VALUE:20261001'],
    ['a parameter without a name', 'DTSTART;=DATE:20261001'],
    ['an invalid component name', 'BEGIN:V EVENT'],
  ])('rejects a line with %s', (_label, line) => {
    expect(parseError(calendar([line]))).toMatchObject({ code: 'malformed_line', line: FIRST_BODY_LINE });
  });

  it('rejects a first line that is a continuation', () => {
    expect(parseError(` ${calendar([])}`)).toMatchObject({ code: 'malformed_line', line: 1 });
  });
});

describe('parseBlockedRanges: event dates', () => {
  it('accepts a bare 8-digit date without VALUE=DATE', () => {
    const text = calendar(vevent('DTSTART:20261001', 'DTEND:20261005'));
    expect(parseBlockedRanges(text)).toEqual([{ start: '2026-10-01', end: '2026-10-05' }]);
  });

  it('treats an event without DTEND or DURATION as one night (RFC 5545 section 3.6.1)', () => {
    const text = calendar(vevent('DTSTART;VALUE=DATE:20261001', 'SUMMARY:Airbnb (Not available)'));
    expect(parseBlockedRanges(text)).toEqual([{ start: '2026-10-01', end: '2026-10-02' }]);
  });

  it.each([
    ['P3D', '2026-10-04'],
    ['P1W', '2026-10-08'],
    ['P2W', '2026-10-15'],
  ])('reads DURATION:%s as whole nights', (duration, end) => {
    const text = calendar(vevent('DTSTART;VALUE=DATE:20261001', `DURATION:${duration}`));
    expect(parseBlockedRanges(text)).toEqual([{ start: '2026-10-01', end }]);
  });

  it.each(['PT24H', 'P1DT12H', 'P1D2W', '-P1D', '+P1D', 'P1M', 'P1Y', 'P', 'P1.5D', 'P1D ', 'P123456D'])(
    'rejects DURATION:%s',
    (duration) => {
      const text = calendar(vevent('DTSTART;VALUE=DATE:20261001', `DURATION:${duration}`));
      expect(parseError(text)).toMatchObject({ code: 'invalid_duration', line: FIRST_BODY_LINE + 2 });
    },
  );

  it('rejects a duration that ends after the year 9999', () => {
    const text = calendar(vevent('DTSTART;VALUE=DATE:99991201', 'DURATION:P99999D'));
    expect(parseError(text)).toMatchObject({ code: 'invalid_duration', line: FIRST_BODY_LINE });
  });

  it('rejects a one-night event on the last supported day', () => {
    const text = calendar(vevent('DTSTART;VALUE=DATE:99991231'));
    expect(parseError(text)).toMatchObject({ code: 'invalid_range', line: FIRST_BODY_LINE });
  });

  it.each([
    ['DTEND before DTSTART', ['DTSTART;VALUE=DATE:20261004', 'DTEND;VALUE=DATE:20261001']],
    ['DTEND equal to DTSTART', ['DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261001']],
    ['a zero duration', ['DTSTART;VALUE=DATE:20261001', 'DURATION:P0D']],
  ])('rejects %s', (_label, properties) => {
    expect(parseError(calendar(vevent(...properties)))).toMatchObject({ code: 'invalid_range', line: FIRST_BODY_LINE });
  });

  it.each([
    'DTSTART:20261001T140000Z',
    'DTSTART:20261001T140000',
    'DTSTART;VALUE=DATE:20261001T140000Z',
    'DTSTART;VALUE=PERIOD:20261001',
    'DTSTART;VALUE=DATE;VALUE=DATE-TIME:20261001',
  ])('rejects the non-DATE value %s', (dtstart) => {
    const text = calendar(vevent(dtstart, 'DTEND;VALUE=DATE:20261003'));
    expect(parseError(text)).toMatchObject({ code: 'unsupported_value', line: FIRST_BODY_LINE + 1 });
  });

  it('rejects a DATE-TIME DTEND', () => {
    const text = calendar(vevent('DTSTART;VALUE=DATE:20261001', 'DTEND:20261003T100000Z'));
    expect(parseError(text)).toMatchObject({ code: 'unsupported_value', line: FIRST_BODY_LINE + 2 });
  });

  it.each([
    // parseIsoDate's calendar rules (leap years, month and day ranges, year 0100 on) are covered in
    // availability-calendar-date.test.ts; here one case per parseDate failure point.
    'DTSTART;VALUE=DATE:20260230',
    'DTSTART;VALUE=DATE:2026-10-01',
    'DTSTART;VALUE=DATE:2026101',
    'DTSTART;VALUE=DATE:202610011',
  ])('rejects the invalid date %s', (dtstart) => {
    expect(parseError(calendar(vevent(dtstart)))).toMatchObject({ code: 'invalid_date', line: FIRST_BODY_LINE + 1 });
  });

  it('rejects an invalid DTEND date', () => {
    const text = calendar(vevent('DTSTART;VALUE=DATE:20260227', 'DTEND;VALUE=DATE:20260230'));
    expect(parseError(text)).toMatchObject({ code: 'invalid_date', line: FIRST_BODY_LINE + 2 });
  });

  it('reports the first physical line of a folded line', () => {
    const text = calendar([
      ...RESERVED_EVENT.slice(0, -1),
      'X-LONG:first part',
      ' second part',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'X-LONG:first part',
      ' second part',
      '\tthird part',
      'DTSTART;VALUE=DATE:2026',
      ' 0230',
      'END:VEVENT',
    ]);
    // RESERVED_EVENT without END is 7 physical lines, then 3 more, then BEGIN and the 3-line fold.
    expect(parseError(text)).toMatchObject({ code: 'invalid_date', line: FIRST_BODY_LINE + 7 + 3 + 1 + 3 });
  });

  it('rejects an event without DTSTART', () => {
    const text = calendar(vevent('DTEND;VALUE=DATE:20261003', 'SUMMARY:Reserved'));
    expect(parseError(text)).toMatchObject({ code: 'invalid_event', line: FIRST_BODY_LINE });
  });

  it.each([
    ['DTSTART', ['DTSTART;VALUE=DATE:20261001', 'DTSTART;VALUE=DATE:20261002']],
    ['DTEND', ['DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261003', 'DTEND;VALUE=DATE:20261004']],
    ['DURATION', ['DTSTART;VALUE=DATE:20261001', 'DURATION:P1D', 'DURATION:P2D']],
    ['STATUS', ['DTSTART;VALUE=DATE:20261001', 'STATUS:CONFIRMED', 'STATUS:CANCELLED']],
    ['DTEND with DURATION', ['DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261003', 'DURATION:P2D']],
    ['DURATION with DTEND', ['DTSTART;VALUE=DATE:20261001', 'DURATION:P2D', 'DTEND;VALUE=DATE:20261003']],
  ])('rejects a repeated %s', (_label, properties) => {
    expect(parseError(calendar(vevent(...properties)))).toMatchObject({
      code: 'invalid_event',
      line: FIRST_BODY_LINE + properties.length,
    });
  });

  it.each([
    'RRULE:FREQ=WEEKLY;COUNT=4',
    'RDATE;VALUE=DATE:20261010',
    'EXDATE;VALUE=DATE:20261008',
    'RECURRENCE-ID;VALUE=DATE:20261001',
    'rrule:freq=daily;count=2',
  ])('rejects the recurrence property %s', (recurrence) => {
    const text = calendar(vevent('DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261003', recurrence));
    expect(parseError(text)).toMatchObject({ code: 'unsupported_recurrence', line: FIRST_BODY_LINE + 3 });
  });

  it('skips cancelled events and keeps confirmed and tentative ones', () => {
    const text = calendar([
      ...vevent('DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261003', 'STATUS:CANCELLED'),
      ...vevent('DTSTART;VALUE=DATE:20261005', 'DTEND;VALUE=DATE:20261006', 'STATUS:CONFIRMED'),
      ...vevent('STATUS:TENTATIVE', 'DTSTART;VALUE=DATE:20261008', 'DTEND;VALUE=DATE:20261009'),
    ]);
    expect(parseBlockedRanges(text)).toEqual([
      { start: '2026-10-05', end: '2026-10-06' },
      { start: '2026-10-08', end: '2026-10-09' },
    ]);
  });
});

describe('parseBlockedRanges: components', () => {
  it.each([
    ['an empty text', ''],
    ['only blank lines', `${CRLF}${CRLF}`],
    ['events without VCALENDAR', [...NOT_AVAILABLE_EVENT].join(CRLF)],
    ['another outer component', ['BEGIN:VTODO', 'END:VTODO'].join(CRLF)],
    ['a property before BEGIN:VCALENDAR', `VERSION:2.0${CRLF}${calendar([])}`],
    ['an END before BEGIN:VCALENDAR', `END:VEVENT${CRLF}${calendar([])}`],
    ['content after END:VCALENDAR', `${calendar([])}X-TRAILER:1${CRLF}`],
    ['a second VCALENDAR', `${calendar([])}${calendar([])}`],
  ])('rejects %s as not_vcalendar', (_label, text) => {
    expect(parseError(text).code).toBe('not_vcalendar');
  });

  it('reports the line of content outside the VCALENDAR', () => {
    expect(parseError(`${calendar([])}X-TRAILER:1${CRLF}`)).toMatchObject({ code: 'not_vcalendar', line: 6 });
  });

  it('rejects an END that does not close the open component', () => {
    const missingEventEnd = calendar(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261001']);
    expect(parseError(missingEventEnd)).toMatchObject({ code: 'unbalanced', line: FIRST_BODY_LINE + 2 });

    const strayEnd = calendar([...NOT_AVAILABLE_EVENT, 'END:VTODO']);
    expect(parseError(strayEnd)).toMatchObject({ code: 'unbalanced', line: FIRST_BODY_LINE + NOT_AVAILABLE_EVENT.length });

    const crossed = calendar(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261001', 'BEGIN:VALARM', 'END:VEVENT', 'END:VALARM']);
    expect(parseError(crossed)).toMatchObject({ code: 'unbalanced', line: FIRST_BODY_LINE + 3 });
  });

  it('rejects a text that ends inside a component', () => {
    const text = [...AIRBNB_HEADER, ...NOT_AVAILABLE_EVENT].join(CRLF);
    const error = parseError(text);
    expect(error.code).toBe('unbalanced');
    expect(error.line).toBeUndefined();
  });

  it.each([
    ['a VEVENT inside a VEVENT', ['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261001', 'BEGIN:VEVENT'], FIRST_BODY_LINE + 2],
    ['a VEVENT inside a VTODO', ['BEGIN:VTODO', 'BEGIN:VEVENT'], FIRST_BODY_LINE + 1],
    ['a nested VCALENDAR', ['BEGIN:VCALENDAR'], FIRST_BODY_LINE],
  ])('rejects %s', (_label, body, line) => {
    expect(parseError(calendar(body))).toMatchObject({ code: 'unexpected_component', line });
  });

  it('ignores a VALARM inside a VEVENT', () => {
    const text = calendar([
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20261001',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-PT15M',
      'DURATION:PT15M',
      'REPEAT:1',
      'DTSTART:20261001T090000Z',
      'END:VALARM',
      'DTEND;VALUE=DATE:20261003',
      'END:VEVENT',
    ]);
    expect(parseBlockedRanges(text)).toEqual([{ start: '2026-10-01', end: '2026-10-03' }]);
  });

  it('ignores VTIMEZONE and VTODO components', () => {
    const text = calendar([
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Athens',
      'BEGIN:STANDARD',
      'DTSTART:19701025T040000',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VTODO',
      'DTSTART:20261001T090000Z',
      'END:VTODO',
      ...NOT_AVAILABLE_EVENT,
    ]);
    expect(parseBlockedRanges(text)).toEqual([{ start: '2026-10-15', end: '2026-10-20' }]);
  });
});

describe('parseBlockedRanges: merging', () => {
  it('returns sorted ranges and merges overlapping and adjacent events (end exclusive)', () => {
    const text = calendar([
      ...vevent('DTSTART;VALUE=DATE:20261015', 'DTEND;VALUE=DATE:20261020'),
      ...vevent('DTSTART;VALUE=DATE:20261001', 'DTEND;VALUE=DATE:20261004'),
      ...vevent('DTSTART;VALUE=DATE:20261010', 'DTEND;VALUE=DATE:20261011'),
      ...vevent('DTSTART;VALUE=DATE:20261003', 'DTEND;VALUE=DATE:20261006'),
      ...vevent('DTSTART;VALUE=DATE:20261016', 'DTEND;VALUE=DATE:20261018'),
      ...vevent('DTSTART;VALUE=DATE:20261006', 'DTEND;VALUE=DATE:20261008'),
      ...vevent('DTSTART;VALUE=DATE:20261015', 'DTEND;VALUE=DATE:20261017'),
    ]);
    expect(parseBlockedRanges(text)).toEqual([
      { start: '2026-10-01', end: '2026-10-08' },
      { start: '2026-10-10', end: '2026-10-11' },
      { start: '2026-10-15', end: '2026-10-20' },
    ]);
  });
});

describe('parseBlockedRanges: caps', () => {
  const MAX_BYTES = 1_048_576;
  const MAX_LINES = 50_000;
  const MAX_EVENTS = 5_000;

  function paddedTo(length: number): string {
    const base = calendar([...NOT_AVAILABLE_EVENT, 'X-PAD:']);
    const text = calendar([...NOT_AVAILABLE_EVENT, `X-PAD:${'a'.repeat(length - base.length)}`]);
    expect(text).toHaveLength(length);
    return text;
  }

  it('accepts 1 MiB of text and rejects one byte more', () => {
    expect(parseBlockedRanges(paddedTo(MAX_BYTES))).toHaveLength(1);
    expect(parseError(paddedTo(MAX_BYTES + 1))).toMatchObject({ code: 'too_large', line: undefined });
  });

  it('counts the cap in UTF-8 bytes', () => {
    const text = calendar([...NOT_AVAILABLE_EVENT, `X-PAD:${'\u00e9'.repeat(MAX_BYTES / 2)}`]);
    expect(text.length).toBeLessThan(MAX_BYTES);
    expect(parseError(text).code).toBe('too_large');
  });

  it('accepts 50,000 physical lines and rejects one more, folded lines included', () => {
    const fixedLines = AIRBNB_HEADER.length + 1;
    const atCap = calendar(Array<string>(MAX_LINES - fixedLines).fill('X-PAD:1'));
    expect(atCap.split(CRLF)).toHaveLength(MAX_LINES + 1);
    expect(parseBlockedRanges(atCap)).toEqual([]);

    const overCap = calendar(['X-PAD:1', ...Array<string>(MAX_LINES - fixedLines).fill(' 1')]);
    expect(parseError(overCap)).toMatchObject({ code: 'too_many_lines', line: undefined });
  });

  function oneNightEvents(count: number): string[] {
    const first = iso('2026-01-01');
    return Array.from({ length: count }, (_, index) =>
      vevent(`DTSTART;VALUE=DATE:${icalDate(addDays(first, index))}`),
    ).flat();
  }

  it('accepts 5,000 events and rejects one more', () => {
    expect(parseBlockedRanges(calendar(oneNightEvents(MAX_EVENTS)))).toEqual([
      { start: '2026-01-01', end: addDays(iso('2026-01-01'), MAX_EVENTS) },
    ]);
    expect(parseError(calendar(oneNightEvents(MAX_EVENTS + 1)))).toMatchObject({
      code: 'too_many_events',
      line: FIRST_BODY_LINE + MAX_EVENTS * 3,
    });
  });

  it('counts cancelled events towards the event cap', () => {
    const cancelled = vevent('DTSTART;VALUE=DATE:20250101', 'STATUS:CANCELLED');
    expect(parseError(calendar([...cancelled, ...oneNightEvents(MAX_EVENTS)])).code).toBe('too_many_events');
  });
});

describe('parseBlockedRanges: personal data', () => {
  function expectNoPersonalData(text: string) {
    for (const sentinel of PII_SENTINELS) {
      expect(text).not.toContain(sentinel);
    }
  }

  it('the fixture carries the personal data it is meant to catch', () => {
    const text = calendar(RESERVED_EVENT);
    for (const sentinel of PII_SENTINELS) {
      expect(text).toContain(sentinel);
    }
  });

  it('returns dates only', () => {
    const result = parseBlockedRanges(calendar([...RESERVED_EVENT, ...NOT_AVAILABLE_EVENT]));
    expectNoPersonalData(JSON.stringify(result));
    for (const range of result) {
      expect(Object.keys(range).sort()).toEqual(['end', 'start']);
    }
  });

  const reservedWithout = (end: string[]) => [...RESERVED_EVENT.slice(0, -1), ...end];

  it.each<[IcalParseErrorCode, string]>([
    ['invalid_date', calendar([...RESERVED_EVENT, ...vevent('DTSTART;VALUE=DATE:HMSENTINEL4821')])],
    [
      'unsupported_value',
      calendar([...RESERVED_EVENT, ...vevent('DTSTART;VALUE=DATE-TIME;X-REF=HMSENTINEL:20261001T048210Z')]),
    ],
    ['unsupported_recurrence', calendar(reservedWithout(['RRULE:FREQ=DAILY;X-REF=HMSENTINEL4821', 'END:VEVENT']))],
    ['malformed_line', calendar(reservedWithout(['X-NOTE HMSENTINEL 4821', 'END:VEVENT']))],
    ['malformed_line', calendar(reservedWithout(['X-NOTE;HMSENTINEL4821:x', 'END:VEVENT']))],
    ['invalid_duration', calendar([...RESERVED_EVENT, ...vevent('DTSTART:20261001', 'DURATION:P4821HMSENTINEL')])],
    ['unbalanced', calendar(reservedWithout(['END:HMSENTINEL4821']))],
    [
      'invalid_range',
      calendar(RESERVED_EVENT.map((line) => (line.startsWith('DTEND') ? 'DTEND;VALUE=DATE:20260920' : line))),
    ],
    ['invalid_event', calendar(reservedWithout(['DTEND;VALUE=DATE:20261010', 'END:VEVENT']))],
    ['not_vcalendar', `X-REF:HMSENTINEL4821${CRLF}${calendar(RESERVED_EVENT)}`],
    ['too_large', calendar([...RESERVED_EVENT, `X-PAD:${'4821HMSENTINEL'.repeat(80_000)}`])],
  ])('a %s error carries no property value', (code, text) => {
    const error = parseError(text);
    expect(error.code).toBe(code);
    expect(error.cause).toBeUndefined();
    expectNoPersonalData(error.message);
    expectNoPersonalData(String(error));
    expectNoPersonalData(JSON.stringify(error));
  });

  it('the message is the code and the line number only', () => {
    const error = parseError(calendar(vevent('DTSTART;VALUE=DATE:20260230')));
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('IcalParseError');
    expect(error.message).toBe(`iCal invalid_date at line ${FIRST_BODY_LINE + 1}`);
    expect(parseError('').message).toBe('iCal not_vcalendar');
  });
});
