/**
 * Generates the static Open Graph share cards (docs/design/identity.md §12 R3-V11).
 *
 *   npm run design:og
 *
 * Outputs (committed): public/og/og-{en,el}.jpg, 1200 × 630, ≤ 300 KB each.
 *
 * - Photo: the home hero's 3:2 frame (public/house/balcony/balcony_1.jpeg, §7.2) scaled to 1200 px
 *   and cut to 630 px at the hero's `object-position` 40 % (vertical).
 * - Scrim: the hero content scrim (§7.1, `--scrim` 8 22 28) rising from the bottom edge.
 * - Brand mark (public/brand/mark.svg in the band colours, as on the app icons), the wordmark and
 *   the share-card tagline (§1.2 "Secondary").
 *
 * sharp builds the image. Only the text is rasterised by a local headless Chrome (puppeteer),
 * because sharp's text renderer cannot load the brand's WOFF2 files; the page loads nothing but
 * the inlined fonts (every request is aborted). The script measures the WCAG contrast of each
 * text box against the lightest pixel under it and fails below 4.5:1.
 */
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'public/house/balcony/balcony_1.jpeg');
const MARK = path.join(ROOT, 'public/brand/mark.svg');
const FONTS = path.join(ROOT, 'src/app/fonts');
const OUT_DIR = path.join(ROOT, 'public/og');

const WIDTH = 1200;
const HEIGHT = 630;
const MAX_BYTES = 300 * 1024;
const MIN_TEXT_CONTRAST = 4.5;

// identity §3.2 band tokens (light): text band-fg, label band-accent; the scrim colour of §7.1.
const BAND_FG = '#F6EFE4';
const BAND_ACCENT = '#F2B27A';
const SCRIM = '8 22 28';

type Locale = 'en' | 'el';

const COPY: Record<Locale, { place: string; tagline: string }> = {
  en: {
    place: 'KALAMATA',
    tagline: 'Taygetos at breakfast, the gulf a short drive away.',
  },
  el: {
    place: 'Καλαμάτα',
    tagline: 'Ο Ταΰγετος στο πρωινό σας, ο κόλπος λίγα λεπτά με το αυτοκίνητο.',
  },
};

// Layout (px). The text sits in the lower part, where the scrim is at least .74 opaque.
const LEFT = 72;
const MARK_BOX = { top: 330, width: 96, height: 60 };
const SCRIM_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0.4, 0],
  [0.58, 0.62],
  [0.72, 0.8],
  [1, 0.9],
];

/** The photo: the 3:2 hero frame scaled to the card width, cut at 40 % from the top. */
async function photo(): Promise<Buffer> {
  const resized = await sharp(SOURCE).resize({ width: WIDTH }).toBuffer({ resolveWithObject: true });
  const top = Math.round((resized.info.height - HEIGHT) * 0.4);
  return sharp(resized.data).extract({ left: 0, top, width: WIDTH, height: HEIGHT }).toBuffer();
}

function scrimSvg(): Buffer {
  const stops = SCRIM_STOPS.map(([offset, alpha]) => `<stop offset="${offset}" stop-color="rgb(${SCRIM.split(' ').join(',')})" stop-opacity="${alpha}"/>`).join('');
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">`
    + `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>`
    + `<rect width="${WIDTH}" height="${HEIGHT}" fill="url(#s)"/></svg>`);
}

/** mark.svg with the band colours of the app icons (sun band-accent, waves band-fg). */
async function markSvg(): Promise<Buffer> {
  const svg = await readFile(MARK, 'utf8');
  for (const colour of ['#F0A95B', '#0D5568']) {
    if (!svg.includes(colour)) throw new Error(`mark.svg no longer uses ${colour}`);
  }
  const recoloured = svg.split('#F0A95B').join(BAND_ACCENT).split('#0D5568').join(BAND_FG)
    .replace('<svg ', `<svg width="${MARK_BOX.width}" height="${MARK_BOX.height}" `);
  return Buffer.from(recoloured);
}

async function fontFace(family: string, file: string, style: 'normal' | 'italic'): Promise<string> {
  const data = (await readFile(path.join(FONTS, file))).toString('base64');
  return `@font-face{font-family:"${family}";src:url(data:font/woff2;base64,${data}) format("woff2");font-weight:100 900;font-style:${style}}`;
}

