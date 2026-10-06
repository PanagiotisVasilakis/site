import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/fonts/fonts', () => {
  const font = { variable: 'font-var', className: 'font-class', style: { fontFamily: 'x' } };
  return { textLatin: font, textGreek: font, displayLatin: font, displayGreek: font };
});

vi.mock('@/app/globals.css', () => ({}));

import { metadata, viewport } from '@/app/layout';
import { HOST_CONTACT } from '@/data/contact';
import { getDictionary } from '@/i18n/dictionaries';

const BRAND = 'Dolce Far Niente · Kalamata';
const PUBLIC_DIR = path.join(process.cwd(), 'public');

interface ManifestIcon { src: string; sizes: string; type: string; purpose?: string }
interface WebManifest {
  name: string;
  short_name: string;
  theme_color: string;
  background_color: string;
  icons: ManifestIcon[];
}

function readManifest(): WebManifest {
  return JSON.parse(readFileSync(path.join(PUBLIC_DIR, 'app.webmanifest'), 'utf8')) as WebManifest;
}

describe('brand name (identity §1.2)', () => {
  it('is the root title default and the suffix template of every page title', () => {
    expect(metadata.title).toEqual({ default: BRAND, template: `%s | ${BRAND}` });
    expect(metadata.appleWebApp).toMatchObject({ title: BRAND });
  });

  it('is the app title in both locales', () => {
    expect(getDictionary('en').appTitle).toBe(BRAND);
    expect(getDictionary('el').appTitle).toBe(BRAND);
  });

  it('uses the §3.2 bg pair as the browser theme colour', () => {
    expect(viewport.themeColor).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#F6F0E6' },
      { media: '(prefers-color-scheme: dark)', color: '#0A1A21' },
    ]);
  });
});

describe('web manifest', () => {
  it('names the brand and uses the sand background', () => {
    const manifest = readManifest();
    expect(manifest.name).toBe(BRAND);
    expect(manifest.short_name).toBe('Dolce Far Niente');
    expect(manifest.theme_color).toBe('#F6F0E6');
    expect(manifest.background_color).toBe('#F6F0E6');
  });

  it('lists icons that exist with the declared size and format', async () => {
    const icons = readManifest().icons.filter((icon) => icon.type === 'image/png');
    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const meta = await sharp(path.join(PUBLIC_DIR, icon.src)).metadata();
      expect(`${meta.width}x${meta.height}`, icon.src).toBe(icon.sizes);
      expect(meta.format, icon.src).toBe('png');
    }
  });

  it('has a maskable icon whose mark stays inside the central 80 % safe zone', async () => {
    const maskable = readManifest().icons.filter((icon) => icon.purpose?.split(' ').includes('maskable'));
    expect(maskable.length).toBeGreaterThan(0);
    for (const icon of maskable) {
      const { data, info } = await sharp(path.join(PUBLIC_DIR, icon.src))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const size = info.width;
      const safeRadius = size * 0.4;
      let outside = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) <= safeRadius) continue;
          const i = (y * size + x) * info.channels;
          // Everything outside the safe circle is the flat #0C3440 background (full bleed).
          if (data[i] !== 0x0c || data[i + 1] !== 0x34 || data[i + 2] !== 0x40) outside += 1;
        }
      }
      expect(outside, icon.src).toBe(0);
    }
  });

  it('keeps the root icon links on files that exist', async () => {
    const icons = metadata.icons as { icon: { url: string; sizes?: string }[]; apple: { url: string; sizes: string } };
    for (const entry of [...icons.icon, icons.apple]) {
      if (!entry.sizes) continue;
      const meta = await sharp(path.join(PUBLIC_DIR, entry.url)).metadata();
      expect(`${meta.width}x${meta.height}`, entry.url).toBe(entry.sizes);
    }
  });
});

describe('Open Graph share cards (identity §12 R3-V11)', () => {
  it('are 1200×630 JPEGs of at most 300 KB, one per locale', async () => {
    const cards = [
      ['public/og/og-en.jpg', statSync('public/og/og-en.jpg').size],
      ['public/og/og-el.jpg', statSync('public/og/og-el.jpg').size],
    ] as const;
    for (const [file, size] of cards) {
      const meta = await sharp(file).metadata();
      expect(`${meta.format} ${meta.width}x${meta.height}`, file).toBe('jpeg 1200x630');
      expect(size, file).toBeLessThanOrEqual(300 * 1024);
    }
  });
});

describe('host contact', () => {
  it('links Instagram without a tracking query', () => {
    const url = new URL(HOST_CONTACT.instagram);
    expect(url.origin).toBe('https://www.instagram.com');
    expect(url.pathname).toBe('/dolcefarniente_kalamata');
    expect(url.search).toBe('');
  });
});
