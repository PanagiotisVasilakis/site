import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/__tests__/**/*.test.ts'],
    exclude: [
      'src/__tests__/portalApi.test.ts',
      'src/__tests__/public-exports.test.ts',
      'src/__tests__/portalClaims.db.test.ts',
      'src/__tests__/operations.db.test.ts',
      'src/__tests__/migrationGuards.db.test.ts',
    ],
    setupFiles: ['./src/__tests__/setup/vitest.setup.ts'],
    globals: true, // Enable global test functions
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      all: true,
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
      // Generated Prisma clients and declaration-only modules are not authored logic.
      exclude: [
        'src/generated/**',
        'src/types/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        '**/__tests__/**',
      ],
      thresholds: {
        // Baseline gate for the currently instrumented repository. Raise as coverage grows.
        lines: 30,
        branches: 58,
        functions: 60,
        statements: 30,
      },
    },
  },
});
