import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'www.vgkareliascollection.com' },
      { protocol: 'https', hostname: 'www.kalamata.gr' },
      { protocol: 'https', hostname: 'archaeologicalmuseums.gr' },
      { protocol: 'https', hostname: 'warmuseum.gr' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
    ],
  },
  turbopack: {
    // Explicit root to silence multiple lockfile inference warning
    root: __dirname,
  },
  webpack(config, { dev }) {
    // Mitigate intermittent ENOENT rename errors in Next.js filesystem webpack pack cache on macOS
    // by switching to in-memory cache during development.
    if (dev) {
      // Narrow type: Next.js webpack config cache can be undefined | false | object; we set simple in-memory cache.
      config.cache = { type: 'memory' } as { type: 'memory' };
    }
    return config;
  },
};

export default nextConfig;
