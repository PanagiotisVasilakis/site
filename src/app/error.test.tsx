import { render, screen } from '@testing-library/react';
import ErrorPage from './error';

const mocks = vi.hoisted(() => ({
  reportError: vi.fn(),
  addBreadcrumb: vi.fn(),
}));

vi.mock('@/lib/errorBoundary', () => ({
  useErrorHandler: () => ({ reportError: mocks.reportError }),
}));

vi.mock('@/lib/errorReporting', () => ({
  useErrorReporting: () => ({ reportError: mocks.reportError, addBreadcrumb: mocks.addBreadcrumb }),
}));

describe('route error boundary', () => {
  it('renders inside the existing document with one accessible main landmark', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const { container } = render(<ErrorPage error={new Error('boom')} reset={vi.fn()} />);

      const alert = screen.getByRole('alert');
      expect(alert.tagName).toBe('MAIN');
      expect(alert).toHaveAccessibleName('Oops! Something went wrong');
      expect(container.querySelector('html, body')).toBeNull();
      expect(container.querySelectorAll('main')).toHaveLength(1);
    } finally {
      consoleError.mockRestore();
    }
  });
});
