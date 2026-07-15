import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    root,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    clearMocks: true,
    mockReset: true,
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    passWithNoTests: false,
    pool: 'forks',
    fileParallelism: true,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
