// Stay policy shared by the availability calendar. The admin keeps prices as integer
// cents in CURRENCY; the public site shows none.

export const CURRENCY = 'EUR';

/**
 * The property's calendar: the blocked nights of the Booking.com export are local calendar dates, so
 * "today" for availability is the date in this zone. It is the only time-zone
 * source, also for the check-in/check-out times of day (the Wi-Fi window). The
 * PROPERTY_TIME_ZONE environment variable (runtime-env-schema.js) is validated
 * at startup but not read.
 */
export const PROPERTY_TIME_ZONE = 'Europe/Athens';

/** How far ahead, in nights from the property's today, the calendar is shown. */
export const AVAILABILITY_HORIZON_DAYS = 365;

/** The longest stay, in nights, that the availability page accepts. */
export const MAX_STAY_NIGHTS = 30;

/** Minimum stay when the check-in night is not inside any rate period. */
export const DEFAULT_MINIMUM_NIGHTS = 1;

/**
 * Minutes without a successful Booking.com calendar sync after which the admin sees the calendar
 * as stale and the operational alert opens (one value, so the page and the alert agree).
 */
export const CALENDAR_STALE_ALERT_MINUTES = 180;

/**
 * Hours without a successful sync after which the public availability page stops presenting
 * the blocked nights as confirmed (more tolerant than the admin alert on purpose).
 */
export const CALENDAR_PUBLIC_STALE_HOURS = 12;

/**
 * Guest personal data is kept for this many months after the stay (booking end date), then
 * runRetention redacts check-in request contact data and erases guest accounts whose every
 * booking ended that long ago (requests without a booking: counted from their creation). Owner
 * default (Review 3, O27); confirmed by the owner on 2026-10-20.
 */
export const GUEST_DATA_RETENTION_MONTHS = 12;
