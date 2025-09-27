import React from 'react';
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
  tracker: {
    portalOpened: vi.fn(),
    authModeChanged: vi.fn(),
    formSubmitted: vi.fn(),
    originSelected: vi.fn(),
    noBookingCTAClicked: vi.fn(),
    checkinViewed: vi.fn(),
    checkinCompleted: vi.fn(),
  },
  track: vi.fn(),
  categorizeReason: vi.fn(),
}));

// Render the client component
import UnifiedGuestClient from '../app/[locale]/guest/UnifiedGuestClient';

describe('UnifiedGuestClient', () => {
  it('syncs tab mode with URL and updates when toggled', async () => {
    const user = userEvent.setup();
    render(<UnifiedGuestClient />);

    // Entry gate: reveal tabs by choosing existing booking
  await user.click(screen.getByRole('button', { name: /Booking & Check-in Details/i }));

  // Initial mode is signin per mocked search params
    const signinTab = document.getElementById('tab-signin') as HTMLButtonElement;
    expect(signinTab.getAttribute('aria-selected')).toBe('true');
    // Panel should be present and associated to the active tab
    const signInPanel = document.getElementById('panel-signin') as HTMLDivElement;
    expect(signInPanel).toBeTruthy();
    expect(signInPanel.getAttribute('role')).toBe('tabpanel');
    expect(signInPanel.getAttribute('aria-labelledby')).toBe('tab-signin');
    // Router.replace called on mount and on mode changes
    expect(replaceMock).toHaveBeenCalledWith('/en/guest?mode=signin', { scroll: false });

    // Switch to Sign up
    await user.click(document.getElementById('tab-signup') as HTMLButtonElement);
    const signupTab = document.getElementById('tab-signup') as HTMLButtonElement;
    expect(signupTab.getAttribute('aria-selected')).toBe('true');
    const signUpPanel = document.getElementById('panel-signup') as HTMLDivElement;
    expect(signUpPanel).toBeTruthy();
    expect(signUpPanel.getAttribute('role')).toBe('tabpanel');
    expect(signUpPanel.getAttribute('aria-labelledby')).toBe('tab-signup');
    expect(replaceMock).toHaveBeenLastCalledWith('/en/guest?mode=signup', { scroll: false });
  });
});
