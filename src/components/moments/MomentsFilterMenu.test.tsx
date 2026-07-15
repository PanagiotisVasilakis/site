import { render, screen } from '@testing-library/react';
import { CategoryChips, filterMomentsByCategory } from './MomentsFilterMenu';

describe('moments category filters', () => {
  it('renders only filters backed by current content', () => {
    render(
      <CategoryChips
        active="all"
        onChange={vi.fn()}
        availableFilters={['all', 'museums']}
      />,
    );

    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Museums' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Beaches' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nearby' })).not.toBeInTheDocument();
  });

  it('does not pretend an empty category matches every item', () => {
    const items = [{ tags: ['museum'] }, { tags: ['history'] }];
    expect(filterMomentsByCategory(items, 'beaches')).toEqual([]);
    expect(filterMomentsByCategory(items, 'all')).toEqual(items);
  });
});