function textHtml(locale: Locale, faces: string): string {
  const { place, tagline } = COPY[locale];
  const placeStyle = locale === 'en' ? 'letter-spacing:.18em' : 'letter-spacing:.04em';
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><style>${faces}
html,body{margin:0;background:transparent;width:${WIDTH}px;height:${HEIGHT}px}
.t{position:absolute;left:${LEFT}px;margin:0;white-space:nowrap;font-kerning:normal}
#wordmark{top:404px;font:italic 400 78px/1 "Display Latin";color:${BAND_FG}}
#place{top:500px;font:600 24px/1 "Text Latin","Text Greek";color:${BAND_ACCENT};${placeStyle}}
#tagline{top:546px;font:400 30px/1.2 "Text Latin","Text Greek";color:${BAND_FG}}
</style></head><body>
<p class="t" id="wordmark" lang="it">Dolce Far Niente</p>
<p class="t" id="place">${place}</p>
<p class="t" id="tagline">${tagline}</p>
</body></html>`;
}

type Box = { id: string; colour: string; left: number; top: number; width: number; height: number };

/** Renders the text layer as a transparent PNG and returns the box of each text line. */
async function renderText(locale: Locale, faces: string): Promise<{ png: Buffer; boxes: Box[] }> {
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.url().startsWith('data:')) void request.continue();
      else void request.abort();
    });
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    await page.setContent(textHtml(locale, faces), { waitUntil: 'load' });
    const boxes = await page.evaluate(async () => {
      // Load every face (a locale uses only some), so a broken font file fails the run.
      await Promise.all(Array.from(document.fonts).map((face) => face.load()));
      return Array.from(document.querySelectorAll<HTMLElement>('.t')).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          id: element.id,
          colour: getComputedStyle(element).color,
          left: Math.floor(rect.left),
          top: Math.floor(rect.top),
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
        };
      });
    });
    for (const box of boxes) {
      if (box.left + box.width > WIDTH - LEFT) throw new Error(`${locale} ${box.id} is too wide (${box.width} px)`);
    }
    const png = Buffer.from(await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } }));
    return { png, boxes };
  } finally {
    await browser.close();
  }
}

/** WCAG 2.x relative luminance of 8-bit sRGB. */
function luminance(r: number, g: number, b: number): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function parseRgb(colour: string): [number, number, number] {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour);
  if (!match) throw new Error(`unexpected colour ${colour}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Contrast of a text colour against the lightest background pixel inside its box. */
function worstContrast(background: { data: Buffer; channels: number }, box: Box): number {
  let lightest = 0;
  for (let y = Math.max(0, box.top); y < Math.min(HEIGHT, box.top + box.height); y += 1) {
    for (let x = Math.max(0, box.left); x < Math.min(WIDTH, box.left + box.width); x += 1) {
      const i = (y * WIDTH + x) * background.channels;
      lightest = Math.max(lightest, luminance(background.data[i], background.data[i + 1], background.data[i + 2]));
    }
  }
  const text = luminance(...parseRgb(box.colour));
  return (Math.max(text, lightest) + 0.05) / (Math.min(text, lightest) + 0.05);
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const faces = (await Promise.all([
    fontFace('Display Latin', 'noto-serif-display-latin-wght-italic.woff2', 'italic'),
    fontFace('Text Latin', 'commissioner-latin-wght-normal.woff2', 'normal'),
    fontFace('Text Greek', 'commissioner-greek-wght-normal.woff2', 'normal'),
  ])).join('\n');

  const background = await sharp(await photo())
    .composite([
      { input: scrimSvg(), top: 0, left: 0 },
      { input: await markSvg(), top: MARK_BOX.top, left: LEFT - 4 },
    ])
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (const locale of ['en', 'el'] as const) {
    const { png, boxes } = await renderText(locale, faces);
    for (const box of boxes) {
      const contrast = worstContrast({ data: background.data, channels: background.info.channels }, box);
      console.log(`${locale} ${box.id}: ${contrast.toFixed(2)}:1 (worst pixel in ${box.width}×${box.height} at ${box.left},${box.top})`);
      if (contrast < MIN_TEXT_CONTRAST) throw new Error(`${locale} ${box.id} contrast ${contrast.toFixed(2)} < ${MIN_TEXT_CONTRAST}`);
    }
    const file = path.join(OUT_DIR, `og-${locale}.jpg`);
    await sharp(background.data, { raw: { width: WIDTH, height: HEIGHT, channels: background.info.channels } })
      .composite([{ input: png, top: 0, left: 0 }])
      .jpeg({ quality: 82, mozjpeg: true })
      .toFile(file);
    const { size } = await stat(file);
    if (size > MAX_BYTES) throw new Error(`${file} is ${size} bytes (> ${MAX_BYTES})`);
    console.log(`wrote public/og/og-${locale}.jpg (${Math.round(size / 1024)} KB)`);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
