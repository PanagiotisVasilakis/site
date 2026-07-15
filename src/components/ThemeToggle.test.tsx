import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';

vi.mock('next/navigation', () => ({ usePathname: () => '/en' }));
vi.mock('@/lib/logger-client', () => ({ logger: { warn: vi.fn() } }));

describe('ThemeToggle preference behavior', () => {
  let dark = true;
  let changeListener: (() => void) | undefined;

  beforeEach(() => {
    localStorage.clear();
    dark = true;
    changeListener = undefined;
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      get matches() { return dark; },
      media: '(prefers-color-scheme: dark)',
      addEventListener: (_event: string, listener: () => void) => { changeListener = listener; },
      removeEventListener: (_event: string, listener: () => void) => {
        if (changeListener === listener) changeListener = undefined;
      },
    })));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('follows system changes until the user explicitly chooses a theme', async () => {
    render(<ThemeToggle />);
    const button = await screen.findByRole('button', { name: 'Switch to light mode' });
    expect(localStorage.getItem('theme')).toBeNull();
    await waitFor(() => expect(changeListener).toBeTypeOf('function'));

    dark = false;
    act(() => changeListener?.());
    await waitFor(() => expect(button).toHaveAccessibleName('Switch to dark mode'));

    fireEvent.click(button);
    expect(localStorage.getItem('theme')).toBe('dark');
    dark = false;
    act(() => changeListener?.());
    expect(button).toHaveAccessibleName('Switch to light mode');
  });
});
