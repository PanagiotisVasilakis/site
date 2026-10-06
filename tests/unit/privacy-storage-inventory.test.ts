/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

import { getDictionary } from '@/i18n/dictionaries';

// The privacy notice lists every cookie and browser storage key by name. This scans the
// client-reachable source (src/ without the generated Prisma client, and the service worker)
// so that a new key, or one no longer used, fails here until the notice is updated.
const SOURCES = import.meta.glob(
  ['/src/**/*.{ts,tsx,js,mjs}', '!/src/generated/**', '/public/sw.js'],
  { query: '?raw', import: 'default', eager: true },
);
const FILES = Object.entries(SOURCES).map(([file, text]) => {
  if (typeof text !== 'string') throw new Error(`${file} did not load as text`);
  return { file, text };
});

// `const NAME = 'value'` declarations, to resolve keys passed as constants: the calling file's
// own declaration first (several files declare e.g. `KEY`), else an imported one.
function constantsOf(text: string): Map<string, string> {
  return new Map([...text.matchAll(/const ([A-Z_][A-Z0-9_]*)\s*=\s*(['"])([^'"]+)\2/gu)]
    .map((match): [string, string] => [match[1], match[3]]));
}
const ALL_CONSTANTS = new Map(FILES.flatMap(({ text }) => [...constantsOf(text)]));

function constantValue(name: string, text: string): string {
  const value = constantsOf(text).get(name) ?? ALL_CONSTANTS.get(name);
  if (value === undefined) throw new Error(`Cannot resolve the storage key constant ${name}`);
  return value;
}

const STORAGE_CALLS = {
  localStorage: /localStorage\.(?:getItem|setItem|removeItem)\(\s*(?:(['"])([^'"]+)\1|([A-Z_][A-Z0-9_]*))/gu,
  sessionStorage: /\bsessionStorage\.(?:getItem|setItem|removeItem)\(\s*(?:(['"])([^'"]+)\1|([A-Z_][A-Z0-9_]*))/gu,
} as const;

function usedStorageKeys(storage: keyof typeof STORAGE_CALLS): Set<string> {
  const keys = new Set<string>();
  const call = STORAGE_CALLS[storage];
  for (const { text } of FILES) {
    for (const match of text.matchAll(call)) keys.add(match[2] ?? constantValue(match[3], text));
  }
  return keys;
}

function usedCookieNames(): Set<string> {
  const names = new Set<string>();
  for (const { text } of FILES) {
    for (const match of text.matchAll(/const \w*COOKIE\w*\s*=\s*(['"])([^'"]+)\1/gu)) names.add(match[2]);
    for (const match of text.matchAll(/cookies(?:\(\))?\.set\(\s*(['"])([^'"]+)\1/gu)) names.add(match[2]);
  }
  return names;
}

describe('privacy notice storage inventory', () => {
  it.each(['en', 'el'] as const)('lists exactly the localStorage keys the code uses (%s)', (locale) => {
    const listed = Object.keys(getDictionary(locale).legal.privacy.storage.localStorage).sort();
    expect(listed).toEqual([...usedStorageKeys('localStorage')].sort());
  });

  it.each(['en', 'el'] as const)('lists exactly the sessionStorage keys the code uses (%s)', (locale) => {
    const listed = Object.keys(getDictionary(locale).legal.privacy.storage.sessionStorage).sort();
    expect(listed).toEqual([...usedStorageKeys('sessionStorage')].sort());
  });

  it.each(['en', 'el'] as const)('lists exactly the cookies the code sets (%s)', (locale) => {
    const listed = Object.keys(getDictionary(locale).legal.privacy.storage.cookies).sort();
    expect(listed).toEqual([...usedCookieNames()].sort());
  });

  it('uses no other browser storage the notice would have to name', () => {
    // sessionStorage only through getItem/setItem/removeItem with a literal or constant key, so the key
    // list above sees every key. Exempt: the notice's prose (legal.ts) and its dictionary property
    // (`t.storage.sessionStorage` on the privacy page).
    const other = FILES.filter(({ file, text }) => /\bindexedDB\b|document\.cookie/u.test(text)
      || (file !== '/src/i18n/domains/legal.ts'
        && /(?<!\bstorage\.)\bsessionStorage\b(?!\.(?:getItem|setItem|removeItem)\(\s*(?:['"]|[A-Z_][A-Z0-9_]*\s*[,)]))/u.test(text)))
      .map(({ file }) => file);
    expect(other).toEqual([]);
  });

  it('keeps the service-worker cache the notice describes', () => {
    const sw = FILES.find(({ file }) => file === '/public/sw.js')?.text;
    expect(sw).toContain("const CACHE_PREFIX = 'guest-guide-';");
    for (const prefix of ['/admin', '/en/check-in', '/en/guest', '/en/portal']) expect(sw).toContain(`'${prefix}'`);
  });
});
