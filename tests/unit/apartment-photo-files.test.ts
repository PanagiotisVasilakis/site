import { readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { APARTMENT_PHOTOS } from '@/data/apartmentPhotos';

// Vitest runs with the repository root as cwd (as in brand.test.ts).
const PUBLIC_DIR = path.join(process.cwd(), 'public');
// The catalogue photos plus the generated hero crops and depth maps (identity §7.2).
const HOUSE_IMAGES = readdirSync('public/house', { recursive: true, encoding: 'utf8' })
  .filter((file) => /[.](avif|jpe?g|png|webp)$/i.test(file));

describe('apartment photo files (identity §7.1, §7.3)', () => {
  it('serves every catalogue photo from public/ as a JPEG of the declared size', async () => {
    for (const photo of APARTMENT_PHOTOS) {
      const meta = await sharp(path.join(PUBLIC_DIR, photo.src)).metadata();
      expect(meta.format, photo.src).toBe('jpeg');
      expect(`${meta.width}x${meta.height}`, photo.src).toBe(`${photo.width}x${photo.height}`);
    }
  });

  it('publishes no house image with EXIF (camera or location data), XMP, IPTC or an ICC profile', async () => {
    expect(HOUSE_IMAGES.length).toBeGreaterThan(APARTMENT_PHOTOS.length);
    for (const file of HOUSE_IMAGES) {
      const meta = await sharp(path.join(PUBLIC_DIR, 'house', file)).metadata();
      expect(meta.exif, file).toBeUndefined();
      expect(meta.xmp, file).toBeUndefined();
      expect(meta.iptc, file).toBeUndefined();
      expect(meta.hasProfile, file).toBe(false);
    }
  });
});
