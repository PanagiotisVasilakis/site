import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // adjust if locking down further
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join('; '),
  },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy', value: 'geolocation=(), microphone=(), camera=()' },
];

const nextConfig: NextConfig = {
  eslint: { ignoreDuringBuilds: true },
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
  // Allow accessing dev server assets from local network IP (suppress forthcoming warning)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
