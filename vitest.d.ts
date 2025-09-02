/// <reference types="vitest" />
import '@testing-library/jest-dom';

declare module 'vitest' {
  interface Assertion<T = any> {
    toBeInTheDocument(): void;
    toHaveTextContent(text: string | RegExp, options?: { normalizeWhitespace?: boolean }): void;
  }
}

// Fallback ambient declarations in case editor doesn't pick up vitest globals
declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => any) => void;
declare const expect: (value: any) => any;