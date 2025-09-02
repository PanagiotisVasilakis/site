import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: { provider: 'v8', reporter: ['text','lcov'], all: true, thresholds: { lines: 70, branches: 60, functions: 70, statements: 70 } },
  },
});
