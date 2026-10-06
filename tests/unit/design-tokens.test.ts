import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// Design tokens (docs/design/identity.md §3.1–§3.3): dark-block parity and G-CONTRAST, computed from
// src/styles/tokens.css itself so a token edit that breaks a documented pair fails here.

const TOKENS_PATH = path.resolve(__dirname, '../../src/styles/tokens.css');

type Declarations = Array<[name: string, value: string]>;
type Rgba = [r: number, g: number, b: number, a: number];

function readTokens(): string {
  return readFileSync(TOKENS_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

// Body of the first `<opener> { … }` block (the token blocks contain no nested braces).
function blockBody(css: string, opener: string): string {
  const start = css.indexOf(`${opener} {`);
  if (start < 0) throw new Error(`block not found: ${opener}`);
  const open = start + opener.length + 1;
  const close = css.indexOf('}', open);
  const body = css.slice(open + 1, close);
  if (body.includes('{')) throw new Error(`unexpected nested block in ${opener}`);
  return body;
}

function declarations(body: string): Declarations {
  return body
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const colon = part.indexOf(':');
      return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
    });
}

function parseTokens() {
  const css = readTokens();
  const theme = declarations(blockBody(css, '@theme static'));
  const darkMedia = declarations(blockBody(css, ':root:not([data-theme="light"])'));
  const darkAttr = declarations(blockBody(css, ':root[data-theme="dark"]'));
  return { css, theme, darkMedia, darkAttr };
}

function parseColour(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1];
    return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba;
  }
  // `rgb(r g b / a)`, `rgb(r g b)` or a bare `r g b` triple (--scrim).
  const inner = value.startsWith('rgb(') && value.endsWith(')') ? value.slice(4, -1) : value;
  const [channels, alpha] = inner.split('/');
  const parts = channels.trim().split(/\s+/).map(Number);
  const a = alpha === undefined ? 1 : Number(alpha.trim());
  if (parts.length !== 3 || [...parts, a].some((n) => !Number.isFinite(n))) {
    throw new Error(`unsupported colour value: ${value}`);
  }
  return [parts[0], parts[1], parts[2], a];
}

function tokenMap(mode: 'light' | 'dark'): Map<string, string> {
  const { theme, darkMedia } = parseTokens();
  const map = new Map(theme);
  if (mode === 'dark') for (const [name, value] of darkMedia) map.set(name, value);
  return map;
}

function resolveToken(map: Map<string, string>, name: string): Rgba {
  let value = map.get(name.startsWith('--') ? name : `--color-${name}`) ?? map.get(`--${name}`);
  for (let depth = 0; value?.startsWith('var('); depth += 1) {
    if (depth > 4) throw new Error(`alias loop at ${name}`);
    value = map.get(value.slice(4, -1).trim());
  }
  if (value === undefined) throw new Error(`unknown token: ${name}`);
  return parseColour(value);
}

// Spec: `token`, `#RRGGBB`, `token*alpha` (explicit alpha) and `A@B` (A composited over B).
function resolveSpec(map: Map<string, string>, spec: string): [number, number, number] {
  const at = spec.indexOf('@');
  if (at >= 0) {
    const [r, g, b, a] = resolveLayer(map, spec.slice(0, at));
    const under = resolveSpec(map, spec.slice(at + 1));
    return [r * a + under[0] * (1 - a), g * a + under[1] * (1 - a), b * a + under[2] * (1 - a)];
  }
  const [r, g, b, a] = resolveLayer(map, spec);
  if (a !== 1) throw new Error(`translucent colour used without a backdrop: ${spec}`);
  return [r, g, b];
}

