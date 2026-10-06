// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '@/components/icons/Icon';
import { ICON_NAMES } from '@/components/icons/iconNames';

describe('Icon (identity §6)', () => {
  it('has unique names', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it('renders every icon as a decorative 24x24 stroked svg', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg');
      expect(svg, name).not.toBeNull();
      expect(container.children, name).toHaveLength(1);
      expect(svg?.getAttribute('aria-hidden'), name).toBe('true');
      expect(svg?.getAttribute('focusable'), name).toBe('false');
      expect(svg?.getAttribute('viewBox'), name).toBe('0 0 24 24');
      expect(svg?.getAttribute('fill'), name).toBe('none');
      expect(svg?.getAttribute('stroke'), name).toBe('currentColor');
      expect(svg?.getAttribute('stroke-width'), name).toBe('1.75');
      expect(svg?.getAttribute('stroke-linecap'), name).toBe('round');
      expect(svg?.getAttribute('stroke-linejoin'), name).toBe('round');
      expect(svg?.children.length, name).toBeGreaterThan(0);
      expect(svg?.textContent, name).toBe('');
      unmount();
    }
  });

  it('draws a distinct shape for every name', () => {
    const markup = ICON_NAMES.map((name) => render(<Icon name={name} />).container.innerHTML);
    expect(new Set(markup).size).toBe(ICON_NAMES.length);
  });

  it('forwards className and size', () => {
    const { container } = render(<Icon name="bus" className="h-5 w-5" size={20} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('h-5 w-5');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
  });
});
