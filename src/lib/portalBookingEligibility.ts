const PORTAL_BOOKING_ACCESS_WINDOW_DAYS = 7;

export type PortalBookingEligibilityWindow = Readonly<{
  businessToday: Date;
  inclusiveMaximumStartDate: Date;
}>;

export type PortalBookingDateRange = Readonly<{
  startDate: Date;
  endDate: Date;
}>;

/**
 * Booking dates are PostgreSQL DATE values surfaced by Prisma as UTC-midnight
 * Date objects. Keep the portal policy in that calendar-date convention so
 * elapsed hours and local/DST transitions cannot change a boundary result:
 * "today" is the UTC calendar date of the captured clock.
 *
 * This is the documented reference for the whole authentication boundary
 * (docs/testing.md); the property time zone (PROPERTY_TIME_ZONE in
 * src/data/stayPolicy.ts, Europe/Athens; the environment variable of that name
 * is validated at start-up and not read) governs times of day and the
 * availability calendar, not this window. The day therefore changes at 00:00
 * UTC, which is 03:00 in Kalamata in summer and 02:00 in winter: between local
 * midnight and that hour the window still holds the previous date. Access
 * after the check-out date ends, and the window before check-in opens, that
 * many hours after local midnight. Every flow (claim, sign-in, refresh, session
 * check, grant issuance, arrival requests, the admin pages) and the host's
 * instructions share this reference; tests/unit/portal-booking-eligibility.test.ts
 * pins it around Athens midnight. Moving it to the property zone would open
 * the window earlier (wider on that side, narrower on the closing side), so it
 * needs an owner decision and one change to all of them.
 */
export function createPortalBookingEligibilityWindow(
  capturedNow: Date,
): PortalBookingEligibilityWindow {
  if (!Number.isFinite(capturedNow.getTime())) {
    throw new TypeError('A valid captured time is required for portal booking eligibility');
  }

  const businessToday = new Date(Date.UTC(
    capturedNow.getUTCFullYear(),
    capturedNow.getUTCMonth(),
    capturedNow.getUTCDate(),
  ));
  const inclusiveMaximumStartDate = new Date(businessToday);
  inclusiveMaximumStartDate.setUTCDate(
    inclusiveMaximumStartDate.getUTCDate() + PORTAL_BOOKING_ACCESS_WINDOW_DAYS,
  );

  return { businessToday, inclusiveMaximumStartDate };
}

export function portalBookingTemporalWhere(
  window: PortalBookingEligibilityWindow,
): {
  startDate: { lte: Date };
  endDate: { gte: Date };
} {
  return {
    startDate: { lte: window.inclusiveMaximumStartDate },
    endDate: { gte: window.businessToday },
  };
}

export function isPortalBookingTemporallyEligible(
  booking: PortalBookingDateRange,
  window: PortalBookingEligibilityWindow,
): boolean {
  const startTime = booking.startDate.getTime();
  const endTime = booking.endDate.getTime();

  return Number.isFinite(startTime)
    && Number.isFinite(endTime)
    && startTime <= endTime
    && endTime >= window.businessToday.getTime()
    && startTime <= window.inclusiveMaximumStartDate.getTime();
}

/** A booking gives portal access to this user: owned, verified and inside the date window. */
export function isPortalBookingEligible(
  booking: PortalBookingDateRange & { userId: string | null; accessStatus: string },
  userId: string,
  window: PortalBookingEligibilityWindow,
): boolean {
  return booking.userId === userId
    && booking.accessStatus === 'VERIFIED'
    && isPortalBookingTemporallyEligible(booking, window);
}
