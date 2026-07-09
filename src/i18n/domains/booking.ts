/**
 * Booking-related translations.
 * Includes: booking forms, price breakdown, guest details
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface BookingFormDictionary {
    guestInfo: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    firstNamePlaceholder: string;
    lastNamePlaceholder: string;
    emailPlaceholder: string;
    phonePlaceholder: string;
    arrivalTime: string;
    arrivalSelect: string;
    arrivalMorning: string;
    arrivalAfternoon: string;
    arrivalEvening: string;
    arrivalLate: string;
    specialRequests: string;
    specialRequestsPlaceholder: string;
    fixErrors: string;
    terms: string;
    processing: string;
    confirm: string;
    confirmedTitle: string;
    confirmedMessage: string;
    propertyLabel: string;
    datesLabel: string;
    viewProperty: string;
    backHome: string;
    firstNameRequired: string;
    lastNameRequired: string;
    emailRequired: string;
    emailInvalid: string;
    phoneRequired: string;
    formErrorsAnnounce: string;
    submittedAnnounce: string;
    submittingAnnounce: string;
}

export interface BookingDetailsPageDictionary {
    howToBookTitle: string;
    howToBook: string[];
    pricingTitle: string;
    pricing: string[];
    cancellationTitle: string;
    cancellation: string[];
    contactTitle: string;
    contactIntro: string;
    contact: string[];
    metaDescription: string;
}

export interface BookingDictionary {
    locationDesc: string;
    completeTitle?: string;
    yourDetails?: string;
    datesLabel?: string;
    durationLabel?: string;
    notSelected?: string;
    selectDatesPrompt?: string;
    priceBreakdown?: string;
    cleaningFee?: string;
    serviceFee?: string;
    total?: string;
    whatsIncluded?: string;
    completeDetailsHint?: string;
    night?: string;
    nights?: string;
    selectDatesError?: string;
    backToProperty?: string;
    goBackToDates?: string;
    showAllAmenities?: string;
    showLessAmenities?: string;
    form?: BookingFormDictionary;
    detailsPage?: BookingDetailsPageDictionary;
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
        durationLabel: "Duration",
        notSelected: "Not selected",
        selectDatesPrompt: "Please complete your booking details above to continue.",
        priceBreakdown: "Price breakdown",
        cleaningFee: "Cleaning fee",
        serviceFee: "Service fee",
        total: "Total",
        whatsIncluded: "What's included",
        completeDetailsHint: "Select dates to see pricing",
        night: "night",
        nights: "nights",
        selectDatesError: "Please select dates",
        backToProperty: "← Back to property",
        goBackToDates: "← Go back to select dates",
        showAllAmenities: "Show all {count} amenities",
        showLessAmenities: "Show less amenities",
        form: {
            guestInfo: "Guest information",
            firstName: "First name *",
            lastName: "Last name *",
            email: "Email address *",
            phone: "Phone number *",
            firstNamePlaceholder: "John",
            lastNamePlaceholder: "Smith",
            emailPlaceholder: "john@example.com",
            phonePlaceholder: "+30 123 456 7890",
            arrivalTime: "Expected arrival time",
            arrivalSelect: "Select arrival time",
            arrivalMorning: "Morning (9:00-12:00)",
            arrivalAfternoon: "Afternoon (12:00-18:00)",
            arrivalEvening: "Evening (18:00-21:00)",
            arrivalLate: "Late arrival (after 21:00)",
            specialRequests: "Special requests",
            specialRequestsPlaceholder: "Any special requirements or requests...",
            fixErrors: "Please fix the following:",
            terms: "By clicking \"Confirm booking\" you agree to our terms of service and cancellation policy. Your booking is subject to availability confirmation from the host.",
            processing: "Processing booking...",
            confirm: "Confirm booking",
            confirmedTitle: "Booking Confirmed!",
            confirmedMessage: "Thank you! Your booking request has been sent.",
            propertyLabel: "Property:",
            datesLabel: "Dates:",
            viewProperty: "View property details",
            backHome: "Back to home",
            firstNameRequired: "First name is required",
            lastNameRequired: "Last name is required",
            emailRequired: "Email is required",
            emailInvalid: "Please enter a valid email address",
            phoneRequired: "Phone number is required",
            formErrorsAnnounce: "Please review and correct the highlighted fields.",
            submittedAnnounce: "Booking submitted successfully!",
            submittingAnnounce: "Submitting booking, please wait..."
        },
        detailsPage: {
            howToBookTitle: "How to Book",
            howToBook: [
                "Contact us directly for availability and rates",
                "Secure your dates with a deposit",
                "Receive confirmation and payment details",
                "Complete payment to finalize your booking"
            ],
            pricingTitle: "Pricing Information",
            pricing: [
                "Seasonal rates apply (high/low season)",
                "Minimum stay requirements may apply",
                "Additional fees: cleaning, local taxes",
                "Payment plans available for longer stays"
            ],
            cancellationTitle: "Cancellation Policy",
            cancellation: [
                "Free cancellation up to 30 days before arrival",
                "50% refund for cancellations 14-30 days prior",
                "No refund for cancellations within 14 days",
                "Travel insurance recommended"
            ],
            contactTitle: "Contact Us",
            contactIntro: "Ready to book your stay? Get in touch with us for personalized assistance.",
            contact: [
                "📧 Email: info@dolcefariente.com",
                "📱 Phone: +30 2721 023456",
                "💬 WhatsApp: Available for instant booking"
            ],
            metaDescription: "Learn about our booking process, pricing, and policies for your stay at our luxury apartment."
        }
    },
    el: {
        locationDesc: "Ήσυχη γειτονιά κοντά στο Δημαρχείο",
        completeTitle: "Ολοκληρώστε την κράτηση",
        yourDetails: "Στοιχεία κράτησης",
        datesLabel: "Ημερομηνίες",
        durationLabel: "Διάρκεια",
        notSelected: "Δεν έχει επιλεγεί",
        selectDatesPrompt: "Συμπληρώστε τα στοιχεία κράτησης παραπάνω για να συνεχίσετε.",
        priceBreakdown: "Ανάλυση τιμής",
        cleaningFee: "Τέλος καθαρισμού",
        serviceFee: "Τέλος υπηρεσίας",
        total: "Σύνολο",
        whatsIncluded: "Τι περιλαμβάνεται",
        completeDetailsHint: "Επιλέξτε ημερομηνίες για να δείτε τιμή",
        night: "νύχτα",
        nights: "νύχτες",
        selectDatesError: "Παρακαλώ επιλέξτε ημερομηνίες",
        backToProperty: "← Πίσω στο κατάλυμα",
        goBackToDates: "← Επιστροφή για επιλογή ημερομηνιών",
        showAllAmenities: "Εμφάνιση και των {count} παροχών",
        showLessAmenities: "Εμφάνιση λιγότερων",
        form: {
            guestInfo: "Στοιχεία επισκέπτη",
            firstName: "Όνομα *",
            lastName: "Επώνυμο *",
            email: "Διεύθυνση email *",
            phone: "Αριθμός τηλεφώνου *",
            firstNamePlaceholder: "Γιάννης",
            lastNamePlaceholder: "Παπαδόπουλος",
            emailPlaceholder: "giannis@example.com",
            phonePlaceholder: "+30 123 456 7890",
            arrivalTime: "Αναμενόμενη ώρα άφιξης",
            arrivalSelect: "Επιλέξτε ώρα άφιξης",
            arrivalMorning: "Πρωί (9:00-12:00)",
            arrivalAfternoon: "Μεσημέρι (12:00-18:00)",
            arrivalEvening: "Απόγευμα (18:00-21:00)",
            arrivalLate: "Αργά (μετά τις 21:00)",
            specialRequests: "Ειδικά αιτήματα",
            specialRequestsPlaceholder: "Τυχόν ειδικές απαιτήσεις ή αιτήματα...",
            fixErrors: "Παρακαλώ διορθώστε τα εξής:",
            terms: "Κάνοντας κλικ στο «Επιβεβαίωση κράτησης» συμφωνείτε με τους όρους χρήσης και την πολιτική ακύρωσης. Η κράτησή σας υπόκειται σε επιβεβαίωση διαθεσιμότητας από τον οικοδεσπότη.",
            processing: "Γίνεται επεξεργασία κράτησης...",
            confirm: "Επιβεβαίωση κράτησης",
            confirmedTitle: "Η κράτηση επιβεβαιώθηκε!",
            confirmedMessage: "Ευχαριστούμε! Το αίτημα κράτησής σας εστάλη.",
            propertyLabel: "Κατάλυμα:",
            datesLabel: "Ημερομηνίες:",
            viewProperty: "Δείτε λεπτομέρειες καταλύματος",
            backHome: "Επιστροφή στην αρχική",
            firstNameRequired: "Το όνομα είναι υποχρεωτικό",
            lastNameRequired: "Το επώνυμο είναι υποχρεωτικό",
            emailRequired: "Το email είναι υποχρεωτικό",
            emailInvalid: "Παρακαλώ εισάγετε έγκυρη διεύθυνση email",
            phoneRequired: "Ο αριθμός τηλεφώνου είναι υποχρεωτικός",
            formErrorsAnnounce: "Παρακαλώ ελέγξτε και διορθώστε τα επισημασμένα πεδία.",
            submittedAnnounce: "Η κράτηση υποβλήθηκε με επιτυχία!",
            submittingAnnounce: "Υποβολή κράτησης, παρακαλώ περιμένετε..."
        },
        detailsPage: {
            howToBookTitle: "Πώς να Κάνετε Κράτηση",
            howToBook: [
                "Επικοινωνήστε απευθείας μαζί μας για διαθεσιμότητα και τιμές",
                "Εξασφαλίστε τις ημερομηνίες σας με προκαταβολή",
                "Λάβετε επιβεβαίωση και στοιχεία πληρωμής",
                "Ολοκληρώστε την πληρωμή για να οριστικοποιηθεί η κράτηση"
            ],
            pricingTitle: "Πληροφορίες Τιμών",
            pricing: [
                "Ισχύουν εποχιακές τιμές (υψηλή/χαμηλή περίοδος)",
                "Ενδέχεται να ισχύει ελάχιστη διάρκεια διαμονής",
                "Επιπλέον χρεώσεις: καθαρισμός, τοπικοί φόροι",
                "Διαθέσιμα προγράμματα πληρωμής για μεγαλύτερες διαμονές"
            ],
            cancellationTitle: "Πολιτική Ακύρωσης",
            cancellation: [
                "Δωρεάν ακύρωση έως 30 ημέρες πριν την άφιξη",
                "Επιστροφή 50% για ακυρώσεις 14-30 ημέρες πριν",
                "Καμία επιστροφή για ακυρώσεις εντός 14 ημερών",
                "Συνιστάται ταξιδιωτική ασφάλιση"
            ],
            contactTitle: "Επικοινωνήστε μαζί μας",
            contactIntro: "Έτοιμοι να κλείσετε τη διαμονή σας; Επικοινωνήστε μαζί μας για εξατομικευμένη βοήθεια.",
            contact: [
                "📧 Email: info@dolcefariente.com",
                "📱 Τηλέφωνο: +30 2721 023456",
                "💬 WhatsApp: Διαθέσιμο για άμεση κράτηση"
            ],
            metaDescription: "Μάθετε για τη διαδικασία κράτησης, τις τιμές και τις πολιτικές για τη διαμονή σας στο πολυτελές διαμέρισμά μας."
        }
    },
};
