/**
 * Booking-related translations.
 * Includes: booking forms, price breakdown, guest details
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface BookingDictionary {
    locationDesc: string;
    completeTitle?: string;
    yourDetails?: string;
    datesLabel?: string;
    guestsLabel?: string;
    durationLabel?: string;
    notSelected?: string;
    selectDatesPrompt?: string;
    priceBreakdown?: string;
    cleaningFee?: string;
    serviceFee?: string;
    total?: string;
    whatsIncluded?: string;
    completeDetailsHint?: string;
}

// ============================================================================
// Translations
// ============================================================================

export const bookingTranslations: Record<Locale, BookingDictionary> = {
    en: {
        locationDesc: "Quiet neighborhood near the Town Hall",
        completeTitle: "Complete your booking",
        yourDetails: "Your booking details",
        datesLabel: "Dates",
        guestsLabel: "Guests",
        durationLabel: "Duration",
        notSelected: "Not selected",
        selectDatesPrompt: "Please complete your booking details above to continue.",
        priceBreakdown: "Price breakdown",
        cleaningFee: "Cleaning fee",
        serviceFee: "Service fee",
        total: "Total",
        whatsIncluded: "What's included",
        completeDetailsHint: "Select dates to see pricing"
    },
    el: {
        locationDesc: "Ήσυχη γειτονιά κοντά στο Δημαρχείο",
        completeTitle: "Ολοκληρώστε την κράτηση",
        yourDetails: "Στοιχεία κράτησης",
        datesLabel: "Ημερομηνίες",
        guestsLabel: "Επισκέπτες",
        durationLabel: "Διάρκεια",
        notSelected: "Δεν έχει επιλεγεί",
        selectDatesPrompt: "Συμπληρώστε τα στοιχεία κράτησης παραπάνω για να συνεχίσετε.",
        priceBreakdown: "Ανάλυση τιμής",
        cleaningFee: "Τέλος καθαρισμού",
        serviceFee: "Τέλος υπηρεσίας",
        total: "Σύνολο",
        whatsIncluded: "Τι περιλαμβάνεται",
        completeDetailsHint: "Επιλέξτε ημερομηνίες για να δείτε τιμή"
    },
};
