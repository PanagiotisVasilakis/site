/**
 * Type-safe analytics event definitions.
 * 
 * Adding an event here provides autocomplete and type checking for event payloads.
 * Events not listed here will still work but won't have type safety.
 */

// ============================================================================
// Event Payload Types
// ============================================================================

export interface BookingSubmittedPayload {
    nights: number;
    guests: number;
    total: number;
    arrivalTime?: string;
}

export interface BookingCheckAvailabilityPayload {
    nights: number;
    guests: number;
}

export interface NavigationPayload {
    destination: string;
}

export interface CheckinPayload {
    step?: string;
    success?: boolean;
}

export interface GalleryPayload {
    index?: number;
    total?: number;
    action?: 'open' | 'close' | 'navigate';
}

// ============================================================================
// Event Map
// ============================================================================

/**
 * Maps event names to their expected payload types.
 * Use this for type-safe event tracking.
 */
export interface AnalyticsEventMap {
    // Booking events
    booking_submitted: BookingSubmittedPayload;
    booking_check_availability: BookingCheckAvailabilityPayload;

    // Navigation events
    mobile_nav_house: NavigationPayload;
    mobile_nav_book: NavigationPayload;
    mobile_nav_booking_details: NavigationPayload;
    mobile_nav_about: NavigationPayload;
    mobile_nav_favorites: NavigationPayload;
    mobile_nav_restaurants: NavigationPayload;
    mobile_nav_phones: NavigationPayload;
    mobile_nav_checkin: NavigationPayload;
    checkin_nav_clicked: Record<string, never>; // No payload

    // Check-in events
    checkin_started: CheckinPayload;
    checkin_completed: CheckinPayload;
    checkin_failed: CheckinPayload;

    // Gallery events
    gallery_opened: GalleryPayload;
    gallery_closed: GalleryPayload;
    gallery_navigated: GalleryPayload;
}

// Type helper for getting payload type from event name
export type EventPayload<T extends keyof AnalyticsEventMap> = AnalyticsEventMap[T];

// All known event names
export type AnalyticsEventName = keyof AnalyticsEventMap;
