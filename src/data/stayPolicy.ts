// Stay and pricing policy shared by the availability calendar and the price
// quote. Amounts are integer cents in CURRENCY.

export const CURRENCY = 'EUR';

/**
 * The property's calendar: Airbnb blocked nights are local calendar dates, so
 * "today" for availability is the date in this zone. The server-side
 * PROPERTY_TIME_ZONE environment variable (runtime-env-schema.js) defaults to
 * the same zone and governs check-in/check-out times of day.
 */
export const PROPERTY_TIME_ZONE = 'Europe/Athens';

/** How far ahead, in nights from the property's today, the calendar is shown. */
export const AVAILABILITY_HORIZON_DAYS = 365;

/** The longest stay, in nights, that the availability page quotes. */
export const MAX_STAY_NIGHTS = 30;

/** Minimum stay when the check-in night is not inside any rate period. */
export const DEFAULT_MINIMUM_NIGHTS = 1;

/**
 * Minutes without a successful Airbnb calendar sync after which the admin sees the calendar
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
 * booking ended that long ago. Owner default (Review 3, O27); the accountant still has to
 * confirm that tax retention (GDPR Art. 17(3)(b)) needs nothing longer.
 */
export const GUEST_DATA_RETENTION_MONTHS = 12;

export type ClimateFeeRule = Readonly<{
  /** First night (ISO YYYY-MM-DD) the rule applies to; it applies until the next rule. */
  effectiveFrom: string;
  /** Months (1-12) charged at highCents; every other month is charged at lowCents. */
  highSeasonMonths: readonly number[];
  highCents: number;
  lowCents: number;
  source: string;
}>;

/**
 * Climate resilience fee (τέλος ανθεκτικότητας στην κλιματική κρίση) for
 * short-term rentals, per night of the stay by the month of that night.
 * Short-term rental rates since 2025-01-01: 8 EUR per night April-October,
 * 2 EUR per night November-March (detached houses over 80 m² have higher
 * rates). The owner and the accountant confirm these amounts; change them
 * only here, adding a new rule with its own effectiveFrom date.
 */
export const CLIMATE_FEE_SCHEDULE: readonly ClimateFeeRule[] = [
  {
    effectiveFrom: '2025-01-01',
    highSeasonMonths: [4, 5, 6, 7, 8, 9, 10],
    highCents: 800,
    lowCents: 200,
    source: 'https://www.aade.gr/sites/default/files/2026-02/FAQs_el_telos_anthektikotitas_stin_klimatiki_krisi_02_02_2026.pdf',
  },
];
