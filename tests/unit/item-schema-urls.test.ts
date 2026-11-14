import { describe, expect, it } from 'vitest';

import { ItemSchema } from '@/data/schemas';

const item = { id: 'old-town', categoryId: 'moments', name: 'Old Town' };

// These fields become href attributes (GuideCard, GuideDetail, the map popup), and z.url() alone accepts
// any scheme.
const LINK_FIELDS = ['website', 'directionsUrl'] as const;

// Built from parts: lint:security's no-script-url flags a string literal that starts with the scheme.
const SCRIPT_SCHEME = 'javascript';

const UNSAFE_LINKS = [
  ['a javascript: URL', `${SCRIPT_SCHEME}:alert(1)`],
  ['a javascript: URL in upper case', `${SCRIPT_SCHEME.toUpperCase()}:alert(1)`],
  ['a javascript: URL after a space', ' javascript:alert(1)'],
  ['a javascript: URL split by a tab', 'java\tscript:alert(1)'],
  ['a data: URL', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
  ['a vbscript: URL', 'vbscript:msgbox(1)'],
  ['a blob: URL', 'blob:https://example.com/2f6c4a52-0000-4000-8000-000000000000'],
  ['a file: URL', 'file:///etc/passwd'],
  ['an ftp: URL', 'ftp://example.com/menu.pdf'],
  ['a mailto: link', 'mailto:info@example.com'],
  ['a tel: link', 'tel:+302721026464'],
  ['a protocol-relative URL', '//example.com/old-town'],
  ['a link without a scheme', 'www.example.gr'],
] as const;

describe('item link fields accept only http and https URLs', () => {
  it.each(LINK_FIELDS)('accepts https and http links in %s', (field) => {
    expect(ItemSchema.safeParse({ ...item, [field]: 'https://example.com/old-town?lang=en#map' }).success).toBe(true);
    expect(ItemSchema.safeParse({ ...item, [field]: 'http://example.com/old-town' }).success).toBe(true);
    expect(ItemSchema.safeParse({ ...item, [field]: 'HTTPS://EXAMPLE.COM/' }).success).toBe(true);
  });

  it.each(LINK_FIELDS)('keeps the field optional: %s', (field) => {
    const parsed = ItemSchema.parse(item);

    expect(parsed).not.toHaveProperty(field);
  });

  describe.each(UNSAFE_LINKS)('%s', (_name, link) => {
    it.each(LINK_FIELDS)('is rejected in %s', (field) => {
      const result = ItemSchema.safeParse({ ...item, [field]: link });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([expect.objectContaining({ path: [field], code: 'invalid_format' })]);
    });

    it('is rejected in sourceUrls, even next to a valid link', () => {
      const result = ItemSchema.safeParse({ ...item, sourceUrls: ['https://example.com/a', link] });

      expect(result.success).toBe(false);
      expect(result.error?.issues).toEqual([expect.objectContaining({ path: ['sourceUrls', 1], code: 'invalid_format' })]);
    });
  });

  it('accepts a list of http and https source URLs and returns them unchanged', () => {
    const sourceUrls = ['https://example.com/a', 'http://example.org/b?x=1'];

    expect(ItemSchema.parse({ ...item, sourceUrls }).sourceUrls).toEqual(sourceUrls);
  });
});
