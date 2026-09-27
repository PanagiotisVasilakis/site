import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import React from 'react';
import { afterEach, vi } from 'vitest';

process.env.ADMIN_JWT_SECRET ??= 'admin-test-secret-that-is-at-least-32-characters';
process.env.GUEST_JWT_SECRET ??= 'guest-test-secret-that-is-at-least-32-characters';
// `||=`: the release gate masks every local key to an empty string, and the
// HMAC keys have no fallback, so the test values must replace empty ones too.
process.env.SECURITY_PEPPER ||= 'security-test-pepper-that-is-at-least-32-characters';
process.env.CLAIM_TOKEN_PEPPER ||= 'claim-token-test-pepper-that-is-at-least-32-characters';
process.env.NEXT_PUBLIC_SITE_URL ??= 'https://guest-guide.test';

vi.mock('next/image', () => ({
  default: ({ src, alt, fill: _fill, priority: _priority, ...props }: {
    src: string | { src: string };
    alt: string;
    fill?: boolean;
    priority?: boolean;
    [key: string]: unknown;
  }) => {
    void _fill;
    void _priority;
    const resolvedSrc = typeof src === 'string' ? src : src.src;
    return React.createElement('img', { ...props, src: resolvedSrc, alt });
  },
}));

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
  }
});
