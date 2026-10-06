/**
 * Generates the app icons and the favicon from the brand mark (docs/design/identity.md §6).
 *
 *   npm run design:icons
 *
 * Source: public/brand/mark.svg (light tokens: sun #F0A95B, waves #0D5568). On the icons the mark
 * sits on the deep-gulf band colour, so it takes the band tokens instead: sun band-accent
 * #F2B27A, waves band-fg #F6EFE4, background band-bg #0C3440.
 *
 * Outputs (committed):
 * - public/icons/icon-192.png, icon-512.png: rounded square, manifest purpose "any".
 * - public/icons/icon-maskable-512.png: full bleed, manifest purpose "maskable".
 * - public/icons/apple-touch-icon.png (180): full bleed, because iOS rounds the corners itself
 *   and would show transparent corners as black.
 * - src/app/favicon.ico (16, 32, 48; PNG entries): rounded square with a larger mark.
 *
 * On every app icon the mark's whole view box lies inside the central safe circle (radius 40 %
 * of the icon), so maskable crops never cut it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const MARK = path.join(ROOT, 'public/brand/mark.svg');

const BAND_BG = '#0C3440';
const RECOLOUR: ReadonlyArray<readonly [string, string]> = [
  ['#F0A95B', '#F2B27A'], // sun → band-accent
  ['#0D5568', '#F6EFE4'], // waves → band-fg
];

// The mark's view box in mark.svg is "4 13 32 20" (32 × 20 units, centre 20,23).
const MARK_WIDTH = 32;
const MARK_CENTRE = { x: 20, y: 23 };

async function markContent(): Promise<string> {
  const svg = await readFile(MARK, 'utf8');
  const inner = /<svg\b[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1];
  if (!inner) throw new Error(`No <svg> element in ${MARK}`);
  let recoloured = inner;
  for (const [from, to] of RECOLOUR) {
    if (!recoloured.includes(from)) throw new Error(`mark.svg no longer uses ${from}`);
    recoloured = recoloured.split(from).join(to);
  }
  return recoloured;
}

/** An icon SVG: the mark at `markShare` of the icon width, centred on a band-bg square. */
function iconSvg(content: string, markShare: number, cornerShare: number): string {
  const side = MARK_WIDTH / markShare;
  const x = MARK_CENTRE.x - side / 2;
  const y = MARK_CENTRE.y - side / 2;
  const r = side * cornerShare;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}">`
    + `<rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${r}" fill="${BAND_BG}"/>${content}</svg>`;
}

async function renderPng(svg: string, size: number): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 72 * Math.ceil(size / 20) })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** A .ico file whose entries are PNG images (supported by every current browser). */
function icoFromPngs(images: ReadonlyArray<{ size: number; png: Buffer }>): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries: Buffer[] = [];
  let offset = 6 + 16 * images.length;
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((image) => image.png)]);
}

async function main(): Promise<void> {
  const content = await markContent();
  // 0.64 keeps the 32 × 20 view box inside the 40 % safe circle (half diagonal ≈ 0.377).
  const rounded = iconSvg(content, 0.64, 0.25);
  const fullBleed = iconSvg(content, 0.64, 0);
  const favicon = iconSvg(content, 0.8, 0.25);

  const outputs: Array<[string, Promise<Buffer>]> = [
    ['public/icons/icon-192.png', renderPng(rounded, 192)],
    ['public/icons/icon-512.png', renderPng(rounded, 512)],
    ['public/icons/icon-maskable-512.png', renderPng(fullBleed, 512)],
    ['public/icons/apple-touch-icon.png', renderPng(fullBleed, 180)],
  ];
  for (const [file, png] of outputs) {
    await writeFile(path.join(ROOT, file), await png);
    console.log(`wrote ${file}`);
  }

  const icoImages = await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await renderPng(favicon, size) })));
  await writeFile(path.join(ROOT, 'src/app/favicon.ico'), icoFromPngs(icoImages));
  console.log('wrote src/app/favicon.ico');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
