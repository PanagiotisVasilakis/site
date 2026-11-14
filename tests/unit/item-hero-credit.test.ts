import { describe, expect, it } from 'vitest';
import { HeroImageCreditSchema, ItemSchema, PROJECT_ARTWORK_HERO_IMAGES } from '@/data/schemas';
import { toGuideEntry } from '@/components/guide/guideEntries';
import { getDictionary } from '@/i18n/dictionaries';

// Built from parts: lint:security's no-script-url flags a string literal that starts with the scheme.
const SCRIPT_LINK = `${'javascript'}:alert(1)`;

const item = { id: 'x', categoryId: 'moments', name: 'Old Town' };
const credit = {
  author: 'A. Photographer',
  license: 'CC BY-SA 4.0',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:Old_Town.jpg',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
};

describe('guide photo credit', () => {
  it('accepts a complete credit and rejects a missing author, licence or source', () => {
    expect(HeroImageCreditSchema.safeParse(credit).success).toBe(true);
    expect(HeroImageCreditSchema.safeParse({ ...credit, licenseUrl: undefined }).success).toBe(true);
    for (const key of ['author', 'license', 'sourceUrl'] as const) {
      expect(HeroImageCreditSchema.safeParse({ ...credit, [key]: undefined }).success).toBe(false);
      expect(HeroImageCreditSchema.safeParse({ ...credit, [key]: '' }).success).toBe(false);
    }
  });

  it('only accepts http(s) links in the credit', () => {
    for (const link of [SCRIPT_LINK, 'data:text/html,x', '//commons.example/x', 'ftp://example.com/x']) {
      expect(HeroImageCreditSchema.safeParse({ ...credit, sourceUrl: link }).success).toBe(false);
      expect(HeroImageCreditSchema.safeParse({ ...credit, licenseUrl: link }).success).toBe(false);
    }
  });

  it('rejects unknown keys in a credit so a typo cannot silently drop the licence', () => {
    expect(HeroImageCreditSchema.safeParse({ ...credit, licence: 'CC0' }).success).toBe(false);
  });

  it('keeps the credit with the photo and drops it for the art tile', () => {
    const t = getDictionary('en');
    const category = { id: 'moments', slug: 'moments', title: 'Moments' };
    const withPhoto = toGuideEntry({ ...item, heroImage: '/moments/old-town.jpg', heroImageCredit: credit }, category, 'en', t);
    expect(withPhoto.photo).toBe('/moments/old-town.jpg');
    expect(withPhoto.photoCredit).toEqual(credit);

    const artwork = [...PROJECT_ARTWORK_HERO_IMAGES][0];
    const art = toGuideEntry({ ...item, heroImage: artwork, heroImageCredit: credit }, category, 'en', t);
    expect(art.photo).toBeUndefined();
    expect(art.photoCredit).toBeUndefined();

    expect(toGuideEntry(item, category, 'en', t).photoCredit).toBeUndefined();
  });

  it('is an optional field of the item schema', () => {
    expect(ItemSchema.safeParse({ ...item, heroImage: '/moments/old-town.jpg', heroImageCredit: credit }).success).toBe(true);
    expect(ItemSchema.safeParse({ ...item, heroImageCredit: { ...credit, sourceUrl: SCRIPT_LINK } }).success).toBe(false);
  });
});
