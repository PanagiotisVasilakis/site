import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// PS-07 (the iOS tip, the BookBar and the network dot share the bottom edge), PS-11 (WCAG 2.5.8 target size) and
// FHS-05 (200 % text: the header, the hero and the buttons reflow). The browser behaviour was measured in Chromium
// on a production build; these pins keep the stylesheet decisions that make it work from being undone by accident.
const SHELL = readFileSync('src/styles/components/shell.css', 'utf8');
const HERO = readFileSync('src/styles/components/hero.css', 'utf8');
const UI = readFileSync('src/styles/components/ui.css', 'utf8');
const STAY = readFileSync('src/styles/components/stay.css', 'utf8');
const GUIDE = readFileSync('src/styles/components/guide.css', 'utf8');

/** The declarations of the top-level rule `selector { … }` (it starts a line, so it is not one inside an at-rule). */
function body(css: string, selector: string): string {
  const start = css.startsWith(`${selector} {`) ? 0 : css.indexOf(`\n${selector} {`) + 1;
  expect(start, `rule ${selector}`).toBeGreaterThan(-1);
  const open = css.indexOf('{', start);
  return css.slice(open + 1, css.indexOf('}', open));
}

/** The declarations of a rule as a property to value map (whitespace collapsed). */
function declarations(block: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const declaration of block.replace(/\/\*[\s\S]*?\*\//gu, '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 0) continue;
    map.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).replace(/\s+/gu, ' ').trim());
  }
  return map;
}
const valueOf = (css: string, selector: string, property: string) => declarations(body(css, selector)).get(property);

