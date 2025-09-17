/// <reference types="vitest" />
import '@testing-library/jest-dom';

declare module 'vitest' {
  interface Assertion<T = unknown> {
    toBeInTheDocument(): T;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace?: boolean }): T;
    toBeDisabled(): T;
    toBeEnabled(): T;
    toMatchInlineSnapshot(snapshot?: string): T;
  }
  interface AsymmetricMatchersContaining {
    toBeInTheDocument(): unknown;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace?: boolean }): unknown;
    toBeDisabled(): unknown;
    toBeEnabled(): unknown;
  }
}

// Global vitest types
declare global {
  const vi: typeof import('vitest').vi;
  const describe: typeof import('vitest').describe;
  const it: typeof import('vitest').it;
  const test: typeof import('vitest').test;
  const expect: typeof import('vitest').expect;
  const beforeEach: typeof import('vitest').beforeEach;
  const afterEach: typeof import('vitest').afterEach;
  const beforeAll: typeof import('vitest').beforeAll;
  const afterAll: typeof import('vitest').afterAll;
}