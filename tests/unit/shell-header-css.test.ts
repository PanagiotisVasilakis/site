import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner decision O43: the header bar stays transparent (glass tint and blur, never opaque). Over a photo the
// tint cannot guarantee contrast, so wordmark, nav text and icons get a halo in the page background colour (a
// text-shadow on text, a drop-shadow on SVG icons; docs/design/identity.md §8 SiteHeader). Photos scroll under the
// sticky bar on every page that has them, so the halo belongs to every header variant. FHS-01: it was scoped to
// `.site-header--overlay` (the home hero only), and on /apartment and the guide pages the wordmark, menu and theme
// icons measured 1.2-1.7:1 against the photo.
const SHELL_CSS = readFileSync('src/styles/components/shell.css', 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');

type Rule = { selectors: string[]; body: string };

// The innermost `selectors { declarations }` blocks; shell.css nests nothing deeper than one @media level.
const RULES: Rule[] = [...SHELL_CSS.matchAll(/([^{};]+)\{([^{}]*)\}/gu)]
  .map(([, prelude, body]) => ({ selectors: prelude.split(',').map((selector) => selector.replace(/\s+/gu, ' ').trim()), body }))
  .filter((rule) => !rule.selectors[0].startsWith('@'));

const valueOf = (rule: Rule, property: string): string | undefined => {
  for (const declaration of rule.body.split(';')) {
    const [name, ...value] = declaration.split(':');
    if (name.trim() === property) return value.join(':').replace(/\s+/gu, ' ').trim();
  }
  return undefined;
};

const rulesWith = (property: string) => RULES.filter((rule) => valueOf(rule, property) !== undefined);
const selectorsWith = (property: string) => rulesWith(property).flatMap((rule) => rule.selectors).filter((selector) => selector.includes('.site-header'));
/** A selector scoped to one header variant: `.site-header--overlay`, `--marketing`, `--guide`, `--stay`. */
const variantScoped = (selector: string) => /\.site-header--[\w-]+/u.test(selector);

describe('header legibility over photos (O43, FHS-01)', () => {
  it('parses the header rules (sanity check)', () => {
    expect(RULES.some((rule) => rule.selectors.includes('.site-header'))).toBe(true);
    expect(RULES.some((rule) => rule.selectors.includes('.site-header.site-header--overlay'))).toBe(true);
  });

  it('puts a background-colour halo on the wordmark, the nav links and the sign-out button of every header variant', () => {
    const halo = rulesWith('text-shadow').filter((rule) => rule.selectors.some((selector) => selector.includes('.site-header')));
    expect(halo.flatMap((rule) => rule.selectors).sort()).toEqual([
      '.site-header .site-brand',
      '.site-header .site-header__account',
      '.site-header .site-nav__link',
    ]);
    for (const rule of halo) {
      for (const layer of (valueOf(rule, 'text-shadow') ?? '').split(', ')) expect(layer).toMatch(/^0 0 \d+px var\(--color-bg\)$/u);
    }
  });

  it('puts a background-colour drop-shadow on the brand mark and the icon buttons of every header variant', () => {
    const halo = rulesWith('filter').filter((rule) => rule.selectors.some((selector) => selector.includes('.site-header')));
    expect(halo.flatMap((rule) => rule.selectors).sort()).toEqual(['.site-header .site-brand svg', '.site-header .ui-icon-btn svg']);
    for (const rule of halo) expect(valueOf(rule, 'filter')).toBe('drop-shadow(0 0 2px var(--color-bg))');
  });

  it('does not scope any halo to one header variant, such as the home hero overlay', () => {
    const scoped = ['text-shadow', 'filter', 'box-shadow'].flatMap(selectorsWith).filter(variantScoped);
    expect(scoped).toEqual([]);
  });

  it('keeps the overlay variant a layout rule only (the negative margin that lets the header float over the hero)', () => {
    const overlay = RULES.filter((rule) => rule.selectors.some((selector) => selector.includes('.site-header--overlay')));
    expect(overlay.length).toBeGreaterThan(0);
    for (const rule of overlay) {
      const properties = rule.body.split(';').map((declaration) => declaration.split(':')[0].trim()).filter(Boolean);
      expect(properties).toEqual(['margin-bottom']);
    }
  });

  it('keeps the bar transparent: the glass tint, never an opaque background (O43)', () => {
    const bar = RULES.find((rule) => rule.selectors.length === 1 && rule.selectors[0] === '.site-header');
    expect(bar && valueOf(bar, 'background')).toBe('var(--color-glass)');
    const backgrounds = rulesWith('background').filter((rule) => rule.selectors.some((selector) => /^\.site-header[\w.-]*$/u.test(selector)));
    expect(backgrounds.map((rule) => valueOf(rule, 'background'))).toEqual(['var(--color-glass)']);
  });

  it('gives the wordmark box room for the halo inside its overflow clip, at the same outer size', () => {
    const clip = RULES.find((rule) => rule.selectors.includes('.site-brand .site-brand__name'));
    expect(clip && valueOf(clip, 'overflow')).toBe('hidden');
    const room = RULES.find((rule) => rule.selectors.includes('.site-header .site-brand__name'));
    expect(room && valueOf(room, 'padding')).toBe('3px 6px');
    expect(room && valueOf(room, 'margin')).toBe('-3px -6px');
  });

  it('keeps the focus ring visible over a photo: the ring stays and its offset gap takes the page background colour', () => {
    const ring = RULES.find((rule) => rule.selectors.includes('.shell-link:focus-visible'));
    expect(ring && valueOf(ring, 'outline')).toBe('3px solid var(--color-focus)');
    const offset = ring && valueOf(ring, 'outline-offset');
    expect(offset).toBe('3px');

    const gap = RULES.filter((rule) => rule.selectors.some((selector) => selector.startsWith('.site-header ') && selector.endsWith(':focus-visible')));
    expect(gap.flatMap((rule) => rule.selectors).sort()).toEqual([
      '.site-header .shell-link:not(.ui-seg__item):focus-visible',
      '.site-header .ui-btn:focus-visible',
      '.site-header .ui-icon-btn:focus-visible',
    ]);
    for (const rule of gap) {
      expect(valueOf(rule, 'box-shadow')).toBe(`0 0 0 ${offset} var(--color-bg)`);
      // Nothing in the header takes the ring away.
      expect(valueOf(rule, 'outline')).toBeUndefined();
    }
  });

  it('leaves the segmented items of the language switch out of the gap rule: their opaque pill already fills the gap', () => {
    // LanguageSwitch renders `ui-seg__item shell-link`; the gap shadow would replace the selected item's rest shadow.
    const gap = RULES.filter((rule) => valueOf(rule, 'box-shadow') === '0 0 0 3px var(--color-bg)').flatMap((rule) => rule.selectors);
    expect(gap.length).toBeGreaterThan(0);
    for (const selector of gap.filter((candidate) => candidate.includes('.shell-link'))) expect(selector).toContain(':not(.ui-seg__item)');
  });
});
