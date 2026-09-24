import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
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
};

export default nextConfig;
