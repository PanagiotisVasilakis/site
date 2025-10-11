import { guestStore, type Booking as StoreBooking, type User } from '@/lib/guestDataStore';
import { normalizePhone } from '@/lib/phone';

export interface Booking {
  id: string;
  reference?: string;
  guestLastName?: string; // provided from input or derived, not read from store
  startDate: string; // ISO YYYY-MM-DD
  endDate: string;   // ISO YYYY-MM-DD
  phoneE164?: string;
  source: 'ONSITE' | 'EXTERNAL';
}

export type LookupByRefParams = { bookingRef: string; lastName: string };
export type LookupByPhoneParams = { phone: string; windowFromISO?: string }; // windowFromISO defaults to today

export interface BookingLookupProvider {
  lookupByReference(params: LookupByRefParams): Promise<Booking | null>;
  lookupByPhone(params: LookupByPhoneParams): Promise<Booking | null>;
}

function toBooking(b: StoreBooking, u?: User, lastNameInput?: string): Booking {
  return {
    id: b.id,
    reference: b.reference,
    guestLastName: lastNameInput,
    startDate: b.start_date,
    endDate: b.end_date,
    phoneE164: u?.phone_e164,
    source: b.source,
  };
}

export class DevStoreBookingLookup implements BookingLookupProvider {
  async lookupByReference({ bookingRef, lastName }: LookupByRefParams): Promise<Booking | null> {
  const rec = await guestStore.findBookingByReferenceAndLastName(bookingRef.trim(), lastName);
  if (!rec) return null;
  const user = rec.user_id ? await guestStore.findUserById(rec.user_id) : undefined;
    return toBooking(rec, user, lastName);
  }

  async lookupByPhone({ phone, windowFromISO }: LookupByPhoneParams): Promise<Booking | null> {
    const n = normalizePhone(phone);
    if (!n) return null;
  const user = await guestStore.findUserByPhone(n.e164);
    if (!user) return null;
    const from = windowFromISO || new Date().toISOString().slice(0, 10);
  const booking = await guestStore.findEligibleBookingForUser(user.id, from);
    return booking ? toBooking(booking, user) : null;
  }
}

export const bookingLookup: BookingLookupProvider = new DevStoreBookingLookup();
