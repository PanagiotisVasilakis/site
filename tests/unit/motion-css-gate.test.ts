import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// identity §5.1/§5.2: motion is static by construction and armed only by `data-motion="full"` without an OS
// reduce preference. Every rule in the design stylesheets that starts motion (an animation, a transition,
// a scroll timeline or a view-transition name) must sit inside `@media (prefers-reduced-motion:
// no-preference)` and select under `:root[data-motion="full"]`; scroll-driven ones also inside
// `@supports (animation-timeline …)`.
const SHEETS: Array<[file: string, css: string]> = [
  ['motion.css', readFileSync('src/styles/motion.css', 'utf8')],
  ['components/admin.css', readFileSync('src/styles/components/admin.css', 'utf8')],
  ['components/apartment.css', readFileSync('src/styles/components/apartment.css', 'utf8')],
  ['components/calendar.css', readFileSync('src/styles/components/calendar.css', 'utf8')],
  ['components/guide.css', readFileSync('src/styles/components/guide.css', 'utf8')],
  ['components/hero.css', readFileSync('src/styles/components/hero.css', 'utf8')],
  ['components/home.css', readFileSync('src/styles/components/home.css', 'utf8')],
  ['components/legal.css', readFileSync('src/styles/components/legal.css', 'utf8')],
  ['components/lightbox.css', readFileSync('src/styles/components/lightbox.css', 'utf8')],
  ['components/map.css', readFileSync('src/styles/components/map.css', 'utf8')],
  ['components/shell.css', readFileSync('src/styles/components/shell.css', 'utf8')],
  ['components/stay.css', readFileSync('src/styles/components/stay.css', 'utf8')],
  ['components/ui.css', readFileSync('src/styles/components/ui.css', 'utf8')],
];

type Rule = { file: string; selector: string; atRules: string[]; body: string };

function rulesOf([file, source]: [string, string]): Rule[] {
  const css = source.replace(/\/\*[\s\S]*?\*\//gu, '');
  const rules: Rule[] = [];
  const walk = (text: string, atRules: string[]) => {
    let at = 0;
    while (at < text.length) {
      const open = text.indexOf('{', at);
      if (open < 0) return;
      let depth = 1;
      let close = open + 1;
      for (; close < text.length && depth > 0; close += 1) {
        if (text[close] === '{') depth += 1;
        if (text[close] === '}') depth -= 1;
      }
      const prelude = text.slice(at, open).replace(/^[\s\S]*;/u, '').trim();
      const body = text.slice(open + 1, close - 1);
      if (prelude.startsWith('@keyframes')) {
        // keyframe steps are not rules
      } else if (prelude.startsWith('@')) {
        walk(body, [...atRules, prelude]);
      } else {
        rules.push({ file, selector: prelude, atRules, body });
        if (body.includes('{')) walk(body, atRules);
      }
      at = close;
    }
  };
  walk(css, []);
  return rules;
}

const RULES = SHEETS.flatMap(rulesOf);
/** The WebGL canvas fade: the canvas exists only after the hero's own capability gate (§5.6). */
const JS_GATED = new Set(['components/hero.css: .hero__gl']);
const declares = (body: string, property: RegExp) =>
  body.replace(/\{[^{}]*\}/gu, '').split(';').some((declaration) => {
    const [name, ...value] = declaration.split(':');
    return property.test(name.trim()) && !/^\s*none\b/u.test(value.join(':'));
  });

describe('motion gate in the design stylesheets (identity §5.2)', () => {
  it('reads motion.css and every component stylesheet', () => {
    const listed = readdirSync('src/styles/components').filter((file) => file.endsWith('.css')).map((file) => `components/${file}`);
    expect(SHEETS.map(([file]) => file).sort()).toEqual(['motion.css', ...listed].sort());
  });

  it('parses the motion rules (sanity check)', () => {
    expect(RULES.some((rule) => rule.selector.includes('.ui-section__title'))).toBe(true);
    expect(RULES.some((rule) => rule.selector.includes('.site-header__progress'))).toBe(true);
  });

  it('arms every animation, transition and view-transition name only under data-motion="full" without reduced motion', () => {
    const ungated = RULES.filter((rule) => declares(rule.body, /^(animation(-name|-timeline)?|transition(-property)?|view-transition-name)$/u))
      .filter((rule) => !rule.atRules.some((at) => at.includes('prefers-reduced-motion: no-preference'))
        || !rule.selector.split(',').every((part) => part.includes(':root[data-motion="full"]')))
      .map((rule) => `${rule.file}: ${rule.selector}`)
      .filter((rule) => !JS_GATED.has(rule));
    expect(ungated).toEqual([]);
  });

  it('keeps every scroll-driven animation inside @supports (animation-timeline …)', () => {
    const unsupported = RULES.filter((rule) => declares(rule.body, /^(animation-timeline|view-timeline)$/u))
      .filter((rule) => !rule.atRules.some((at) => at.startsWith('@supports (animation-timeline')))
      .map((rule) => `${rule.file}: ${rule.selector}`);
    expect(unsupported).toEqual([]);
  });
});
