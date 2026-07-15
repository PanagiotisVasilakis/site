import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { validateImageAssets } from '../check-image-assets';

describe('image asset validation', () => {
  let fixtureDirectory: string;

  beforeEach(async () => {
    fixtureDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'image-assets-'));
  });

  afterEach(async () => {
    await fs.rm(fixtureDirectory, { recursive: true, force: true });
  });

  it('accepts decodable images whose extensions match their content', async () => {
    await sharp({
      create: { width: 8, height: 8, channels: 4, background: '#224466ff' },
    }).png().toFile(path.join(fixtureDirectory, 'valid.png'));
    await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#446688' },
    }).webp().toFile(path.join(fixtureDirectory, 'valid.webp'));

    const result = await validateImageAssets({ rootDir: fixtureDirectory, maxBytes: 10_000 });

    expect(result).toEqual({ checked: 2, issues: [] });
  });

  it('reports extension/content mismatches and oversized files', async () => {
    const misleadingPath = path.join(fixtureDirectory, 'actually-jpeg.png');
    await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#6688aa' },
    }).jpeg().toFile(misleadingPath);

    const result = await validateImageAssets({ rootDir: fixtureDirectory, maxBytes: 1 });

    expect(result.checked).toBe(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'actually-jpeg.png', message: expect.stringContaining('maximum allowed') }),
      expect.objectContaining({ file: 'actually-jpeg.png', message: expect.stringContaining('detected format jpeg') }),
    ]));
  });

  it('reports corrupt image payloads', async () => {
    await fs.writeFile(path.join(fixtureDirectory, 'broken.jpg'), 'not an image');

    const result = await validateImageAssets({ rootDir: fixtureDirectory });

    expect(result.issues).toEqual([
      expect.objectContaining({ file: 'broken.jpg', message: expect.stringContaining('cannot be decoded') }),
    ]);
  });
});
