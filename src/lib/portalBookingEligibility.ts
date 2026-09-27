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
 * elapsed hours and local/DST transitions cannot change a boundary result.
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
