import { describe, it, expect } from 'vitest';
import { signGuestSession, parseGuestSession, hasVerifiedBookingSession, type GuestSessionPayload } from '../lib/guestSession';

describe('guest session helpers', () => {
  it('signs and parses a minimal session token', () => {
    const payload: GuestSessionPayload = {
      user: { id: 'usr_1' },
      booking: { id: 'bkg_1' },
    };
    const token = signGuestSession(payload);
    const parsed = parseGuestSession(token);
    expect(parsed).toBeTruthy();
    expect(parsed?.user?.id).toBe('usr_1');
    expect(parsed?.booking?.id).toBe('bkg_1');
  });

  it('hasVerifiedBookingSession returns true only when booking id is present', () => {
    const p1: GuestSessionPayload = { booking: { id: 'x' } };
    const p2: GuestSessionPayload = { booking: {} };
    const p3: GuestSessionPayload = {};
    expect(hasVerifiedBookingSession(p1)).toBe(true);
    expect(hasVerifiedBookingSession(p2)).toBe(false);
    expect(hasVerifiedBookingSession(p3 as any)).toBe(false);
    expect(hasVerifiedBookingSession(null)).toBe(false);
  });

  it('parseGuestSession returns null for invalid tokens', () => {
    const parsed = parseGuestSession('not-a-jwt');
    expect(parsed).toBeNull();
  });
});
