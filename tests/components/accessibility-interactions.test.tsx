// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import DocumentLocale from '@/components/DocumentLocale';

// The theme toggle cases moved to theme-switch.test.tsx with ThemeSwitch (R3-V4), which replaced ThemeToggle.
describe('document locale behavior', () => {
  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('keeps the document language synchronized on rerender', () => {
    const { rerender } = render(<DocumentLocale locale="en" />);
    expect(document.documentElement.lang).toBe('en');
    rerender(<DocumentLocale locale="el" />);
    expect(document.documentElement.lang).toBe('el');
  });
});
