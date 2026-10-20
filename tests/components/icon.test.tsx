// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Icon } from '@/components/icons/Icon';

describe('Icon (identity §6)', () => {
  it('forwards className and size', () => {
    const { container } = render(<Icon name="bus" className="h-5 w-5" size={20} />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('class')).toBe('h-5 w-5');
    expect(svg?.getAttribute('width')).toBe('20');
    expect(svg?.getAttribute('height')).toBe('20');
  });
});
