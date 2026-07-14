// Vitest globals are enabled; no named imports needed.
vi.mock('../lib/prisma', () => ({ prisma: {} }));
import { signGuestSession, parseGuestSession, hasVerifiedBookingSession, type GuestSessionPayload } from '../lib/guestSession';

describe('guest session helpers', () => {
  it('signs and parses a minimal session token', () => {
    const payload: GuestSessionPayload = {
      type: 'guest',
      sid: 'session_1',
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
    const p1: GuestSessionPayload = { type: 'guest', sid: 'session_1', user: { id: 'usr_1' }, booking: { id: 'x' } };
    const p2: GuestSessionPayload = { type: 'guest', sid: 'session_1', user: { id: 'usr_1' }, booking: {} };
    const p3: GuestSessionPayload = { type: 'guest' };
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
