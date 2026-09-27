/**
 * Portal/Authentication translations.
 * Includes: guest sign-in/sign-up labels and contact details
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface PortalDictionary {
    signInTitle: string;
    signUpTitle: string;
    originQuestion: string;
    originPlaceholder: string;
    claimTokenLabel: string;
    claimTokenHint: string;
    originGR: string;
    originAbroad: string;
    phoneLabel: string;
    continueBtn: string;
    rememberMe: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    modeHintSignin: string;
    modeHintSignup: string;
    working: string;
    a11y: {
        authMode: string;
        showPassword: string;
        hidePassword: string;
    };
    errors: {
        networkError: string;
        networkErrorDetail: string;
        sessionRequired: string;
        signInFailed: string;
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
}

// ============================================================================
// Translations
// ============================================================================

export const portalTranslations: Record<Locale, PortalDictionary> = {
    en: {
        signInTitle: "Sign‑in",
        signUpTitle: "Sign‑up",
        originQuestion: "Where are you traveling from?",
        originPlaceholder: "Select country of origin",
        claimTokenLabel: "Booking claim token",
        claimTokenHint: "Use the one-time token provided by your host.",
        originGR: "Greece",
        originAbroad: "World",
        phoneLabel: "Phone Number",
        continueBtn: "Continue",
        rememberMe: "Remember me on this device",
        passwordLabel: "Password",
        passwordPlaceholder: "At least 8 characters",
        modeHintSignin: "Access your booking and check-in details.",
        modeHintSignup: "Use the claim token from your host to create your guest account. If you already have one, enter its password, or ask the host to reset your access.",
        working: "Working…",
        a11y: {
            authMode: "Authentication mode",
            showPassword: "Show password",
            hidePassword: "Hide password",
        },
        errors: {
            networkError: "Network error",
            networkErrorDetail: "Please check your connection and try again.",
            sessionRequired: "Please sign in to see your stay information.",
            signInFailed: "We couldn't sign you in. Check your phone number and password. Access opens 7 days before check-in and ends on the check-out date.",
        },
    },
    el: {
        signInTitle: "Σύνδεση",
        signUpTitle: "Εγγραφή",
        originQuestion: "Από πού ταξιδεύετε;",
        originPlaceholder: "Επιλέξτε χώρα προέλευσης",
        claimTokenLabel: "Κωδικός ενεργοποίησης κράτησης",
        claimTokenHint: "Χρησιμοποιήστε τον εφάπαξ κωδικό που σας έδωσε ο οικοδεσπότης.",
        originGR: "Ελλάδα",
        originAbroad: "Κόσμος",
        phoneLabel: "Αριθμός Τηλεφώνου",
        continueBtn: "Συνέχεια",
        rememberMe: "Να με θυμάσαι σε αυτή τη συσκευή",
        passwordLabel: "Κωδικός Πρόσβασης",
        passwordPlaceholder: "Τουλάχιστον 8 χαρακτήρες",
        modeHintSignin: "Αποκτήστε πρόσβαση στα στοιχεία της κράτησης και της άφιξής σας.",
        modeHintSignup: "Χρησιμοποιήστε τον κωδικό διεκδίκησης από τον οικοδεσπότη για να δημιουργήσετε λογαριασμό. Αν έχετε ήδη λογαριασμό, βάλτε τον κωδικό του ή ζητήστε από τον οικοδεσπότη επαναφορά πρόσβασης.",
        working: "Γίνεται επεξεργασία…",
        a11y: {
            authMode: "Λειτουργία ταυτοποίησης",
            showPassword: "Εμφάνιση κωδικού",
            hidePassword: "Απόκρυψη κωδικού",
        },
        errors: {
            networkError: "Σφάλμα δικτύου",
            networkErrorDetail: "Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.",
            sessionRequired: "Συνδεθείτε για να δείτε τις πληροφορίες της διαμονής σας.",
            signInFailed: "Δεν ήταν δυνατή η σύνδεση. Ελέγξτε τον αριθμό τηλεφώνου και τον κωδικό σας. Η πρόσβαση ανοίγει 7 ημέρες πριν από την άφιξη και λήγει την ημέρα της αναχώρησης.",
        },
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
    },
    el: {
        title: "Επικοινωνήστε μαζί μας",
        followUs: "Ακολουθήστε μας",
        address: "Διεύθυνση",
        phone: "Τηλέφωνο",
        email: "Email",
        connectWithUs: "Συνδεθείτε μαζί μας",
        description: "Μείνετε συνδεδεμένοι και ακολουθήστε το ταξίδι μας μέσα από την όμορφη Καλαμάτα. Ανακαλύψτε νέους τόπους και ζήστε εμπνευσμένες στιγμές σε ένα ευρύχωρο διαμέρισμα με μεγάλες ηλιόλουστες βεράντες και υπέροχη θέα, σε μια ήσυχη γειτονιά κοντά στο κέντρο της πόλης (13' με τα πόδια, 4' με αυτοκίνητο).",
    },
};
