import { render } from '@testing-library/react';
import Analytics from './Analytics';

const mocks = vi.hoisted(() => ({
  pathname: '/en',
  trackPageview: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

vi.mock('@/lib/analyticsClient', () => ({
  trackPageview: mocks.trackPageview,
}));

describe('Analytics', () => {
  beforeEach(() => {
    mocks.pathname = '/en';
    mocks.trackPageview.mockReset();
  });

  it('tracks the initial route and every distinct client-side pathname', () => {
    const { rerender } = render(<Analytics />);
    expect(mocks.trackPageview).toHaveBeenLastCalledWith('/en');

    mocks.pathname = '/en/apartment';
    rerender(<Analytics />);
    expect(mocks.trackPageview).toHaveBeenLastCalledWith('/en/apartment');

    rerender(<Analytics />);
    expect(mocks.trackPageview).toHaveBeenCalledTimes(2);
  });
});
