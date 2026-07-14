import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock next/navigation router hooks deterministically
const replaceMock = vi.fn();
const pushMock = vi.fn();
const internalFetchMock = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
  useSearchParams: () => new URLSearchParams('mode=signin'),
}));

vi.mock('@/lib/internalFetchClient', () => ({
  default: internalFetchMock,
}));

// Mock framer-motion to avoid animations affecting test timing
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: (props: any) => {
      const cleaned = { ...props };
      delete cleaned.layout;
      delete cleaned.animate;
      delete cleaned.transition;
      delete cleaned.variants;
      delete cleaned.initial;
      delete cleaned.exit;
      return <div {...cleaned} />;
    },
    button: (props: any) => {
      const cleaned = { ...props };
      delete cleaned.initial;
      delete cleaned.animate;
      delete cleaned.transition;
      return <button {...cleaned} />;
    },
  },
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
  beforeEach(() => {
    replaceMock.mockClear();
    pushMock.mockClear();
    internalFetchMock.mockReset();
  });

  it('syncs tab mode with URL and updates when toggled', async () => {
    const user = userEvent.setup();
    render(<UnifiedGuestClient />);

    // Auth form is now shown directly (no intro gate), initial mode is signin per mocked search params
    const signinTab = document.getElementById('tab-signin') as HTMLButtonElement;
    expect(signinTab.getAttribute('aria-selected')).toBe('true');
    // Panel should be present and associated to the active tab
    const signInPanel = document.getElementById('panel-signin') as HTMLDivElement;
    expect(signInPanel).toBeTruthy();
    expect(signInPanel.getAttribute('role')).toBe('tabpanel');
    expect(signInPanel.getAttribute('aria-labelledby')).toBe('tab-signin');
    // The initial URL already matches the active tab, so no redundant replace is issued.
    expect(replaceMock).not.toHaveBeenCalled();

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

  it('uses the host-issued claim flow and sends no identity-document data', async () => {
    const user = userEvent.setup();
    internalFetchMock.mockResolvedValue(new Response(JSON.stringify({
      data: { redirect: '/en/check-in' },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));

    render(<UnifiedGuestClient />);

    await user.click(document.getElementById('tab-signup') as HTMLButtonElement);
    await user.type(screen.getByLabelText(/booking claim token/i), `claim_${'a'.repeat(43)}`);
    await user.selectOptions(screen.getByLabelText(/where are you traveling from/i), 'ABROAD');
    await user.type(screen.getByPlaceholderText('+30 690 000 0000'), '+16900000002');
    await user.type(screen.getByPlaceholderText('At least 8 characters'), 'new-password');
    await user.click(screen.getByText(/I confirm my details/i));
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(internalFetchMock).toHaveBeenCalledWith('/api/portal/claims', expect.any(Object)));

    const [, init] = internalFetchMock.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      origin: 'ABROAD',
      phone: '+16900000002',
      password: 'new-password',
      claimToken: `claim_${'a'.repeat(43)}`,
      acceptTerms: true,
    });
    expect(body).not.toHaveProperty('afm');
    expect(body).not.toHaveProperty('passport');
    expect(body).not.toHaveProperty('bookingRef');
    expect(body).not.toHaveProperty('lastName');
    expect(pushMock).toHaveBeenCalledWith('/en/check-in');
  });

  it('submits sign-in directly to the session endpoint', async () => {
    const user = userEvent.setup();
    internalFetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { redirect: '/en/check-in' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    render(<UnifiedGuestClient />);

    await user.type(screen.getByPlaceholderText('+30 690 000 0000'), '+306900000002');
    await user.type(screen.getByPlaceholderText('At least 8 characters'), 'password');
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(internalFetchMock).toHaveBeenCalledWith('/api/portal/sessions', expect.any(Object)));
    const body = JSON.parse(internalFetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ phone: '+306900000002', password: 'password' });
  });
});
