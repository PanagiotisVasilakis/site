const analytics = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/analyticsClient', () => analytics);

import { categorizeReason, track, tracker } from './tracker';

describe('PII-safe analytics tracker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('collapses arbitrary failure reasons into a finite taxonomy', () => {
    expect(categorizeReason('Network fetch failed')).toBe('network_error');
    expect(categorizeReason('Request timeout')).toBe('timeout');
    expect(categorizeReason('Invalid AFM')).toBe('validation_afm');
    expect(categorizeReason('Validation failed')).toBe('validation');
    expect(categorizeReason('Unauthorized')).toBe('auth');
    expect(categorizeReason('404 not found')).toBe('not_found');
    expect(categorizeReason('guest@example.com')).toBe('other');
  });

  it('sanitizes each supported event before forwarding it', () => {
    track({ name: 'portal_opened', props: { source: 'x'.repeat(100) } });
    track({ name: 'origin_selected', props: { origin: 'GR', mode: 'signup' } });
    track({ name: 'form_submitted', props: { form: 'sign-in' } });
    track({ name: 'auth_mode_changed', props: { mode: 'signup' } });
    track({ name: 'no_booking_cta_clicked', props: { ref: 'safe-ref', from: 'guest' } });
    track({ name: 'checkin_viewed' });
    track({ name: 'checkin_completed' });

    expect(analytics.trackEvent).toHaveBeenCalledWith('portal_opened', {
      source: 'x'.repeat(20),
    });
    expect(analytics.trackEvent).toHaveBeenCalledWith('no_booking_cta_clicked', { from: 'guest' });
    expect(analytics.trackEvent).toHaveBeenCalledWith('checkin_completed', {});
  });

  it('keeps convenience helpers on the same sanitized path', () => {
    tracker.portalOpened('direct');
    tracker.originSelected('ABROAD');
    tracker.formSubmitted('sign-up');
    tracker.authModeChanged('signin');
    tracker.noBookingCTAClicked('ref', 'home');
    tracker.checkinViewed();
    tracker.checkinCompleted();
    expect(analytics.trackEvent).toHaveBeenCalledTimes(7);
  });
});
