#!/usr/bin/env tsx
/**
 * Attempts to download Geist font files (woff2 weights 400,500,600 regular + mono 400).
 * NOTE: Licensing: Geist is provided via Vercel; ensure you have rights before bundling.
 */
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import https from 'https';

const fonts: { url: string; file: string }[] = [
  { url: 'https://fonts.gstatic.com/s/geist/v1/Geist-Regular.woff2', file: 'geist-regular.woff2' },
  { url: 'https://fonts.gstatic.com/s/geist/v1/Geist-Medium.woff2', file: 'geist-medium.woff2' },
  { url: 'https://fonts.gstatic.com/s/geist/v1/Geist-SemiBold.woff2', file: 'geist-semibold.woff2' },
  { url: 'https://fonts.gstatic.com/s/geistmono/v1/GeistMono-Regular.woff2', file: 'geist-mono-regular.woff2' },
];

const outDir = path.join(process.cwd(), 'public', 'fonts');
mkdirSync(outDir, { recursive: true });

function fetchFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode && res.statusCode >= 400) {
        return reject(new Error('Failed ' + url + ' status ' + res.statusCode));
      }
      const data: Buffer[] = [];
      res.on('data', c => data.push(c));
      res.on('end', () => {
        try {
          writeFileSync(dest, Buffer.concat(data));
          console.log('Saved', dest);
          resolve();
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  for (const f of fonts) {
    const target = path.join(outDir, f.file);
    try {
      await fetchFile(f.url, target);
    } catch (e) {
      console.warn('Skip', f.file, e);
    }
  }
  console.log('Done. Verify licenses before distribution.');
})();
