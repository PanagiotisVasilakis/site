/**
 * Booking-related translations.
 * Includes: booking forms, availability request details, guest details
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
    submitFailed: string;
}

interface BookingDetailsPageDictionary {
    howToBookTitle: string;
    howToBook: string[];
    availabilityTitle: string;
    availability: string[];
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
    whatsIncluded?: string;
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
        whatsIncluded: "What's included",
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
            terms: "By clicking \"Send request\" you share your stay details with the host. Your stay is subject to availability confirmation from the host.",
            processing: "Sending request...",
            confirm: "Send request",
            confirmedTitle: "Request Sent",
            confirmedMessage: "Thank you! Your request was received and recorded. The host will contact you to confirm availability; this is not a booking confirmation.",
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
            submittedAnnounce: "Stay request received successfully.",
            submittingAnnounce: "Sending stay request, please wait...",
            submitFailed: "Unable to send your stay request right now. Please contact the host directly."
        },
        detailsPage: {
            howToBookTitle: "How to Book",
            howToBook: [
                "Contact us directly for availability",
                "Share your preferred dates and guest details",
                "Receive host confirmation and arrival instructions",
                "Finalize your stay directly with the host"
            ],
            availabilityTitle: "Availability Information",
            availability: [
                "Availability is confirmed directly by the host",
                "Minimum stay requirements may apply",
                "Arrival details are coordinated before check-in",
                "Longer stays can be discussed directly"
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
                "📧 Email: dolcefarnienteapartments@gmail.com",
                "📱 Phone: +30 695 581 0051",
                "💬 WhatsApp: Available for instant booking"
            ],
            metaDescription: "Learn about our booking process, availability, and policies for your stay at our luxury apartment."
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
        whatsIncluded: "Τι περιλαμβάνεται",
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
            terms: "Κάνοντας κλικ στο «Αποστολή αιτήματος» στέλνετε τα στοιχεία διαμονής στον οικοδεσπότη. Η διαμονή υπόκειται σε επιβεβαίωση διαθεσιμότητας από τον οικοδεσπότη.",
            processing: "Γίνεται αποστολή αιτήματος...",
            confirm: "Αποστολή αιτήματος",
            confirmedTitle: "Το αίτημα εστάλη",
            confirmedMessage: "Ευχαριστούμε! Το αίτημά σας παραλήφθηκε και καταγράφηκε. Ο οικοδεσπότης θα επικοινωνήσει μαζί σας για επιβεβαίωση διαθεσιμότητας· αυτό δεν αποτελεί επιβεβαίωση κράτησης.",
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
            submittedAnnounce: "Το αίτημα διαμονής παραλήφθηκε με επιτυχία.",
            submittingAnnounce: "Αποστολή αιτήματος, παρακαλώ περιμένετε...",
            submitFailed: "Δεν είναι δυνατή η αποστολή του αιτήματος αυτή τη στιγμή. Παρακαλώ επικοινωνήστε απευθείας με τον οικοδεσπότη."
        },
        detailsPage: {
            howToBookTitle: "Πώς να Κάνετε Κράτηση",
            howToBook: [
                "Επικοινωνήστε απευθείας μαζί μας για διαθεσιμότητα",
                "Στείλτε τις προτιμώμενες ημερομηνίες και τα στοιχεία επισκεπτών",
                "Λάβετε επιβεβαίωση και οδηγίες άφιξης από τον οικοδεσπότη",
                "Οριστικοποιήστε τη διαμονή απευθείας με τον οικοδεσπότη"
            ],
            availabilityTitle: "Πληροφορίες Διαθεσιμότητας",
            availability: [
                "Η διαθεσιμότητα επιβεβαιώνεται απευθείας από τον οικοδεσπότη",
                "Ενδέχεται να ισχύει ελάχιστη διάρκεια διαμονής",
                "Οι λεπτομέρειες άφιξης συντονίζονται πριν το check-in",
                "Για μεγαλύτερες διαμονές μπορείτε να επικοινωνήσετε απευθείας"
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
                "📧 Email: dolcefarnienteapartments@gmail.com",
                "📱 Τηλέφωνο: +30 695 581 0051",
                "💬 WhatsApp: Διαθέσιμο για άμεση κράτηση"
            ],
            metaDescription: "Μάθετε για τη διαδικασία κράτησης, τη διαθεσιμότητα και τις πολιτικές για τη διαμονή σας στο πολυτελές διαμέρισμά μας."
        }
    },
};
