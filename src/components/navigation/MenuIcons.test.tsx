import { render } from '@testing-library/react';
import { ChevronIcon, MenuGlyph, MenuIcon, type MenuIconName } from '@/components/navigation/MenuIcons';

describe('navigation icons', () => {
  it('renders every configured menu icon without accessible noise', () => {
    const names: MenuIconName[] = [
      'gallery',
      'calendar',
      'booking',
      'about',
      'favorite',
      'moments',
      'phone',
      'checkin',
      'user',
    ];
    const { container } = render(
      <div>
        {names.map((name) => <MenuIcon key={name} name={name} />)}
        <ChevronIcon />
        <MenuGlyph open={false} />
        <MenuGlyph open />
      </div>,
    );

    expect(container.querySelectorAll('svg')).toHaveLength(10);
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(10);
    expect(container.querySelectorAll('.menu-trigger-line.is-open')).toHaveLength(2);
  });
});