describe('fixed controls at the bottom edge keep clear of each other (PS-07)', () => {
  it('lifts the pills above the network dot below sm, 8 px from the edge above it, and honours the safe area', () => {
    expect(valueOf(SHELL, '.pwa-banners', 'bottom')).toBe('calc(var(--pwa-banners-bottom) + env(safe-area-inset-bottom))');
    expect(SHELL).toMatch(/@media \(max-width: 39\.99rem\) \{\s*:root \{ --pwa-banners-bottom: 56px; \}/u);
    expect(valueOf(SHELL, ':root', '--pwa-banners-bottom')).toBe('8px');
  });

  it('moves the pills and the dot with the BookBar, which starts right of the dot below sm', () => {
    expect(valueOf(SHELL, '.pwa-banners', 'translate')).toBe('0 calc(-1 * var(--pills-lift))');
    expect(valueOf(STAY, '.net-status', 'translate')).toBe('0 calc(-1 * (var(--dot-lift, 0px) + env(safe-area-inset-bottom)))');
    expect(SHELL).toMatch(/@media \(max-width: 39\.99rem\) \{\s*\.bookbar \{ left: 56px; \}/u);
    expect(SHELL).toMatch(/:root:has\(\.bookbar\.is-shown\) \{[^}]*--pills-lift:[^}]*--dot-lift:/u);
    // They rise with the bar's slide (M22), under the motion gate; stay.css itself stays free of motion (calm mode).
    expect(SHELL).toMatch(/:root\[data-motion="full"\] \.pwa-banners,\s*:root\[data-motion="full"\] \.net-status \{ transition: translate var\(--dur-ui\) var\(--ease-glide\); \}/u);
  });

  it('keeps the last content clear of a shown pill: footer padding and scroll padding read --pwa-banners-clear', () => {
    expect(valueOf(SHELL, '.site-footer', 'padding-bottom')).toBe('max(calc(48px + env(safe-area-inset-bottom)), var(--pwa-banners-clear))');
    expect(SHELL).toMatch(/:root:has\(\.bookbar\) \.site-footer\.site-footer \{\s*padding-bottom: max\(calc\(96px \+ env\(safe-area-inset-bottom\)\), calc\(var\(--pwa-banners-clear\)/u);
    expect(SHELL).toMatch(/^:root \{ scroll-padding-bottom: var\(--pwa-banners-clear\); \}/mu);
    expect(STAY).toMatch(/:root:has\(\.net-status\) \{ scroll-padding-bottom: max\(calc\(56px \+ env\(safe-area-inset-bottom\)\), var\(--pwa-banners-clear\)\); \}/u);
  });

  it('is zero by default, so a page without a pill is as it was', () => {
    const defaults = declarations(body(SHELL, ':root'));
    expect(defaults.get('--pwa-banners-clear')).toBe('0px');
    expect(defaults.get('--pills-lift')).toBe('0px');
    expect(defaults.get('--dot-lift')).toBe('0px');
  });
});

describe('content reflows at 200 % text instead of being cut (FHS-05)', () => {
  it('lets the header pill grow: a minimum height, never a fixed one', () => {
    const header = declarations(body(SHELL, '.site-header'));
    expect(header.get('min-height')).toBe('var(--header-h)');
    expect(header.has('height')).toBe(false);
  });

  it('lets the wordmark wrap and caps its growth by the room beside the buttons', () => {
    const name = declarations(body(SHELL, '.site-brand .site-brand__name,\n.site-footer .site-brand__name'));
    expect(name.has('white-space')).toBe(false);
    expect(name.has('text-overflow')).toBe(false);
    expect(name.get('overflow-wrap')).toBe('break-word');
    expect(valueOf(SHELL, '.site-header .site-brand .site-brand__name', 'font-size')).toBe('min(1.1875rem, 8.5vw)');
  });

  it('sizes the hero by a minimum height with the text block in the flow, so a larger text grows it', () => {
    const hero = declarations(body(HERO, '.hero'));
    expect(hero.get('min-height')).toBe('max(600px, min(760px, 88svh))');
    expect(hero.has('height')).toBe(false);
    expect(valueOf(HERO, '.hero__stage', 'position')).toBe('relative');
    expect(valueOf(HERO, '.hero__content', 'position')).toBe('relative');
    expect(HERO).toMatch(/@media \(min-width: 768px\) \{\s*\.hero \{ min-height: max\(640px, min\(900px, 88svh\)\); \}/u);
  });

  it('caps the hero heading by the viewport and breaks a word that is still too wide', () => {
    const title = declarations(body(HERO, '.hero .hero__title'));
    expect(title.get('font-size')).toBe('min(var(--text-hero), 24vw)');
    expect(title.get('overflow-wrap')).toBe('break-word');
  });

  it('wraps a button label that does not fit instead of clipping it', () => {
    expect(valueOf(UI, '.ui-btn', 'white-space')).toBe('normal');
    // min-height and block padding, so a wrapped label has room and one line keeps its size.
    expect(UI).toMatch(/\.ui-btn\.ui-btn--sm \{ min-height: 40px; padding: 8px 16px;/u);
    expect(UI).toMatch(/\.ui-btn\.ui-btn--md \{ min-height: 48px; padding: 10px 22px;/u);
    expect(UI).toMatch(/\.ui-btn\.ui-btn--lg \{ min-height: 56px; padding: 12px 28px;/u);
    expect(HERO).toMatch(/\.hero__actions \.ui-btn \{ padding-inline: 18px; \}/u);
  });
});

describe('pointer targets (PS-11, WCAG 2.5.8 and identity §4.4)', () => {
  it('gives a stand-alone arrow link a box of at least 24 px without moving a line', () => {
    const link = declarations(body(UI, '.ui-btn.ui-btn--link-arrow'));
    expect(link.get('padding')).toBe('4px 0');
    expect(link.get('margin-block')).toBe('-4px');
  });

  it('keeps a link that sets its own 44 px height from also taking the negative margin', () => {
    for (const [css, selector] of [
      [GUIDE, '.guide-card .guide-card__directions'],
      [GUIDE, '.guide-detail .guide-back'],
      [STAY, '.status-page .status-page__link'],
      [STAY, '.stay-tile .stay-tile__more'],
      [STAY, '.checkin-portal .checkin-guide-link'],
    ] as const) {
      const rule = declarations(body(css, selector));
      expect(rule.get('min-height'), selector).toBe('44px');
      expect(rule.has('margin-block'), selector).toBe(true);
    }
  });

  it('grows the target of a link-arrow to 44 px on touch screens with a pseudo-element, not a taller box', () => {
    expect(UI).toMatch(/@media \(hover: none\), \(pointer: coarse\) \{\s*\.ui-btn\.ui-btn--link-arrow::before \{[^}]*inset-block: min\(0px, calc\(\(100% - 44px\) \/ 2\)\)/u);
  });

  it('makes the guide card title link 44 px tall (the stretched ::after already covers the card)', () => {
    expect(valueOf(GUIDE, '.guide-card .guide-card__link', 'padding-block')).toBe('7px');
    expect(GUIDE).toMatch(/\.guide-card \.guide-card__link::after \{[^}]*inset: 0;/u);
  });

  it('turns every row of the map list into one stretched link, and gives the chips and List/Map a 44 px hit area', () => {
    expect(valueOf(GUIDE, '.guide-map .guide-map__item', 'position')).toBe('relative');
    expect(GUIDE).toMatch(/\.guide-map \.guide-map__link::after \{[^}]*inset: 0;/u);
    expect(GUIDE).toMatch(/\.guide-filters \.ui-chip::after,\s*\.guide-filters \.guide-view \.ui-seg__item::after \{[^}]*inset: -2px 0;/u);
  });

  it('gives the e-mail and phone values of the privacy page a 24 px inline box', () => {
    expect(UI).toMatch(/\.legal-page__term > dd > \.legal-page__link \{ padding-block: 4px; \}/u);
  });
});
