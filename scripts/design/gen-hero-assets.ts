/**
 * Generates the home hero crops, their depth maps and the paper grain tiles
 * (docs/design/identity.md §7.2, §4.5, §5.6).
 *
 *   npm run design:hero
 *
 * Source: public/house/balcony/balcony_1.jpeg (1920 × 1281). Outputs (committed):
 * - public/house/balcony/hero/balcony-hero-{9x16,4x5,3x2}-<width>.{avif,webp}: the art-directed crops.
 * - public/house/balcony/hero/depth-{9x16,4x5,3x2}.webp: hand-painted depth (white = near) for the
 *   WebGL "living photograph", cut with the same crop maths as the photo.
 * - public/design/grain-{light,dark}.webp: 160 px paper grain tiles, alpha ≤ 8 %, ≤ 10 KB each.
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const SOURCE = path.join(ROOT, 'public/house/balcony/balcony_1.jpeg');
const HERO_DIR = path.join(ROOT, 'public/house/balcony/hero');
const GRAIN_DIR = path.join(ROOT, 'public/design');

const W = 1920;
const H = 1281;

type Crop = Readonly<{
  name: '9x16' | '4x5' | '3x2';
  /** Crop box in the source (full height). */
  left: number;
  width: number;
  /** Output widths; heights keep the crop's aspect ratio. */
  widths: readonly number[];
  webpQuality: number;
  avifQuality: number;
  depth: Readonly<{ width: number; height: number }>;
}>;

/** Crop width for an aspect ratio at the full source height, left edge at `share` of the spare width. */
function cropBox(aspect: number, share: number): { left: number; width: number } {
  const width = Math.round(H * aspect);
  return { left: Math.round((W - width) * share), width };
}

const CROPS: readonly Crop[] = [
  { name: '9x16', ...cropBox(9 / 16, 0.62), widths: [480, 721], webpQuality: 60, avifQuality: 45, depth: { width: 216, height: 384 } },
  { name: '4x5', ...cropBox(4 / 5, 0.6), widths: [800, 1025], webpQuality: 60, avifQuality: 45, depth: { width: 256, height: 320 } },
  { name: '3x2', left: 0, width: W, widths: [1440, 1920], webpQuality: 70, avifQuality: 50, depth: { width: 480, height: 320 } },
];

// §7.2 crop origins; a changed source or formula must be a deliberate spec change.
const EXPECTED_BOXES: Record<Crop['name'], { left: number; width: number }> = {
  '9x16': { left: 743, width: 721 },
  '4x5': { left: 537, width: 1025 },
  '3x2': { left: 0, width: 1920 },
};

/** File width label: 721 and 1025 are the full-height crops, published as -720 and -1024 (§7.2). */
function widthLabel(crop: Crop, width: number): number {
  return width === crop.width && crop.name !== '3x2' ? width - 1 : width;
}

const grey = (v: number): string => {
  const c = Math.round(v * 255);
  return `rgb(${c},${c},${c})`;
};

