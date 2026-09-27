import type { NextConfig } from "next";

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
};

export default nextConfig;
