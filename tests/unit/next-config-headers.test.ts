import { readdirSync } from 'node:fs';
import path from 'node:path';

import { checkCustomRoutes, type Header } from 'next/dist/lib/load-custom-routes';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { config as proxyConfig } from '@/proxy';

import nextConfig from '../../next.config';

type HeaderRow = { source: string; headers: Array<{ key: string; value: string }> };

const NOSNIFF = { key: 'X-Content-Type-Options', value: 'nosniff' };
const MEDIA = [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }, NOSNIFF];
const REVALIDATED = [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }, NOSNIFF];
const REVALIDATED_FILES = ['/sw.js', '/app.webmanifest', '/version.json'];

async function headerRows(): Promise<HeaderRow[]> {
  expect(nextConfig.headers).toBeTypeOf('function');
  return (await nextConfig.headers?.()) as HeaderRow[];
}

/** The rows Next applies to a request path: its router matches `source` strictly and ignoring case. */
function rowsFor(rows: HeaderRow[], pathname: string): HeaderRow[] {
  return rows.filter((row) => getPathMatch(row.source, { strict: true })(pathname) !== false);
}

/** URL paths of every file in public/, found without next.config.ts. */
function publicUrlPaths(): string[] {
  return readdirSync('public', { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${path.relative('public', path.join(entry.parentPath, entry.name)).split(path.sep).join('/')}`);
}

describe('static asset headers in next.config.ts', () => {
  afterEach(() => {
    vi.doUnmock('node:fs');
    vi.resetModules();
  });

  it('gives every file of public/ exactly one row: a day of caching for images, revalidation for the worker files', async () => {
    const rows = await headerRows();
    const files = publicUrlPaths();
    // A guard against scanning the wrong folder: these files are what the guide serves.
    expect(files).toEqual(
      expect.arrayContaining([
        '/house/kitchen/kitchen_1.jpeg',
        '/design/grain-dark.webp',
        '/icons/icon-192.png',
        '/og/og-en.jpg',
        '/phones/sos-hero.webp',
        '/moments/railway-museum.jpg',
        '/brand/mark.svg',
        '/sw.js',
        '/app.webmanifest',
      ]),
    );

    for (const file of files) {
      const matching = rowsFor(rows, file);
      expect(matching, `exactly one headers() row for ${file}`).toHaveLength(1);
      expect(matching[0]?.headers, file).toEqual(REVALIDATED_FILES.includes(file) ? REVALIDATED : MEDIA);
    }
  });

  it.each([
    '/icons/nope.png',
    '/og/x.png',
    '/house/kitchen/nope.jpeg',
    '/house/kitchen/kitchen_1.jpeg.bak',
    '/house/kitchen',
    '/house/kitchen/',
    '/house',
    '/house/',
    '/icons',
    '/icons/nope',
    '/design/x',
    '/brand/zz',
    '/housekeeping/x.jpg',
    '/zzz/nope.png',
  ])('sets nothing on %s, which is no file: a missing image keeps the 404 headers and a path without a file stays with the proxy', async (pathname) => {
    expect(rowsFor(await headerRows(), pathname)).toEqual([]);
  });

  it.each(['/sw.js', '/app.webmanifest', '/version.json'])('keeps %s revalidated on every request and sends nosniff', async (pathname) => {
    const rows = await headerRows();
    expect(rows.filter((row) => row.source === pathname).map((row) => row.headers)).toEqual([REVALIDATED]);
    expect(rowsFor(rows, pathname).map((row) => row.headers)).toEqual([REVALIDATED]);
  });

  it.each(['/favicon.ico', '/robots.txt', '/sitemap.xml'])('only adds nosniff to %s and keeps the cache policy of Next', async (pathname) => {
    expect(rowsFor(await headerRows(), pathname).map((row) => row.headers)).toEqual([[NOSNIFF]]);
  });

  it('adds nothing for pages, API routes or build assets, which the proxy or Next answer', async () => {
    // The proxy owns the security headers of every path it runs on, and it skips dotted paths and
    // /_next. Each source below is a dotted file path, so no header is set twice.
    expect(proxyConfig.matcher).toEqual(['/((?!_next|.*\\..*).*)']);

    const rows = await headerRows();
    const sources = rows.map((row) => row.source);
    expect(new Set(sources).size).toBe(sources.length);
    for (const row of rows) {
      expect(row.headers.every(({ key }) => key === 'Cache-Control' || key === NOSNIFF.key)).toBe(true);
      expect(row.source.split('/').at(-1)).toContain('.');
      expect(row.source).not.toMatch(/_next|\/api|\/admin|\/(?:en|el)\b/u);
    }
    for (const pathname of ['/en', '/el/availability', '/admin', '/api/health/live', '/_next/image', '/_next/static/chunks/main.js', '/offline']) {
      expect(rowsFor(rows, pathname), pathname).toEqual([]);
    }
  });

  it('is accepted by Next as a list of header rules', async () => {
    const rows = (await headerRows()) as Header[];
    expect(() => checkCustomRoutes(rows, 'header')).not.toThrow();
  });

  it('fails the config load for a file name that path-to-regexp would read as syntax', async () => {
    const entry = (name: string) => ({ name, parentPath: path.resolve('public'), isDirectory: () => false });
    vi.resetModules();
    vi.doMock('node:fs', async (importOriginal) => ({
      ...(await importOriginal<typeof import('node:fs')>()),
      readdirSync: () => [entry('kitchen_1.jpeg'), entry('photo (1).jpg')],
    }));

    const { default: config } = await import('../../next.config');
    await expect(config.headers?.()).rejects.toThrow('public/photo (1).jpg');
  });
});
