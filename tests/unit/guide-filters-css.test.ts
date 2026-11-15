import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Review 5, finding R-627: `.guide-filters` is a grid. Without an explicit column track its implicit `auto`
// column grows to the min-content of the chip row, so the List/Map toggle sits off a phone screen.
const GUIDE_CSS = readFileSync('src/styles/components/guide.css', 'utf8');

describe('guide filter block (guide.css)', () => {
  it('keeps the guide filter grid column inside its container, so the List/Map toggle stays on a phone screen', () => {
    const rule = /^\.guide-filters\s*\{([^{}]*)\}/mu.exec(GUIDE_CSS);
    expect(rule).not.toBeNull();
    const block = rule?.[1] ?? '';
    expect(block).toMatch(/(?:^|[;\s])grid-template-columns\s*:\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*(?:;|$)/u);
  });
});
