const guestStore = vi.hoisted(() => ({
  findBookingByReferenceAndLastName: vi.fn(),
  findUserById: vi.fn(),
  findUserByPhone: vi.fn(),
  findEligibleBookingForUser: vi.fn(),
}));
vi.mock('@/lib/guestDataStore', () => ({ guestStore }));

import { DevStoreBookingLookup } from './bookingLookup';

const booking = {
  id: 'booking-1',
  reference: 'REF-1',
  user_id: 'user-1',
  start_date: '2026-08-01',
  end_date: '2026-08-07',
  source: 'EXTERNAL' as const,
};
const user = { id: 'user-1', phone_e164: '+306900000000' };

describe('booking lookup adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps a reservation-reference match without exposing stored surname data', async () => {
    guestStore.findBookingByReferenceAndLastName.mockResolvedValue(booking);
    guestStore.findUserById.mockResolvedValue(user);
    const lookup = new DevStoreBookingLookup();
    await expect(lookup.lookupByReference({ bookingRef: ' REF-1 ', lastName: 'Guest' })).resolves.toEqual({
      id: 'booking-1',
      reference: 'REF-1',
      guestLastName: 'Guest',
      startDate: '2026-08-01',
      endDate: '2026-08-07',
      phoneE164: '+306900000000',
      source: 'EXTERNAL',
    });
    expect(guestStore.findBookingByReferenceAndLastName).toHaveBeenCalledWith('REF-1', 'Guest');
  });

  it('rejects invalid phone input before querying account data', async () => {
    const lookup = new DevStoreBookingLookup();
    await expect(lookup.lookupByPhone({ phone: 'invalid' })).resolves.toBeNull();
    expect(guestStore.findUserByPhone).not.toHaveBeenCalled();
  });

  it('returns only an eligible booking for the normalized phone owner', async () => {
    guestStore.findUserByPhone.mockResolvedValue(user);
    guestStore.findEligibleBookingForUser.mockResolvedValue(booking);
    const lookup = new DevStoreBookingLookup();
    await expect(lookup.lookupByPhone({ phone: '+30 690 000 0000', windowFromISO: '2026-07-14' }))
      .resolves.toEqual(expect.objectContaining({ id: 'booking-1', phoneE164: '+306900000000' }));
    expect(guestStore.findEligibleBookingForUser).toHaveBeenCalledWith('user-1', '2026-07-14');
  });
});
