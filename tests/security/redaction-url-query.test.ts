import { describe, expect, it } from 'vitest';

import { stripUrlQueryAndFragment } from '@/lib/redaction';

const HOST = 'https://guest-guide.test';

describe('stripUrlQueryAndFragment', () => {
  it.each([
    ['a Chromium frame with a function name', `    at load (${HOST}/_next/static/chunks/app.js?token=SECRETVALUE#section:10:20)`, `    at load (${HOST}/_next/static/chunks/app.js:10:20)`],
    ['a Chromium frame without a function name', `    at ${HOST}/_next/static/chunks/app.js?claim=abc123:7:9`, `    at ${HOST}/_next/static/chunks/app.js:7:9`],
    ['a Firefox or Safari frame', `load@${HOST}/_next/static/chunks/app.js?v=3&email=guest:44:5`, `load@${HOST}/_next/static/chunks/app.js:44:5`],
    ['a frame with a fragment only', `    at f (${HOST}/page.js#access_token=abc:3:4)`, `    at f (${HOST}/page.js:3:4)`],
    ['a frame with no position', `    at f (${HOST}/page.js?x=1)`, `    at f (${HOST}/page.js)`],
    ['a relative file name', 'main.js?v=abcdef', 'main.js'],
    ['a URL inside a message, in quotes', `Failed to fetch "${HOST}/api/portal/claims?claim=abc#top"`, `Failed to fetch "${HOST}/api/portal/claims"`],
    ['several locations in several lines', `a (${HOST}/a.js?x=1:1:2)\nb (${HOST}/b.js#y:3:4)`, `a (${HOST}/a.js:1:2)\nb (${HOST}/b.js:3:4)`],
  ])('removes the query string and fragment of %s', (_label, input, expected) => {
    const stripped = stripUrlQueryAndFragment(input);

    expect(stripped).toBe(expected);
    expect(stripped).not.toMatch(/SECRETVALUE|abc123|access_token|email=|claim=/u);
  });

  it('keeps text that has no location with a query or fragment', () => {
    for (const text of [
      'TypeError: x is not a function',
      `    at f (${HOST}/_next/static/chunks/app.js:10:20)`,
      'Is this OK? Item #3 failed, see line 4: what?',
      'Error: Unexpected token < in JSON at position 0',
      '',
    ]) {
      expect(stripUrlQueryAndFragment(text)).toBe(text);
    }
  });

  it('leaves a word without a path or a dot before the ? or # untouched', () => {
    expect(stripUrlQueryAndFragment('#anchor ?query what?')).toBe('#anchor ?query what?');
  });
});
