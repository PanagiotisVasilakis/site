import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation router hooks deterministically
const replaceMock = vi.fn();
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams('mode=signin'),
}));

// Mock framer-motion to avoid animations affecting test timing
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { div: (props: any) => <div {...props} /> },
  useReducedMotion: () => true,
}));

// Mock analytics tracker to no-op
vi.mock('@/lib/tracker', () => ({
  default: {
    portalOpened: () => {},
    authModeChanged: () => {},
    formSubmitted: () => {},
    originSelected: () => {},
  },
}));

// Render the client component
import UnifiedGuestClient from '../app/[locale]/guest/UnifiedGuestClient';

describe('UnifiedGuestClient', () => {
  it('syncs tab mode with URL and updates when toggled', async () => {
    const user = userEvent.setup();
    render(<UnifiedGuestClient />);

    // Initial mode is signin per mocked search params
  const signinTab = document.getElementById('tab-signin') as HTMLButtonElement;
  expect(signinTab.getAttribute('aria-selected')).toBe('true');
  const headingText = screen.getByRole('heading', { level: 1 }).textContent || '';
  expect(/sign|guest\s*sign/i.test(headingText)).toBe(true);
    // Router.replace called on mount and on mode changes
    expect(replaceMock).toHaveBeenCalledWith('/en/guest?mode=signin', { scroll: false });

    // Switch to Sign up
  await user.click(document.getElementById('tab-signup') as HTMLButtonElement);
  const signupTab = document.getElementById('tab-signup') as HTMLButtonElement;
  expect(signupTab.getAttribute('aria-selected')).toBe('true');
    expect(replaceMock).toHaveBeenLastCalledWith('/en/guest?mode=signup', { scroll: false });
  });
});
