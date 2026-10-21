import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// MapCard (docs/design/identity.md §8): colours come from tokens only (the dark theme switches them at token level), so
// the pairs the marker and the controls rely on are the documented ones (tests/unit/design-tokens.test.ts).
const MAP_CSS = readFileSync('src/styles/components/map.css', 'utf8').replace(/\/\*[\s\S]*?\*\//gu, '');

type Rule = { selectors: string[]; body: string; coarse: boolean };

// Leaf `selectors { declarations }` blocks; `coarse` marks the ones inside the (hover: none), (pointer: coarse) query.
function parse(css: string): Rule[] {
  const rules: Rule[] = [];
  const preludes: string[] = [];
  let start = 0;
  let bodyStart = -1;
  for (let at = 0; at < css.length; at += 1) {
    if (css[at] === '{') {
      preludes.push(css.slice(start, at).trim());
      start = at + 1;
      bodyStart = at + 1;
    } else if (css[at] === '}') {
      const prelude = preludes.pop() ?? '';
      if (bodyStart >= 0 && !prelude.startsWith('@')) {
        rules.push({
          selectors: prelude.split(',').map((selector) => selector.replace(/\s+/gu, ' ').trim()),
          body: css.slice(bodyStart, at),
          coarse: preludes.some((outer) => outer.replace(/\s+/gu, ' ') === '@media (hover: none), (pointer: coarse)'),
        });
      }
      bodyStart = -1;
      start = at + 1;
    }
  }
  return rules;
}

const RULES = parse(MAP_CSS);

const rule = (selector: string, coarse = false): Rule => {
  const found = RULES.find((candidate) => candidate.selectors.includes(selector) && candidate.coarse === coarse);
  if (!found) throw new Error(`No rule for ${selector}`);
  return found;
};

const valueOf = (target: Rule, property: string): string | undefined => {
  for (const declaration of target.body.split(';')) {
    const [name, ...value] = declaration.split(':');
    if (name.trim() === property) return value.join(':').replace(/\s+/gu, ' ').trim();
  }
  return undefined;
};

describe('MapCard stylesheet (identity §8)', () => {
  it('uses colour tokens only', () => {
    expect(MAP_CSS.match(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/gu)).toBeNull();
  });

  // FGM-06: the guest's position used to be the phone pill of the police and fire pins.
  it('draws the position marker as a dot in the pin pair, with a ring, and no place pin class', () => {
    const dot = rule('.map-card .map-you');
    expect(valueOf(dot, 'border')).toBe('3px solid var(--color-pin-bg)');
    expect(valueOf(dot, 'background')).toBe('var(--color-pin-fg)');
    expect(valueOf(dot, 'border-radius')).toBe('50%');
    expect(valueOf(dot, 'translate')).toBe('-50% -50%');
    expect(valueOf(dot, 'animation')).toBeUndefined();
  });

  // FGM-07: the card clips an outline outside the canvas and Leaflet's panes (z-index 200-700) cover one inside it.
  it('shows the keyboard focus of the map canvas as a border above the panes that lets clicks through', () => {
    expect(valueOf(rule('.map-card .map-card__canvas:focus-visible'), 'outline')).toBe('none');
    const ring = rule('.map-card .map-card__canvas:focus-visible::after');
    expect(valueOf(ring, 'border')).toBe('3px solid var(--color-focus)');
    expect(valueOf(ring, 'pointer-events')).toBe('none');
    expect(Number(valueOf(ring, 'z-index'))).toBeGreaterThanOrEqual(1000);
  });

  // FGM-06: the dismiss button of the location message.
  it('sizes the close button of the location message as a touch target on coarse pointers and rings it in the text colour', () => {
    const button = rule('.map-card .map-card__error-close');
    expect(valueOf(button, 'width')).toBe('32px');
    expect(valueOf(button, 'height')).toBe('32px');
    const touch = rule('.map-card .map-card__error-close', true);
    expect(valueOf(touch, 'width')).toBe('44px');
    expect(valueOf(touch, 'height')).toBe('44px');
    expect(valueOf(rule('.map-card .map-card__error-close:focus-visible'), 'outline')).toBe('3px solid currentColor');
  });
});
