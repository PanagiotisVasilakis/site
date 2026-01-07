/**
 * Portal/Authentication translations.
 * Includes: sign-in, sign-up, validation messages
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface PortalDictionary {
    introTitle?: string;
    introSubtitle?: string;
    signInTitle: string;
    signUpTitle?: string;
    originQuestion: string;
    originGR: string;
    originAbroad: string;
    phoneLabel: string;
    afmLabel: string;
    passportLabel: string;
    bookingRefLabel: string;
    lastNameLabel: string;
    continueBtn: string;
    or?: string;
    noBookingYet: string;
    alreadyBooked?: string;
    ctaStartBooking?: string;
    goHome: string;
    rememberMe?: string;
    alreadyRegistered?: string;
    newHere?: string;
    signInCta?: string;
    signUpCta?: string;
    hints?: { phone?: string; afm?: string; passport?: string };
    validation?: {
        phoneRequired?: string; phoneInvalid?: string;
        afmRequired?: string; afmInvalid?: string;
        passportRequired?: string; passportInvalid?: string;
    };
}

export interface ContactDictionary {
    title: string;
    followUs: string;
    address: string;
    phone: string;
    email: string;
    connectWithUs: string;
    description: string;
    streetCity: string;
    countryPostal: string;
}

// ============================================================================
// Translations
// ============================================================================

export const portalTranslations: Record<Locale, PortalDictionary> = {
    en: {
        introTitle: "Welcome! How can we help?",
        introSubtitle: "What would you like to do?",
        signInTitle: "Sign‑in",
        signUpTitle: "Sign‑up",
        originQuestion: "Where are you traveling from?",
        originGR: "Greece",
        originAbroad: "World",
        phoneLabel: "Phone Number",
        afmLabel: "AFM (9 digits)",
        passportLabel: "Passport Number",
        bookingRefLabel: "Booking reference (optional)",
        lastNameLabel: "Last name (optional)",
        continueBtn: "Continue",
        or: "or",
        noBookingYet: "Don't have a booking yet?",
        alreadyBooked: "View My Booking & Check-in",
        ctaStartBooking: "Start here",
        goHome: "Go to Home",
        rememberMe: "Remember me on this device",
        alreadyRegistered: "Already registered?",
        newHere: "New here?",
        signInCta: "Sign‑in",
        signUpCta: "Sign‑up",
        hints: {
            phone: "Include country code (e.g., +1 415…)",
            afm: "9 digits",
            passport: "Use letters and numbers only."
        },
        validation: {
            phoneRequired: "Phone is required",
            phoneInvalid: "Enter a valid phone with country code (e.g., +1…)",
            afmRequired: "AFM is required",
            afmInvalid: "AFM must be 9 digits",
            passportRequired: "Passport number is required",
            passportInvalid: "Use 5–20 letters or numbers"
        }
    },
    el: {
        introTitle: "Καλώς ήρθατε! Πώς μπορούμε να βοηθήσουμε;",
        introSubtitle: "Τι θα θέλατε να κάνετε;",
        signInTitle: "Σύνδεση",
        signUpTitle: "Εγγραφή",
        originQuestion: "Από πού ταξιδεύετε;",
        originGR: "Ελλάδα",
        originAbroad: "Κόσμος",
        phoneLabel: "Αριθμός Τηλεφώνου",
        afmLabel: "ΑΦΜ (9 ψηφία)",
        passportLabel: "Αριθμός Διαβατηρίου",
        bookingRefLabel: "Κωδικός κράτησης (προαιρετικό)",
        lastNameLabel: "Επώνυμο<br/>(προαιρετικό)",
        continueBtn: "Συνέχεια",
        or: "ή",
        noBookingYet: "Δεν έχετε κάνει ακόμα κράτηση;",
        alreadyBooked: "Δείτε την Κράτηση & το Check-in μου",
        ctaStartBooking: "Ξεκινήστε εδώ",
        goHome: "Μετάβαση στην Αρχική",
        rememberMe: "Να με θυμάσαι σε αυτή τη συσκευή",
        alreadyRegistered: "Έχετε ήδη εγγραφεί;",
        newHere: "Νέος/α εδώ;",
        signInCta: "Σύνδεση",
        signUpCta: "Εγγραφή",
        hints: {
            phone: "Συμπεριλάβετε κωδικό χώρας (π.χ. +30 69…)",
            afm: "9 ψηφία",
            passport: "Μόνο γράμματα και αριθμοί."
        },
        validation: {
            phoneRequired: "Απαιτείται τηλέφωνο",
            phoneInvalid: "Εισάγετε έγκυρο τηλέφωνο με κωδικό χώρας (π.χ., +30…)",
            afmRequired: "Απαιτείται ΑΦΜ",
            afmInvalid: "Το ΑΦΜ πρέπει να έχει 9 ψηφία",
            passportRequired: "Απαιτείται αριθμός διαβατηρίου",
            passportInvalid: "Χρησιμοποιήστε 5–20 γράμματα ή αριθμούς"
        }
    },
};

export const contactTranslations: Record<Locale, ContactDictionary> = {
    en: {
        title: "Contact Us",
        followUs: "Follow Us",
        address: "Address",
        phone: "Phone",
        email: "Email",
        connectWithUs: "Connect with us",
        description: "Stay connected and follow our journey through the beautiful Kalamata. Discover new places and live inspirational moments on a spacious apartment with large sunny terraces and beautiful views, in a quiet neighborhood near the City Center (13' by walk, 4' by car).",
        streetCity: "Archimidous 21 Kalamata",
        countryPostal: "Greece 24100"
    },
    el: {
        title: "Επικοινωνήστε μαζί μας",
        followUs: "Ακολουθήστε μας",
        address: "Διεύθυνση",
        phone: "Τηλέφωνο",
        email: "Email",
        connectWithUs: "Συνδεθείτε μαζί μας",
        description: "Μείνετε συνδεδεμένοι και ακολουθήστε το ταξίδι μας μέσα από την όμορφη Καλαμάτα. Ανακαλύψτε νέους τόπους και ζήστε εμπνευσμένες στιγμές σε ένα ευρύχωρο διαμέρισμα με μεγάλες ηλιόλουστες βεράντες και υπέροχη θέα, σε μια ήσυχη γειτονιά κοντά στο κέντρο της πόλης (13' με τα πόδια, 4' με αυτοκίνητο).",
        streetCity: "Αρχιμήδους 21 Καλαμάτα",
        countryPostal: "Ελλάδα 24100"
    },
};
