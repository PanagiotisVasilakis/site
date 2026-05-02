// Vitest globals are enabled; no named imports needed.

function today(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// Skip all tests if database URL is not configured
const hasDbUrl = !!(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
describe.skipIf(!hasDbUrl)('Booking lookup service', () => {
  beforeEach(() => {
    // Create fresh user and booking each test; the guestStore uses a file, but for tests we keep creating new records
  });

  it.skip('finds booking by reference + last name (case/spacing resilient)', async () => {
    const { bookingLookup } = await import('@/lib/bookingLookup');
    const { guestStore } = await import('@/lib/guestDataStore');
    const user = await guestStore.createUser({ phone_e164: '+306981234567', country_origin: 'GR' });
    const start = today(5); const end = today(10);
    const uniqueRef = 'ABC' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const booking = await guestStore.linkOrCreateBooking({ source: 'EXTERNAL', reference: uniqueRef, start_date: start, end_date: end, user_id: user.id, last_name: 'Papadopoulos' });

    const found1 = await bookingLookup.lookupByReference({ bookingRef: uniqueRef, lastName: 'papadopoulos' });
    expect(found1?.id).toBe(booking.id);

    const found2 = await bookingLookup.lookupByReference({ bookingRef: uniqueRef, lastName: '  PAPA DOPOULOS  ' });
    expect(found2?.id).toBe(booking.id);
  });

  it.skip('finds booking by phone + upcoming window', async () => {
    const { bookingLookup } = await import('@/lib/bookingLookup');
    const { guestStore } = await import('@/lib/guestDataStore');
    const uniquePhone = '+1' + Math.floor(Math.random() * 1e10).toString().padStart(10, '0');
    const user = await guestStore.createUser({ phone_e164: uniquePhone, country_origin: 'ABROAD' });
    const upcomingStart = today(1); const upcomingEnd = today(3);
    const pastStart = today(-10); const pastEnd = today(-5);
    await guestStore.linkOrCreateBooking({ source: 'ONSITE', start_date: pastStart, end_date: pastEnd, user_id: user.id });
    const incoming = await guestStore.linkOrCreateBooking({ source: 'ONSITE', start_date: upcomingStart, end_date: upcomingEnd, user_id: user.id });

    const found = await bookingLookup.lookupByPhone({ phone: uniquePhone });
    expect(found?.id).toBe(incoming.id);
  });

  it('returns null when nothing matches', async () => {
    const { bookingLookup } = await import('@/lib/bookingLookup');
    const none1 = await bookingLookup.lookupByReference({ bookingRef: 'NOPE', lastName: 'Smith' });
    expect(none1).toBeNull();
    const none2 = await bookingLookup.lookupByPhone({ phone: '+999123' });
    expect(none2).toBeNull();
  });
});
