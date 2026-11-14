// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/en/phones',
  notFound: () => { throw new Error('NEXT_NOT_FOUND'); },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
// The page reads the guide content through these two functions. Each test decides what they serve, so a
// case about a place without a photo or an address never depends on what the committed content holds.
vi.mock('@/lib/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/data')>()),
  getItem: vi.fn(),
  getItemsByCategory: vi.fn(),
}));

import ItemPage from '@/app/[locale]/[category]/[slug]/page';
import { ToastProvider } from '@/components/Toast';
import type { Item } from '@/data/schemas';
import { getItem, getItemsByCategory, toSlug } from '@/lib/data';
import { absUrl } from '@/lib/site';

type Served = Record<string, Item[]>;

/** Makes the page read `served` instead of the committed content. */
function serve(served: Served) {
  vi.mocked(getItemsByCategory).mockImplementation((categoryId) => served[categoryId] ?? []);
  vi.mocked(getItem).mockImplementation((categoryId, slug) => (served[categoryId] ?? []).find((item) => item.slug === slug) ?? null);
}

/** Makes the page read the committed content. */
async function serveCommittedContent() {
  const actual = await vi.importActual<typeof import('@/lib/data')>('@/lib/data');
  vi.mocked(getItemsByCategory).mockImplementation(actual.getItemsByCategory);
  vi.mocked(getItem).mockImplementation(actual.getItem);
  return actual;
}

function fixture(overrides: Partial<Item> & Pick<Item, 'categoryId'>): Item {
  return { id: 'fixture', name: 'Fixture place', slug: 'fixture-place', ...overrides };
}

/** The Place JSON-LD the detail page prints, as the raw script text and as parsed JSON. */
async function placeJsonLd(locale: 'en' | 'el', item: Item) {
  const slug = item.slug ?? toSlug(item.name);
  const { container } = render(<ToastProvider>{await ItemPage({ params: Promise.resolve({ locale, category: item.categoryId, slug }) })}</ToastProvider>);
  const script = container.querySelector('script[type="application/ld+json"]');
  if (!script?.textContent) throw new Error('the detail page printed no JSON-LD');
  return { raw: script.textContent, data: JSON.parse(script.textContent) as Record<string, unknown> };
}

describe('Place JSON-LD of a phones detail page', () => {
  const place = fixture({
    categoryId: 'phones',
    name: 'Fixture office',
    phone: '+30 27210 00000',
    address: '1 Fixture Street',
    address_el: 'Οδός Δοκιμής 1',
    heroImage: '/phones/fixture-hero.webp',
  });

  beforeEach(() => {
    serve({ phones: [place] });
  });

  it('gives the address as a PostalAddress and the image as an absolute URL', async () => {
    const { data } = await placeJsonLd('en', place);

    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Place',
      url: absUrl('/en/phones/fixture-place'),
      telephone: '+30 27210 00000',
      image: absUrl('/phones/fixture-hero.webp'),
      address: { '@type': 'PostalAddress', streetAddress: '1 Fixture Street', addressCountry: 'GR' },
    });
    expect(data.image).toMatch(/^https?:\/\//);
    // The address holds nothing but what the content has: one free-text line, no locality or postcode.
    expect(Object.keys(data.address as object).sort()).toEqual(['@type', 'addressCountry', 'streetAddress']);
  });

  it('localizes the street line and the page url', async () => {
    const { data } = await placeJsonLd('el', place);

    expect(data.address).toEqual({ '@type': 'PostalAddress', streetAddress: 'Οδός Δοκιμής 1', addressCountry: 'GR' });
    expect(data.url).toBe(absUrl('/el/phones/fixture-place'));
  });

  it('falls back to the card image when there is no hero image', async () => {
    const cardOnly = { ...place, heroImage: undefined, image: '/phones/fixture-card.webp' };
    serve({ phones: [cardOnly] });

    const { data } = await placeJsonLd('en', cardOnly);

    expect(data.image).toBe(absUrl('/phones/fixture-card.webp'));
  });

  it('prints no address for a place without one, rather than an empty PostalAddress', async () => {
    const noAddress = { ...place, address: undefined, address_el: undefined };
    serve({ phones: [noAddress] });

    const { data } = await placeJsonLd('en', noAddress);

    expect(data).not.toHaveProperty('address');
    expect(data).toHaveProperty('telephone', '+30 27210 00000');
  });

  it('prints no image for a place without a photo', async () => {
    const noPhoto = { ...place, heroImage: undefined, image: undefined };
    serve({ phones: [noPhoto] });

    const { data } = await placeJsonLd('en', noPhoto);

    expect(data).not.toHaveProperty('image');
  });

  it('escapes characters in the address that could end the script element', async () => {
    const hostile = { ...place, address: 'A </script><b>&amp; Street' };
    serve({ phones: [hostile] });

    const { raw, data } = await placeJsonLd('en', hostile);

    expect(raw).not.toMatch(/[<>&]/);
    expect(raw).toContain('A \\u003c/script\\u003e\\u003cb\\u003e\\u0026amp; Street');
    // The escapes are JSON escapes, so a consumer still reads the original street line.
    expect(data.address).toMatchObject({ streetAddress: 'A </script><b>&amp; Street' });
  });
});

describe('Place JSON-LD of a Kalamata guide detail page', () => {
  const sight = fixture({
    categoryId: 'moments',
    name: 'Fixture sight',
    address: '2 Fixture Square',
    phone: '+30 27210 11111',
    image: '/moments/fixture-card.webp',
    heroImage: '/moments/fixture-hero.webp',
  });

  beforeEach(() => {
    serve({ moments: [sight] });
  });

  it('uses the absolute card image and, as before, no address or telephone', async () => {
    const { data } = await placeJsonLd('en', sight);

    expect(data.image).toBe(absUrl('/moments/fixture-card.webp'));
    expect(data).not.toHaveProperty('address');
    expect(data).not.toHaveProperty('telephone');
  });

  it('prints no image for a place without a photo', async () => {
    const noPhoto = { ...sight, image: undefined, heroImage: undefined };
    serve({ moments: [noPhoto] });

    const { data } = await placeJsonLd('en', noPhoto);

    expect(data).not.toHaveProperty('image');
  });
});

describe('Place JSON-LD of the committed guide content', () => {
  // Whatever the content holds, every detail page prints valid JSON-LD that obeys the same rules.
  it.each(['phones', 'moments'])('is well formed on every %s detail page', async (categoryId) => {
    const actual = await serveCommittedContent();
    const items = actual.getItemsByCategory(categoryId);
    expect(items.length).toBeGreaterThan(0);

    for (const item of items) {
      const { data } = await placeJsonLd('en', item);

      expect(data['@type']).toBe('Place');
      expect(data.url).toBe(absUrl(`/en/${categoryId}/${item.slug}`));
      if ('image' in data) expect(data.image).toMatch(/^https?:\/\/[^/]+\//);
      if (categoryId === 'moments') {
        expect(data).not.toHaveProperty('address');
        expect(data).not.toHaveProperty('telephone');
      } else if ('address' in data) {
        expect(data.address).toMatchObject({ '@type': 'PostalAddress', addressCountry: 'GR' });
        expect((data.address as { streetAddress?: unknown }).streetAddress).toEqual(expect.any(String));
      }
    }
  });
});
