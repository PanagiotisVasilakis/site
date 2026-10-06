// @vitest-environment jsdom

import type { ReactElement, ReactNode } from 'react';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestHeaders = vi.hoisted(() => ({ values: new Map<string, string>() }));

vi.mock('next/headers', () => ({
  headers: async () => ({ get: (name: string) => requestHeaders.values.get(name) ?? null }),
}));

vi.mock('@/app/fonts/fonts', () => {
  const font = { variable: 'font-var', className: 'font-class', style: { fontFamily: 'x' } };
  return { textLatin: font, textGreek: font, displayLatin: font, displayGreek: font };
});

vi.mock('@/app/globals.css', () => ({}));

import RootLayout from '@/app/layout';

type ScriptProps = { nonce?: string; dangerouslySetInnerHTML?: { __html: string } };

function findScript(node: ReactNode): ReactElement<ScriptProps> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findScript(child as ReactNode);
      if (found) return found;
    }
    return null;
  }
  const element = node as ReactElement<{ children?: ReactNode } & ScriptProps>;
  if (element.type === 'script') return element as ReactElement<ScriptProps>;
  return findScript(element.props?.children);
}

async function bootScript() {
  const tree = await RootLayout({ children: null });
  const script = findScript(tree);
  expect(script).not.toBeNull();
  return script as ReactElement<ScriptProps>;
}

let matchingQueries: string[] = [];

function installMatchMedia(matching: string[]) {
  matchingQueries = matching;
}

async function runBoot() {
  const html = (await bootScript()).props.dangerouslySetInnerHTML?.__html ?? '';
  // Executes the exact inline script the layout ships, as the browser would before hydration,
  // in a context whose globals are this document, its storage and a controlled matchMedia.
  const matchMedia = (query: string) => ({ matches: matchingQueries.includes(query), media: query });
  const context: Record<string, unknown> = { document, localStorage, sessionStorage, matchMedia };
  context.window = context;
  runInNewContext(html, context);
}

const root = document.documentElement;

describe('root layout boot script (identity §5.2)', () => {
  beforeEach(() => {
    requestHeaders.values = new Map([['x-nonce', 'abc123'], ['x-locale', 'en']]);
    localStorage.clear();
    sessionStorage.clear();
    root.removeAttribute('data-theme');
    root.removeAttribute('data-motion');
    root.removeAttribute('data-intro');
    matchingQueries = [];
  });

  it('keeps the inline script nonce-bound', async () => {
    expect((await bootScript()).props.nonce).toBe('abc123');
  });

  it.each(['light', 'dark'] as const)('applies a stored %s theme', async (stored) => {
    localStorage.setItem('theme', stored);
    installMatchMedia(['(prefers-color-scheme: dark)']);
    await runBoot();
    expect(root.getAttribute('data-theme')).toBe(stored);
  });

  it('leaves data-theme unset without a stored choice, so CSS follows the OS', async () => {
    installMatchMedia(['(prefers-color-scheme: dark)']);
    await runBoot();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('ignores an invalid stored theme', async () => {
    localStorage.setItem('theme', 'sepia');
    installMatchMedia([]);
    await runBoot();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('arms motion only when the OS has no reduce preference and nothing is stored', async () => {
    installMatchMedia(['(prefers-reduced-motion: no-preference)']);
    await runBoot();
    expect(root.getAttribute('data-motion')).toBe('full');
  });

  it('honours a stored motion reduce over the OS setting', async () => {
    localStorage.setItem('motion', 'reduce');
    installMatchMedia(['(prefers-reduced-motion: no-preference)']);
    await runBoot();
    expect(root.getAttribute('data-motion')).toBe('reduce');
  });

  it('does not arm motion when the OS asks for reduced motion', async () => {
    installMatchMedia(['(prefers-reduced-motion: reduce)']);
    await runBoot();
    expect(root.hasAttribute('data-motion')).toBe(false);
  });

  it('survives blocked storage without arming a theme', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    installMatchMedia(['(prefers-reduced-motion: no-preference)']);
    await runBoot();
    expect(root.hasAttribute('data-theme')).toBe(false);
    expect(root.getAttribute('data-motion')).toBe('full');
    expect(root.hasAttribute('data-intro')).toBe(false);
  });

  it('marks only the first full-motion load of the session for the brand intro (R3-V14)', async () => {
    installMatchMedia(['(prefers-reduced-motion: no-preference)']);
    await runBoot();
    expect(root.hasAttribute('data-intro')).toBe(true);
    root.removeAttribute('data-intro');
    await runBoot();
    expect(root.hasAttribute('data-intro')).toBe(false);
  });

  it('keeps the brand intro for a later full-motion load when motion is reduced', async () => {
    localStorage.setItem('motion', 'reduce');
    installMatchMedia(['(prefers-reduced-motion: no-preference)']);
    await runBoot();
    expect(root.hasAttribute('data-intro')).toBe(false);
    localStorage.removeItem('motion');
    await runBoot();
    expect(root.hasAttribute('data-intro')).toBe(true);
  });
});
