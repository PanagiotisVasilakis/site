import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

// R3-V10 (identity §9.12): admin colours come from the semantic tokens (src/styles/tokens.css), which carry
// dark mode at token level (§3.1), so admin rules hold no colour literals and no per-component dark selectors.

const ADMIN_CSS = path.resolve(__dirname, '../../src/styles/components/admin.css');
// Classes used by src/app/admin/**, AdminSessionManager and the admin-only ui primitives (Badge).
const ADMIN_SELECTOR = /\.(admin-[a-z0-9_-]+|status-badge[a-z0-9_-]*|feedback-[a-z]+)\b/;
const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|color-mix)\(/i;

type Rule = { selector: string; body: string; media: string | null };

function parseRules(css: string): Rule[] {
  const rules: Rule[] = [];
  const stack: string[] = [];
  let buffer = '';
  for (const char of css.replace(/\/\*[\s\S]*?\*\//g, '')) {
    if (char === '{') {
      stack.push(buffer.trim());
      buffer = '';
    } else if (char === '}') {
      const selector = stack.pop() ?? '';
      if (!selector.startsWith('@')) {
        const media = stack.find((entry) => entry.startsWith('@media')) ?? null;
        rules.push({ selector, body: buffer.trim(), media });
      }
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return rules;
}

// Admin components (Vitest runs with the repository root as cwd): every file under src/app/admin, plus the
// components only admin pages import. The listing check below makes a new admin file join this list.
const ADMIN_SOURCES: Array<[file: string, source: string]> = [
  ['src/app/admin/AdminHomeClient.tsx', readFileSync('src/app/admin/AdminHomeClient.tsx', 'utf8')],
  ['src/app/admin/layout.tsx', readFileSync('src/app/admin/layout.tsx', 'utf8')],
  ['src/app/admin/page.tsx', readFileSync('src/app/admin/page.tsx', 'utf8')],
  ['src/app/admin/availability/AdminAvailabilityClient.tsx', readFileSync('src/app/admin/availability/AdminAvailabilityClient.tsx', 'utf8')],
  ['src/app/admin/availability/page.tsx', readFileSync('src/app/admin/availability/page.tsx', 'utf8')],
  ['src/app/admin/guests/layout.tsx', readFileSync('src/app/admin/guests/layout.tsx', 'utf8')],
  ['src/app/admin/guests/page.tsx', readFileSync('src/app/admin/guests/page.tsx', 'utf8')],
  ['src/app/admin/login/AdminLoginClient.tsx', readFileSync('src/app/admin/login/AdminLoginClient.tsx', 'utf8')],
  ['src/app/admin/login/page.tsx', readFileSync('src/app/admin/login/page.tsx', 'utf8')],
  ['src/app/admin/requests/AdminRequestsClient.tsx', readFileSync('src/app/admin/requests/AdminRequestsClient.tsx', 'utf8')],
  ['src/app/admin/requests/page.tsx', readFileSync('src/app/admin/requests/page.tsx', 'utf8')],
  ['src/app/admin/settings/AdminSettingsClient.tsx', readFileSync('src/app/admin/settings/AdminSettingsClient.tsx', 'utf8')],
  ['src/app/admin/settings/page.tsx', readFileSync('src/app/admin/settings/page.tsx', 'utf8')],
  ['src/components/AdminSessionManager.tsx', readFileSync('src/components/AdminSessionManager.tsx', 'utf8')],
  ['src/components/ui/Badge.tsx', readFileSync('src/components/ui/Badge.tsx', 'utf8')],
  ['src/components/ui/EmptyPanel.tsx', readFileSync('src/components/ui/EmptyPanel.tsx', 'utf8')],
  ['src/components/ui/MetricCard.tsx', readFileSync('src/components/ui/MetricCard.tsx', 'utf8')],
  ['src/components/ui/Surface.tsx', readFileSync('src/components/ui/Surface.tsx', 'utf8')],
];
// Tailwind palette colours, white/black, and the legacy colour classes replaced by admin token classes.
const PALETTE_UTILITY = /(?:^|[\s'"`:])(?:bg|text|border|ring|from|to|via|divide|outline)-(?:(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}|white|black)\b/;
const LEGACY_COLOUR_CLASS = /(?:^|[\s'"`])(?:text-body|text-subtle|text-text-accent|text-text-accent-subtle|page-title|section-title|surface-card|surface-panel|surface-interactive|border-soft|btn-primary|admin-page-shell)(?=[\s'"`])/;

const adminRules = parseRules(readFileSync(ADMIN_CSS, 'utf8')).filter((rule) => ADMIN_SELECTOR.test(rule.selector));

describe('admin CSS uses semantic tokens (R3-V10)', () => {
  it('finds the admin rules', () => {
    expect(adminRules.length).toBeGreaterThan(10);
  });

  it('has no colour literals in admin rules', () => {
    expect(adminRules.filter((rule) => COLOUR_LITERAL.test(rule.body)).map((rule) => rule.selector)).toEqual([]);
  });

  it('has no per-component dark selectors for admin (the tokens switch at :root)', () => {
    const dark = adminRules.filter((rule) => rule.selector.includes('data-theme')
      || (rule.media !== null && rule.media.includes('prefers-color-scheme')));
    expect(dark.map((rule) => rule.selector)).toEqual([]);
  });

  it('takes every admin colour from a --color-* token', () => {
    const colourDeclarations = adminRules.flatMap((rule) => rule.body.split(';')
      .map((declaration) => declaration.trim())
      .filter((declaration) => /^(color|background|background-color|border-color|border|border-bottom-color|outline)\s*:/.test(declaration))
      .filter((declaration) => !/var\(--color-[a-z-]+\)|transparent|currentColor|inherit|none/.test(declaration))
      .map((declaration) => `${rule.selector} { ${declaration} }`));
    expect(colourDeclarations).toEqual([]);
  });

  it('scans every admin page file', () => {
    const listed = readdirSync('src/app/admin', { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.tsx'))
      .map((file) => `src/app/admin/${file.split(path.sep).join('/')}`)
      .sort();
    expect(ADMIN_SOURCES.map(([file]) => file).filter((file) => file.startsWith('src/app/admin/')).sort()).toEqual(listed);
  });

  it('admin components use token classes: no palette utilities, no dark: variants, no legacy colour classes', () => {
    const offending = ADMIN_SOURCES.flatMap(([file, source]) => source.split('\n')
      .map((line, index) => ({ line, at: `${file}:${index + 1}` }))
      .filter(({ line }) => PALETTE_UTILITY.test(line) || /\bdark:/.test(line) || LEGACY_COLOUR_CLASS.test(line))
      .map(({ at, line }) => `${at}: ${line.trim()}`));
    expect(offending).toEqual([]);
  });
});
