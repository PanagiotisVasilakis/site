/**
 * The brand mark shared by the icon and share-card generators (docs/design/identity.md §6).
 *
 * public/brand/mark.svg uses the light tokens (sun #F0A95B, waves #0D5568). Both generators draw it
 * on the deep-gulf band, so it takes the band tokens instead.
 */
import path from 'node:path';

export const MARK = path.join(process.cwd(), 'public/brand/mark.svg');

// identity §3.2 band tokens (light): text band-fg, label and sun band-accent.
export const BAND_FG = '#F6EFE4';
export const BAND_ACCENT = '#F2B27A';

const RECOLOUR: ReadonlyArray<readonly [string, string]> = [
  ['#F0A95B', BAND_ACCENT], // sun → band-accent
  ['#0D5568', BAND_FG], // waves → band-fg
];

/** `svg` (the text of mark.svg, or a part of it) with the band colours; fails if a colour is gone. */
export function recolourMark(svg: string): string {
  let recoloured = svg;
  for (const [from, to] of RECOLOUR) {
    if (!recoloured.includes(from)) throw new Error(`mark.svg no longer uses ${from}`);
    recoloured = recoloured.split(from).join(to);
  }
  return recoloured;
}
