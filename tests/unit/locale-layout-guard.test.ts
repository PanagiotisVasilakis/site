import { describe, expect, it } from 'vitest';

import LocaleLayout from '@/app/[locale]/layout';
import { normalizeLocale } from '@/i18n/config';

// notFound() throws an error with this digest; Next answers it with a 404 and the not-found page.
const NOT_FOUND_DIGEST = /^NEXT_HTTP_ERROR_FALLBACK;404$/;

const renderLayout = (locale: string) => LocaleLayout({ children: null, params: Promise.resolve({ locale }) });

// The proxy matcher skips dotted and _next… paths, so these first segments reach the [locale] tree
// without the security headers. The layout must answer 404 for them instead of an English page.
describe('locale layout guard', () => {
  it.each(['x.y', '_nextfoo', 'admin'])('answers 404 for the unsupported locale segment %j', async (locale) => {
    await expect(renderLayout(locale)).rejects.toMatchObject({ digest: expect.stringMatching(NOT_FOUND_DIGEST) });
  });

  it('still renders the layout for the supported locale en', async () => {
    const tree = await renderLayout('en');

    expect(tree.props).toMatchObject({ 'data-locale': 'en', lang: 'en' });
  });
});

describe('normalizeLocale', () => {
  it.each([
    ['el', 'el'],
    ['EL', 'en'],
    [null, 'en'],
    ['../el', 'en'],
  ] as const)('maps %j to %s', (value, expected) => {
    expect(normalizeLocale(value)).toBe(expected);
  });
});