function resolveLayer(map: Map<string, string>, spec: string): Rgba {
  const [name, alpha] = spec.split('*');
  const colour = name.startsWith('#') ? parseColour(name) : resolveToken(map, name);
  return alpha === undefined ? colour : [colour[0], colour[1], colour[2], Number(alpha)];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SKY = '#F3F8FE';
const WHITE = '#FFFFFF';

// [pair (identity §3.3), fg spec, bg spec, minimum, documented ratio]; `null` minimum = decorative only.
// Documented rows with the same fg, bg, minimum and ratio share one entry, their labels joined with ' / '.
type Row = [pair: string, fg: string, bg: string, min: number | null, ratio: number];

const LIGHT: Row[] = [
  ['fg on bg', 'fg', 'bg', 4.5, 13.78],
  ['fg on surface', 'fg', 'surface', 4.5, 15.15],
  ['fg on surface-sunken', 'fg', 'surface-sunken', 4.5, 12.39],
  ['fg on surface-raised', 'fg', 'surface-raised', 4.5, 15.62],
  ['fg-muted on bg', 'fg-muted', 'bg', 4.5, 6.82],
  ['fg-muted on surface / field placeholder (fg-muted) on surface (R3-V12a)', 'fg-muted', 'surface', 4.5, 7.5],
  ['fg-muted on surface-sunken', 'fg-muted', 'surface-sunken', 4.5, 6.13],
  ['fg-muted on surface-raised', 'fg-muted', 'surface-raised', 4.5, 7.73],
  ['primary-fg on primary', 'primary-fg', 'primary', 4.5, 6.21],
  ['primary-fg on primary-hover', 'primary-fg', 'primary-hover', 4.5, 7.75],
  ['primary-text on bg / kinetic band EL row (primary-text) on bg', 'primary-text', 'bg', 4.5, 6.48],
  ['primary-text on surface', 'primary-text', 'surface', 4.5, 7.12],
  ['primary-text on surface-sunken', 'primary-text', 'surface-sunken', 4.5, 5.82],
  ['accent on bg', 'accent', 'bg', 4.5, 7.36],
  ['accent on surface / map attribution links (accent) on surface (R3-V12a)', 'accent', 'surface', 4.5, 8.09],
  ['accent-hover on bg', 'accent-hover', 'bg', 4.5, 9.41],
  ['accent-fg on accent', 'accent-fg', 'accent', 4.5, 8.35],
  ['olive on bg', 'olive', 'bg', 4.5, 6.21],
  ['olive on surface', 'olive', 'surface', 4.5, 6.83],
  ['bg on fg (pressed chip)', 'bg', 'fg', 4.5, 13.78],
  ['success on success-bg', 'success', 'success-bg', 4.5, 5.86],
  ['success on surface', 'success', 'surface', 4.5, 7.0],
  ['warning on warning-bg', 'warning', 'warning-bg', 4.5, 5.94],
  ['warning on surface', 'warning', 'surface', 4.5, 7.19],
  ['danger on danger-bg', 'danger', 'danger-bg', 4.5, 5.9],
  ['danger on surface', 'danger', 'surface', 4.5, 7.3],
  ['danger on bg (admin login error)', 'danger', 'bg', 4.5, 6.64],
  ['accent on surface-sunken (admin outline button hover)', 'accent', 'surface-sunken', 4.5, 6.62],
  ['accent on info-bg', 'accent', 'info-bg', 4.5, 6.82],
  ['band-fg on band-bg', 'band-fg', 'band-bg', 4.5, 11.63],
  ['band-muted on band-bg', 'band-muted', 'band-bg', 4.5, 7.91],
  ['band-accent on band-bg', 'band-accent', 'band-bg', 4.5, 7.23],
  ['band-accent-fg on band-accent', 'band-accent-fg', 'band-accent', 4.5, 9.63],
  ['band-fg on warm-1', 'band-fg', 'warm-1', 4.5, 7.79],
  ['warm-muted on warm-1', 'warm-muted', 'warm-1', 4.5, 6.55],
  // O43: transparent header bar. Over the page it sits on bg; over photos legibility comes from the text halo
  // (.site-header--overlay in shell.css), measured on the rendered page, not from the tint.
  ['fg on header glass over bg', 'fg', 'glass@bg', 4.5, 13.99],
  ['cal: date on free cell', 'fg', 'cal-free-bg', 4.5, 15.15],
  ['cal: price on free cell', 'cal-price', 'cal-free-bg', 4.5, 7.5],
  ['cal: selected text / cal: price on selected cell (R3-V7)', 'cal-selected-fg', 'cal-selected-bg', 4.5, 6.21],
  ['cal: date on range', 'fg', 'cal-range-bg@surface', 4.5, 12.72],
  ['cal: price on range', 'cal-price', 'cal-range-bg@surface', 4.5, 6.29],
  ['cal: best pill', 'cal-best-fg', 'cal-best-bg', 4.5, 7.91],
  ['cal: booked text on darkest hatch stripe / cal: "out" label on booked hatch (R3-V7)', 'cal-booked-fg', 'cal-booked-hatch@cal-booked-bg', 4.5, 4.9],
  ['cal: booked text on sunken', 'cal-booked-fg', 'cal-booked-bg', 4.5, 6.13],
  ['cal: price on hovered cell (R3-V7)', 'cal-price', 'surface-sunken', 4.5, 6.13],
  ['QuoteBar: fg on glass-bar over bg (R3-V7)', 'fg', 'glass-bar@bg', 4.5, 13.78],
  ['QuoteBar: fg on glass-bar over a primary cell (R3-V7)', 'fg', 'glass-bar@primary', 4.5, 10.97],
  ['UI: highlight icon (primary-text) on its primary-tint disc over surface (R3-V5)', 'primary-text', 'primary-tint@surface', 3, 5.98],
  ['fg-muted on worst grain speck (8 % ink)', 'fg-muted', 'fg*0.08@bg', 4.5, 5.87],
  ['primary-text on worst grain speck', 'primary-text', 'fg*0.08@bg', 4.5, 5.57],
  ['olive on worst grain speck', 'olive', 'fg*0.08@bg', 4.5, 5.34],
  ['UI: focus ring vs bg', 'focus', 'bg', 3, 7.36],
  ['UI: focus ring vs surface', 'focus', 'surface', 3, 8.09],
  ['UI: border-control vs surface', 'border-control', 'surface', 3, 3.71],
  ['UI: border-control vs bg', 'border-control', 'bg', 3, 3.37],
  ['UI: band-focus vs band-bg', 'band-focus', 'band-bg', 3, 7.23],
  ['UI: primary fill vs bg', 'primary', 'bg', 3, 5.48],
  ['map: gulf label on map-sea', '#DDF1F5', 'map-sea', 4.5, 8.37],
  ['map popup meta (olive) on surface-raised (R3-V8)', 'olive', 'surface-raised', 4.5, 7.04],
  ['map popup links (accent) on surface-raised (R3-V8)', 'accent', 'surface-raised', 4.5, 8.35],
  ['UI: phone row icon (primary-text) on its primary-tint disc over bg (R3-V8) / UI: amenity icon (primary-text) on its primary-tint disc over bg', 'primary-text', 'primary-tint@bg', 3, 5.47],
  ['contact band title accent (band-accent) on warm-1 (R3-V5)', 'band-accent', 'warm-1', 4.5, 4.84],
  ['UI: band-focus vs warm-1 (contact band links, R3-V5)', 'band-focus', 'warm-1', 3, 4.84],
  ['bookbar: fg on surface-raised .9 over black', 'fg', 'surface-raised*0.9@#000000', 4.5, 12.46],
  ['bookbar: fg on surface-raised .9 over white', 'fg', 'surface-raised*0.9@#FFFFFF', 4.5, 15.62],
  ['bookbar: fg-muted on surface-raised .9 over black', 'fg-muted', 'surface-raised*0.9@#000000', 4.5, 6.17],
  ['bookbar: fg-muted on surface-raised .9 over white', 'fg-muted', 'surface-raised*0.9@#FFFFFF', 4.5, 7.73],
  ['decorative only: sun on bg (never text)', 'sun', 'bg', null, 1.76],
  // R3-V6 apartment page and GalleryLightbox
  ['UI: lightbox focus ring (band-focus) on viewer-bg', 'band-focus', 'viewer-bg', 3, 10.09],
  // R3-V9 in-stay pages: the stay hub's half sun behind the H1, the portal tile, the check-in rule icon.
  ['stay hub H1 (fg, d1 large text) over the half-sun rays (sun .5 over bg; the lead sits below the sun) (R3-V9)', 'fg', 'sun*0.5@bg', 3, 10.42],
  ['UI: portal tile icon (band-accent) on band-line over band-bg (R3-V9)', 'band-accent', 'band-line@band-bg', 3, 4.08],
  ['portal tile text (band-muted) on its band-accent .14 glow over band-bg (R3-V9)', 'band-muted', 'band-accent*0.14@band-bg', 4.5, 6.04],
  ['UI: check-in rule icon (primary-text) on primary-tint over surface-sunken (R3-V9)', 'primary-text', 'primary-tint@surface-sunken', 3, 4.95],
];

const DARK: Row[] = [
  ['fg on bg', 'fg', 'bg', 4.5, 14.99],
  ['fg on surface', 'fg', 'surface', 4.5, 13.37],
  ['fg on surface-sunken', 'fg', 'surface-sunken', 4.5, 13.99],
  ['fg on surface-raised', 'fg', 'surface-raised', 4.5, 11.21],
  ['fg-muted on bg', 'fg-muted', 'bg', 4.5, 8.53],
  ['fg-muted on surface / field placeholder (fg-muted) on surface (R3-V12a)', 'fg-muted', 'surface', 4.5, 7.61],
  ['fg-muted on surface-sunken', 'fg-muted', 'surface-sunken', 4.5, 7.96],
  ['fg-muted on surface-raised', 'fg-muted', 'surface-raised', 4.5, 6.38],
  ['primary-fg on primary', 'primary-fg', 'primary', 4.5, 7.9],
  ['primary-fg on primary-hover', 'primary-fg', 'primary-hover', 4.5, 9.26],
  ['primary-text on bg / kinetic band EL row (primary-text) on bg', 'primary-text', 'bg', 4.5, 8.88],
  ['primary-text on surface', 'primary-text', 'surface', 4.5, 7.92],
  ['primary-text on surface-sunken', 'primary-text', 'surface-sunken', 4.5, 8.29],
  ['accent on bg', 'accent', 'bg', 4.5, 9.78],
  ['accent on surface / map attribution links (accent) on surface (R3-V12a)', 'accent', 'surface', 4.5, 8.72],
  ['accent-hover on bg', 'accent-hover', 'bg', 4.5, 11.92],
  ['accent-fg on accent', 'accent-fg', 'accent', 4.5, 9.78],
  ['olive on bg', 'olive', 'bg', 4.5, 10.11],
  ['olive on surface', 'olive', 'surface', 4.5, 9.02],
  ['bg on fg (pressed chip)', 'bg', 'fg', 4.5, 14.99],
  ['success on success-bg', 'success', 'success-bg', 4.5, 8.37],
  ['success on surface', 'success', 'surface', 4.5, 9.3],
  ['warning on warning-bg', 'warning', 'warning-bg', 4.5, 8.88],
  ['warning on surface', 'warning', 'surface', 4.5, 9.63],
  ['danger on danger-bg', 'danger', 'danger-bg', 4.5, 8.05],
  ['danger on surface', 'danger', 'surface', 4.5, 7.99],
  ['danger on bg (admin login error)', 'danger', 'bg', 4.5, 8.96],
  ['accent on surface-sunken (admin outline button hover)', 'accent', 'surface-sunken', 4.5, 9.13],
  ['accent on info-bg', 'accent', 'info-bg', 4.5, 7.3],
  ['band-fg on band-bg', 'band-fg', 'band-bg', 4.5, 11.77],
  ['band-muted on band-bg', 'band-muted', 'band-bg', 4.5, 7.33],
  ['band-accent on band-bg', 'band-accent', 'band-bg', 4.5, 7.95],
  ['band-accent-fg on band-accent', 'band-accent-fg', 'band-accent', 4.5, 10.09],
  ['band-fg on warm-1', 'band-fg', 'warm-1', 4.5, 9.72],
  ['warm-muted on warm-1', 'warm-muted', 'warm-1', 4.5, 8.48],
  ['fg on header glass over bg', 'fg', 'glass@bg', 4.5, 6.67],
  ['cal: date on free cell', 'fg', 'cal-free-bg', 4.5, 13.37],
  ['cal: price on free cell', 'cal-price', 'cal-free-bg', 4.5, 7.61],
  ['cal: selected text / cal: price on selected cell (R3-V7)', 'cal-selected-fg', 'cal-selected-bg', 4.5, 7.9],
  ['cal: date on range', 'fg', 'cal-range-bg@surface', 4.5, 10.2],
  ['cal: price on range', 'cal-price', 'cal-range-bg@surface', 4.5, 5.8],
  ['cal: best pill', 'cal-best-fg', 'cal-best-bg', 4.5, 8.85],
  ['cal: booked text on lightest hatch stripe / cal: "out" label on booked hatch (R3-V7)', 'cal-booked-fg', 'cal-booked-hatch@cal-booked-bg', 4.5, 6.11],
  ['cal: booked text on sunken', 'cal-booked-fg', 'cal-booked-bg', 4.5, 7.96],
  ['cal: price on hovered cell (R3-V7)', 'cal-price', 'surface-sunken', 4.5, 7.96],
  ['QuoteBar: fg on glass-bar over bg (R3-V7)', 'fg', 'glass-bar@bg', 4.5, 14.99],
  ['QuoteBar: fg on glass-bar over a primary cell (R3-V7)', 'fg', 'glass-bar@primary', 4.5, 10.64],
  ['UI: highlight icon (primary-text) on its primary-tint disc over surface (R3-V5)', 'primary-text', 'primary-tint@surface', 3, 6.04],
  ['fg-muted on worst grain speck (8 % paper)', 'fg-muted', 'fg*0.08@bg', 4.5, 7.03],
  ['UI: focus ring vs bg', 'focus', 'bg', 3, 10.12],
  ['UI: focus ring vs surface', 'focus', 'surface', 3, 9.03],
  ['UI: border-control vs surface', 'border-control', 'surface', 3, 3.97],
  ['UI: border-control vs bg', 'border-control', 'bg', 3, 4.46],
  ['UI: band-focus vs band-bg', 'band-focus', 'band-bg', 3, 7.95],
  ['UI: primary fill vs bg', 'primary', 'bg', 3, 7.52],
  ['map: gulf label on map-sea', '#DDF1F5', 'map-sea', 4.5, 12.02],
  ['map popup meta (olive) on surface-raised (R3-V8)', 'olive', 'surface-raised', 4.5, 7.56],
  ['map popup links (accent) on surface-raised (R3-V8)', 'accent', 'surface-raised', 4.5, 7.31],
  ['UI: phone row icon (primary-text) on its primary-tint disc over bg (R3-V8) / UI: amenity icon (primary-text) on its primary-tint disc over bg', 'primary-text', 'primary-tint@bg', 3, 6.83],
  // R3-V6 apartment page and GalleryLightbox
  ['UI: lightbox focus ring (band-focus) on viewer-bg', 'band-focus', 'viewer-bg', 3, 10.58],
  ['contact band title accent (band-accent) on warm-1 (R3-V5)', 'band-accent', 'warm-1', 4.5, 6.57],
  ['UI: band-focus vs warm-1 (contact band links, R3-V5)', 'band-focus', 'warm-1', 3, 6.57],
  ['bookbar: fg on surface-raised .9 over black', 'fg', 'surface-raised*0.9@#000000', 4.5, 11.99],
  ['bookbar: fg on surface-raised .9 over white', 'fg', 'surface-raised*0.9@#FFFFFF', 4.5, 8.25],
  ['bookbar: fg-muted on surface-raised .9 over black', 'fg-muted', 'surface-raised*0.9@#000000', 4.5, 6.82],
  ['bookbar: fg-muted on surface-raised .9 over white', 'fg-muted', 'surface-raised*0.9@#FFFFFF', 4.5, 4.69],
  // R3-V9 in-stay pages: the stay hub's half sun behind the H1, the portal tile, the check-in rule icon.
  ['stay hub H1 (fg, d1 large text) over the half-sun rays (sun .5 over bg; the lead sits below the sun) (R3-V9)', 'fg', 'sun*0.5@bg', 3, 4.4],
  ['UI: portal tile icon (band-accent) on band-line over band-bg (R3-V9)', 'band-accent', 'band-line@band-bg', 3, 4.5],
  ['portal tile text (band-muted) on its band-accent .14 glow over band-bg (R3-V9)', 'band-muted', 'band-accent*0.14@band-bg', 4.5, 5.5],
  ['UI: check-in rule icon (primary-text) on primary-tint over surface-sunken (R3-V9)', 'primary-text', 'primary-tint@surface-sunken', 3, 6.34],
];

// "both" rows: photo scrims and paper map pins, identical in the two themes.
const BOTH: Row[] = [
  ['hero H1 on scrim .58 over the brightest sky pixel (large text)', 'fg-on-photo', `scrim*0.58@${SKY}`, 3, 4.48],
  ['hero lede, price and CTA on scrim .80 over pure white', 'fg-on-photo', `scrim*0.80@${WHITE}`, 4.5, 9.42],
  ['hero eyebrow on scrim .80 over pure white', 'fg-on-photo-accent', `scrim*0.80@${WHITE}`, 4.5, 7.99],
  ['room and gallery caption on scrim .62 over pure white', 'fg-on-photo', `scrim*0.62@${WHITE}`, 4.5, 4.9],
  ['map pin text on pin paper', 'pin-fg', 'pin-bg', 4.5, 15.15],
  ['map home pin', 'pin-home-fg', 'pin-home-bg', 4.5, 6.21],
  ['map pin number disc and map list number (R3-V8)', 'pin-bg', 'pin-fg', 4.5, 15.15],
  // R3-V6 GalleryLightbox: room name and counter on viewer-bg; the glass (on-photo) button border.
  ['lightbox room name and counter on viewer-bg', 'fg-on-photo', 'viewer-bg', 4.5, 17.59],
  ['UI: lightbox glass button border on viewer-bg', '#FFF8EE*0.5@viewer-bg', 'viewer-bg', 3, 5.09],
];

const CASES: Array<[mode: 'light' | 'dark', ...row: Row]> = [
  ...LIGHT.map((row) => ['light', ...row] as ['light', ...Row]),
  ...DARK.map((row) => ['dark', ...row] as ['dark', ...Row]),
  ...BOTH.flatMap((row) => [['light', ...row] as ['light', ...Row], ['dark', ...row] as ['dark', ...Row]]),
];

describe('design tokens: dark mode architecture (identity §3.1)', () => {
  it('defines the dark overrides in @layer base, for the OS preference and the explicit choice', () => {
    const { css } = parseTokens();
    expect(css).toMatch(/@layer base\s*\{\s*@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{/);
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{/);
    expect(css).not.toMatch(/light-dark\(/);
  });

  it('keeps the two dark blocks identical, including color-scheme', () => {
    const { darkMedia, darkAttr } = parseTokens();
    expect(darkAttr).toEqual(darkMedia);
    expect(darkMedia).toContainEqual(['color-scheme', 'dark']);
  });

  it('gives every --color-* token a dark value (redefined, or an alias of a redefined token)', () => {
    const { theme, darkMedia } = parseTokens();
    const themeNames = new Set(theme.map(([name]) => name));
    const darkNames = new Set(darkMedia.map(([name]) => name));
    const missing = theme
      .filter(([name]) => name.startsWith('--color-'))
      .filter(([name, value]) => {
        if (darkNames.has(name)) return false;
        const alias = /^var\((--color-[a-z0-9-]+)\)$/.exec(value);
        return !(alias && darkNames.has(alias[1]));
      })
      .map(([name]) => name);
    expect(missing).toEqual([]);
    // Every dark override targets a token that exists in @theme (catches typos).
    expect([...darkNames].filter((name) => name !== 'color-scheme' && !themeNames.has(name))).toEqual([]);
    // Aliases are not redefined in dark (they follow their target).
    expect(theme.filter(([name, value]) => value.startsWith('var(--color-') && darkNames.has(name))).toEqual([]);
  });
});

describe('design tokens: G-CONTRAST (identity §3.3)', () => {
  it('covers all 164 documented rows', () => {
    expect([...LIGHT, ...DARK, ...BOTH].flatMap(([pair]) => pair.split(' / ')).length).toBe(164);
  });

  it.each(CASES)('%s: %s', (mode, _pair, fg, bg, min, documented) => {
    const map = tokenMap(mode);
    const ratio = contrast(resolveSpec(map, fg), resolveSpec(map, bg));
    expect(ratio.toFixed(2)).toBe(documented.toFixed(2));
    if (min !== null) expect(ratio).toBeGreaterThanOrEqual(min);
  });
});
