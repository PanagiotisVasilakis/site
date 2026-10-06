import { describe, expect, it } from 'vitest';

import { formatCents, formatCentsShort, parseEuroInputToCents } from '@/lib/availability/money';

const NBSP = ' ';

describe('parseEuroInputToCents', () => {
  it.each([
    ['85', 8500],
    ['85.50', 8550],
    ['85,50', 8550],
    ['85.5', 8550],
    ['85,05', 8505],
    ['0.99', 99],
    ['0', 0],
    ['  120 ', 12000],
    ['1234,56', 123456],
  ])('parses %j as %i cents', (input, cents) => {
    expect(parseEuroInputToCents(input)).toBe(cents);
  });

  it.each([
    '85.555',
    '-1',
    '+1',
    '',
    '   ',
    '1e3',
    'abc',
    '85€',
    '€85',
    '85.',
    '.50',
    ',5',
    '1.000,50',
    '1,000.50',
    '85..50',
    '85 50',
    '0x10',
    'Infinity',
    'NaN',
    '８５',
    '90071992547410',
    '9007199254740993',
  ])('rejects %j', (input) => {
    expect(parseEuroInputToCents(input)).toBeNull();
  });

  it('accepts the largest amount that stays a safe integer number of cents', () => {
    expect(parseEuroInputToCents('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    expect(parseEuroInputToCents('90071992547409.92')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats Greek and English prices from exact integer cents', () => {
    expect(formatCents(8550, 'el')).toBe(`85,50${NBSP}€`);
    expect(formatCents(8550, 'en')).toBe('€85.50');
    expect(formatCents(8000, 'el')).toBe(`80,00${NBSP}€`);
    expect(formatCents(5, 'en')).toBe('€0.05');
    expect(formatCents(0, 'el')).toBe(`0,00${NBSP}€`);
    expect(formatCents(123456, 'el')).toBe(`1.234,56${NBSP}€`);
    expect(formatCents(123456, 'en')).toBe('€1,234.56');
    expect(formatCents(-8550, 'el')).toBe(`-85,50${NBSP}€`);
  });

  it('keeps every digit of large amounts', () => {
    expect(formatCents(Number.MAX_SAFE_INTEGER, 'en')).toBe('€90,071,992,547,409.91');
  });

  it.each([85.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %d cents',
    (cents) => {
      expect(() => formatCents(cents, 'en')).toThrow(RangeError);
    },
  );
});

describe('formatCentsShort', () => {
  it('drops the decimals of whole euros', () => {
    expect(formatCentsShort(8000, 'en')).toBe('€80');
    expect(formatCentsShort(8000, 'el')).toBe(`80${NBSP}€`);
    expect(formatCentsShort(0, 'en')).toBe('€0');
    expect(formatCentsShort(123400, 'en')).toBe('€1,234');
    expect(formatCentsShort(123400, 'el')).toBe(`1.234${NBSP}€`);
    expect(formatCentsShort(-2400, 'en')).toBe('-€24');
  });

  it('keeps both decimals otherwise', () => {
    expect(formatCentsShort(8550, 'en')).toBe('€85.50');
    expect(formatCentsShort(8505, 'el')).toBe(`85,05${NBSP}€`);
  });

  it.each([85.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('rejects %d cents', (cents) => {
    expect(() => formatCentsShort(cents, 'en')).toThrow(RangeError);
  });
});
