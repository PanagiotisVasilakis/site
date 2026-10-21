import { readdirSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

// src/proxy.ts skips every path with a dot, so files from public/ (and the dotted metadata
// routes) get neither its security headers nor a cache policy: Next answers a public file
// with `Cache-Control: public, max-age=0`, which keeps Cloudflare from caching the photos.
// The headers below are set here, one row per file that exists. A prefix rule such as
// `/icons/:path*` would also match a missing file (its 404 would be cached for a day) and the
// proxy's locale redirects of extension-less paths, which are not static files. Pages, API
// routes and every other response keep the headers of the proxy and of Next.
const NOSNIFF = { key: 'X-Content-Type-Options', value: 'nosniff' };

// Images and icons in public/. The files are not content-hashed, so a day is fresh and a week
// may be served stale while the cache revalidates. Every file of public/ that no list below
// names gets this policy, so a new file or folder needs no entry here.
const MEDIA_CACHE_CONTROL = 'public, max-age=86400, stale-while-revalidate=604800';

// Revalidated on every request: the service worker script, the manifest and the build
// identity that makes each deploy install a new worker (public/sw.js).
const REVALIDATED_FILES = ['/sw.js', '/app.webmanifest', '/version.json'];
const REVALIDATE_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

// Metadata routes with a dotted URL: Next sets their Cache-Control, only nosniff is missing.
const NOSNIFF_ONLY_FILES = ['/favicon.ico', '/robots.txt', '/sitemap.xml'];

// `source` is a path-to-regexp pattern, so a name is limited to characters it reads literally.
// Any other name fails the build instead of silently matching nothing.
const LITERAL_FILE_NAME = /^[\w.-]+$/u;

const PUBLIC_DIR = path.join(__dirname, 'public');

/** URL paths of the files below public/, e.g. /house/kitchen/kitchen_1.jpeg. */
function publicFilePaths(): string[] {
  const urlPaths: string[] = [];
  for (const entry of readdirSync(PUBLIC_DIR, { recursive: true, withFileTypes: true })) {
    const urlPath = `/${path.relative(PUBLIC_DIR, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')}`;
    if (!LITERAL_FILE_NAME.test(entry.name)) {
      throw new Error(`public${urlPath}: names under public/ may only use letters, digits, "_", "-" and "."`);
    }
    if (!entry.isDirectory()) urlPaths.push(urlPath);
  }
  return urlPaths.sort();
}

const nextConfig: NextConfig = {
  output: 'standalone',
  // `next dev` would otherwise rewrite the tracked CLAUDE.md/AGENTS.md on every start.
  agentRules: false,
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/*': [
      './node_modules/sharp/**/*',
      './node_modules/@img/colour/**/*',
      './node_modules/@img/sharp-*/**/*',
    ],
  },
  turbopack: {
    // Explicit root to silence multiple lockfile inference warning
    root: __dirname,
  },
  async headers() {
    const namedFiles = new Set([...REVALIDATED_FILES, ...NOSNIFF_ONLY_FILES]);
    const mediaFiles = publicFilePaths().filter((file) => !namedFiles.has(file));
    return [
      ...mediaFiles.map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: MEDIA_CACHE_CONTROL }, NOSNIFF],
      })),
      ...REVALIDATED_FILES.map((source) => ({
        source,
        headers: [{ key: 'Cache-Control', value: REVALIDATE_CACHE_CONTROL }, NOSNIFF],
      })),
      ...NOSNIFF_ONLY_FILES.map((source) => ({ source, headers: [NOSNIFF] })),
    ];
  },
};

export default nextConfig;
