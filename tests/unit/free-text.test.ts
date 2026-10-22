import { describe, expect, it } from 'vitest';

import { stripUnsafeTextCharacters } from '@/lib/validation/freeText';

describe('stripUnsafeTextCharacters', () => {
  it('leaves ordinary text alone: lines, tabs, accents, Greek, emoji and spacing characters', () => {
    const text = 'Late flight\n\tWe land at 16:40 – thanks! Σας ευχαριστούμε, café, 👍\u00A0ok\u202Fnow\u2009';

    expect(stripUnsafeTextCharacters(text)).toBe(text);
    expect(stripUnsafeTextCharacters('')).toBe('');
  });

  it.each([
    ['a right-to-left override that reverses a file name', 'invoice\u202Egpj.exe', 'invoicegpj.exe'],
    ['a left-to-right embedding and its pop', 'a\u202Ab\u202Cc', 'abc'],
    ['bidi isolates', 'x\u2066y\u2067z\u2068w\u2069', 'xyzw'],
    ['a zero-width space inside a word', 'pass\u200Bword', 'password'],
    ['zero-width joiners and the direction marks', 'a\u200Cb\u200Dc\u200Ed\u200Fe', 'abcde'],
    ['a byte order mark', '\uFEFFHello', 'Hello'],
    ['NUL', 'Late\u0000 flight', 'Late flight'],
    ['an escape sequence introducer', 'red\u001B[31m', 'red[31m'],
    ['carriage return, vertical tab and form feed', 'one\r\ntwo\u000Bthree\u000Cfour', 'one\ntwothreefour'],
    ['DEL', 'a\u007Fb', 'ab'],
    ['C1 controls such as NEL and CSI', 'a\u0085b\u009Bc', 'abc'],
  ])('removes %s', (_label, input, expected) => {
    expect(stripUnsafeTextCharacters(input)).toBe(expected);
  });

  it('removes nothing but the listed characters at the edges of each range', () => {
    const removed = ['\u0000', '\u0008', '\u000B', '\u001F', '\u007F', '\u009F', '\u200B', '\u200F', '\u202A', '\u202E', '\u2066', '\u2069', '\uFEFF'];
    const kept = ['\u0009', '\u000A', '\u0020', '\u007E', '\u00A0', '\u200A', '\u2010', '\u2029', '\u202F', '\u2065', '\u206A', '\uFEFE'];

    for (const character of removed) expect(stripUnsafeTextCharacters(`a${character}b`)).toBe('ab');
    for (const character of kept) expect(stripUnsafeTextCharacters(`a${character}b`)).toBe(`a${character}b`);
  });

  it('removes a run of characters and keeps what surrounds them', () => {
    expect(stripUnsafeTextCharacters('\u200B\u200B\u200Bhi\u200E\u200E')).toBe('hi');
    expect(stripUnsafeTextCharacters('\u0000\u202E\uFEFF')).toBe('');
  });
});
