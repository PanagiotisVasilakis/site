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
  lastNameHash: string | null;
  lastNameSalt: string | null;
  lastNameToken: string | null;
  lastNameTokenNoWs: string | null;
  startDate: Date;
  endDate: Date;
  userId: string | null;
  createdAt: Date;
}): {
  id: string;
  source: 'ONSITE' | 'EXTERNAL';
  reference?: string;
  last_name_hash?: string;
  last_name_salt?: string;
  last_name_token?: string;
  last_name_token_nows?: string;
  start_date: string;
  end_date: string;
  user_id?: string;
  created_at: number;
} {
  return {
    id: bookingDb.id,
    source: bookingDb.source,
    reference: bookingDb.reference ?? undefined,
    last_name_hash: bookingDb.lastNameHash ?? undefined,
    last_name_salt: bookingDb.lastNameSalt ?? undefined,
    last_name_token: bookingDb.lastNameToken ?? undefined,
    last_name_token_nows: bookingDb.lastNameTokenNoWs ?? undefined,
    start_date: bookingDb.startDate.toISOString(),
    end_date: bookingDb.endDate.toISOString(),
    user_id: bookingDb.userId ?? undefined,
    created_at: bookingDb.createdAt.getTime(),
  };
}

/**
 * Map database access record to domain access model
 * 
 * @param accessDb - Raw database access record
 * @returns Domain access model
 */
export function mapAccessFromDb(accessDb: {
  userId: string;
  bookingId: string;
  status: 'PENDING' | 'VERIFIED';
  createdAt: Date;
  updatedAt: Date;
}): {
  user_id: string;
  booking_id: string;
  status: 'PENDING' | 'VERIFIED';
  created_at: number;
  updated_at: number;
} {
  return {
    user_id: accessDb.userId,
    booking_id: accessDb.bookingId,
    status: accessDb.status,
    created_at: accessDb.createdAt.getTime(),
    updated_at: accessDb.updatedAt.getTime(),
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