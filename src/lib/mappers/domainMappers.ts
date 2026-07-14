/**
 * Data Mappers
 * 
 * Standardized mappers for transforming data between different representations.
 * Ensures consistent data shapes and reduces duplication.
 */

/**
 * Map database booking record to domain booking model
 * 
 * @param bookingDb - Raw database booking record
 * @returns Domain booking model
 */
export function mapBookingFromDb(bookingDb: {
  id: string;
  source: 'ONSITE' | 'EXTERNAL';
  reference: string | null;
  startDate: Date;
  endDate: Date;
  userId: string | null;
  provider: string;
  externalReference: string | null;
  accessStatus: 'PENDING' | 'VERIFIED';
  claimedAt: Date | null;
  createdAt: Date;
}): {
  id: string;
  source: 'ONSITE' | 'EXTERNAL';
  reference?: string;
  start_date: string;
  end_date: string;
  user_id?: string;
  provider: string;
  external_reference?: string;
  access_status: 'PENDING' | 'VERIFIED';
  claimed_at?: number;
  created_at: number;
} {
  return {
    id: bookingDb.id,
    source: bookingDb.source,
    reference: bookingDb.reference ?? undefined,
    start_date: bookingDb.startDate.toISOString(),
    end_date: bookingDb.endDate.toISOString(),
    user_id: bookingDb.userId ?? undefined,
    provider: bookingDb.provider,
    external_reference: bookingDb.externalReference ?? undefined,
    access_status: bookingDb.accessStatus,
    claimed_at: bookingDb.claimedAt?.getTime(),
    created_at: bookingDb.createdAt.getTime(),
  };
}

/**
 * Map database user record to domain user model
 * 
 * @param userDb - Raw database user record
 * @returns Domain user model
 */
export function mapUserFromDb(userDb: {
  id: string;
  email: string | null;
  phoneE164: string;
  passwordHash: string | null;
  countryOrigin: 'GR' | 'ABROAD';
  createdAt: Date;
  updatedAt: Date;
}): {
  id: string;
  email?: string;
  phone_e164: string;
  password_hash?: string;
  country_origin: 'GR' | 'ABROAD';
  created_at: number;
  updated_at: number;
} {
  return {
    id: userDb.id,
    email: userDb.email ?? undefined,
    phone_e164: userDb.phoneE164,
    password_hash: userDb.passwordHash ?? undefined,
    country_origin: userDb.countryOrigin,
    created_at: userDb.createdAt.getTime(),
    updated_at: userDb.updatedAt.getTime(),
  };
}

/**
 * Map database check-in record to domain check-in model
 * 
 * @param checkinDb - Raw database check-in record
 * @returns Domain check-in model
 */
export function mapCheckinFromDb(checkinDb: {
  bookingId: string;
  arrivalTime: string;
  specialRequests: string | null;
  acceptedAt: Date;
}): {
  booking_id: string;
  arrival_time: string;
  special_requests?: string;
  accepted_at: number;
} {
  return {
    booking_id: checkinDb.bookingId,
    arrival_time: checkinDb.arrivalTime,
    special_requests: checkinDb.specialRequests ?? undefined,
    accepted_at: checkinDb.acceptedAt.getTime(),
  };
}
