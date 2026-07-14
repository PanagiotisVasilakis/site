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
    environment: 'node',
    include: [
      'src/__tests__/portalApi.test.ts',
      'src/__tests__/public-exports.test.ts',
      'src/__tests__/portalClaims.db.test.ts',
      'src/__tests__/operations.db.test.ts',
    ],
    setupFiles: [
      './src/__tests__/setup/vitest.setup.ts',
      './src/__tests__/setup/database.setup.ts',
    ],
    globals: true,
    fileParallelism: false,
    maxWorkers: 1,
  },
});