// Hand-painted depth (white = near) in the 1200 × 801 space of the review image, from the mockup
// (.runtime/design/messinian-light/tools/gen-assets.mjs:17-38): sky, Taygetos, pine and rooftops,
// far parapet, table and chairs, right plant, left plant, nearest parapet.
const DEPTH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="801" viewBox="0 0 1200 801">
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${grey(0.2)}"/><stop offset="0.4" stop-color="${grey(0.45)}"/><stop offset="0.65" stop-color="${grey(0.6)}"/><stop offset="1" stop-color="${grey(0.9)}"/></linearGradient></defs>
<rect width="1200" height="801" fill="url(#bg)"/>
<rect x="0" y="45" width="1200" height="275" fill="${grey(0.3)}"/>
<polygon fill="${grey(0.1)}" points="0,120 215,75 300,62 390,55 470,40 560,22 640,10 720,4 900,2 1200,2 1200,210 1000,190 760,185 640,140 430,135 220,122"/>
<polygon fill="${grey(0.0)}" points="0,0 1200,0 1200,2 900,2 720,4 640,10 560,22 470,40 390,55 300,62 215,75 120,58 0,55"/>
<rect x="0" y="50" width="290" height="80" fill="${grey(0.3)}"/>
<ellipse cx="670" cy="135" rx="78" ry="62" fill="${grey(0.26)}"/>
<rect x="380" y="300" width="490" height="320" fill="${grey(0.5)}"/>
<rect x="860" y="300" width="340" height="220" fill="${grey(0.52)}"/>
<rect x="600" y="360" width="340" height="200" fill="${grey(0.62)}"/>
<rect x="670" y="320" width="95" height="120" fill="${grey(0.58)}"/>
<polygon fill="${grey(0.74)}" points="840,340 1000,330 1145,340 1140,600 1090,735 860,700 835,520"/>
<polygon fill="${grey(0.8)}" points="490,345 560,340 640,470 830,560 820,640 790,800 540,800 520,560"/>
<polygon fill="${grey(0.56)}" points="1050,40 1110,120 1160,260 1150,420 1100,470 990,470 950,380 960,220 1000,110"/>
<polygon fill="${grey(0.9)}" points="0,445 390,420 540,455 545,801 0,801"/>
<polygon fill="${grey(0.92)}" points="0,430 530,365 535,400 0,470"/>
<polygon fill="${grey(1)}" points="0,140 60,110 130,90 200,70 300,80 390,95 440,160 445,240 410,300 360,380 360,450 330,560 300,700 240,760 150,740 120,600 60,500 0,480"/>
</svg>`;

async function kb(file: string): Promise<string> {
  return `${((await stat(file)).size / 1024).toFixed(1)} KB`;
}

async function writeCrops(): Promise<void> {
  const depth = await sharp(Buffer.from(DEPTH_SVG)).resize(W, H).blur(9).greyscale().png().toBuffer();
  for (const crop of CROPS) {
    const expected = EXPECTED_BOXES[crop.name];
    if (crop.left !== expected.left || crop.width !== expected.width) {
      throw new Error(`${crop.name} crop box ${crop.left}/${crop.width} differs from §7.2 ${expected.left}/${expected.width}`);
    }
    const box = { left: crop.left, top: 0, width: crop.width, height: H };
    for (const width of crop.widths) {
      const height = Math.round((H * width) / crop.width);
      const base = path.join(HERO_DIR, `balcony-hero-${crop.name}-${widthLabel(crop, width)}`);
      const resized = () => sharp(SOURCE).extract(box).resize(width, height);
      await resized().webp({ quality: crop.webpQuality, effort: 6 }).toFile(`${base}.webp`);
      await resized().avif({ quality: crop.avifQuality, effort: 6 }).toFile(`${base}.avif`);
      console.log(`${path.basename(base)} ${width}×${height}: webp ${await kb(`${base}.webp`)}, avif ${await kb(`${base}.avif`)}`);
    }
    const depthFile = path.join(HERO_DIR, `depth-${crop.name}.webp`);
    await sharp(depth).extract(box).resize(crop.depth.width, crop.depth.height).webp({ quality: 80 }).toFile(depthFile);
    console.log(`depth-${crop.name} ${crop.depth.width}×${crop.depth.height}: ${await kb(depthFile)}`);
  }
}

// §4.5 grain: the mockup's deterministic LCG noise (gen-assets.mjs:41-45), 160 × 160, as alpha specks
// of one colour with alpha capped at 20/255 (7.8 %), as lossless WebP (§7.2 budget: ≤ 10 KB each).
const GRAIN_SIZE = 160;
const GRAIN_MAX_ALPHA = 20;
const GRAIN_TILES = [
  { file: 'grain-light.webp', rgb: [0x1c, 0x25, 0x28], alpha: (v: number) => (255 - v) / 255 }, // ink specks
  { file: 'grain-dark.webp', rgb: [0xf2, 0xeb, 0xdf], alpha: (v: number) => v / 255 }, // paper specks
] as const;

async function grainNoise(): Promise<Buffer> {
  const raw = Buffer.alloc(GRAIN_SIZE * GRAIN_SIZE);
  let s = 1234567;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < raw.length; i += 1) raw[i] = Math.round(118 + (rnd() + rnd() + rnd() - 1.5) * 90);
  return sharp(raw, { raw: { width: GRAIN_SIZE, height: GRAIN_SIZE, channels: 1 } }).blur(0.5).raw().toBuffer();
}

async function writeGrain(): Promise<void> {
  const noise = await grainNoise();
  for (const tile of GRAIN_TILES) {
    const rgba = Buffer.alloc(noise.length * 4);
    for (let i = 0; i < noise.length; i += 1) {
      rgba.set([tile.rgb[0], tile.rgb[1], tile.rgb[2], Math.round(tile.alpha(noise[i]) * GRAIN_MAX_ALPHA)], i * 4);
    }
    const file = path.join(GRAIN_DIR, tile.file);
    await sharp(rgba, { raw: { width: GRAIN_SIZE, height: GRAIN_SIZE, channels: 4 } })
      .webp({ lossless: true, effort: 6 })
      .toFile(file);
    const alphaMax = (await sharp(file).stats()).channels[3].max;
    console.log(`${tile.file}: ${await kb(file)}, alpha max ${alphaMax} (${((alphaMax / 255) * 100).toFixed(1)} %)`);
  }
}

async function main(): Promise<void> {
  const meta = await sharp(SOURCE).metadata();
  if (meta.width !== W || meta.height !== H) throw new Error(`${SOURCE} is ${meta.width}×${meta.height}, expected ${W}×${H}`);
  await mkdir(HERO_DIR, { recursive: true });
  await writeCrops();
  await writeGrain();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
