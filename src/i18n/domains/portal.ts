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
    signUpTitle?: string;
    originQuestion: string;
    originGR: string;
    originAbroad: string;
    phoneLabel: string;
    continueBtn: string;
    rememberMe?: string;
    passwordLabel?: string;
    passwordPlaceholder?: string;
    modeHintSignin?: string;
    modeHintSignup?: string;
    working?: string;
    a11y?: {
        authMode?: string;
        showPassword?: string;
        hidePassword?: string;
    };
    errors?: {
        networkError?: string;
        networkErrorDetail?: string;
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
        originGR: "Greece",
        originAbroad: "World",
        phoneLabel: "Phone Number",
        continueBtn: "Continue",
        rememberMe: "Remember me on this device",
        passwordLabel: "Password",
        passwordPlaceholder: "At least 8 characters",
        modeHintSignin: "Access your booking and check-in details.",
        modeHintSignup: "Create your guest account to continue.",
        working: "Working…",
        a11y: {
            authMode: "Authentication mode",
            showPassword: "Show password",
            hidePassword: "Hide password",
        },
        errors: {
            networkError: "Network error",
            networkErrorDetail: "Please check your connection and try again.",
        },
    },
    el: {
        signInTitle: "Σύνδεση",
        signUpTitle: "Εγγραφή",
        originQuestion: "Από πού ταξιδεύετε;",
        originGR: "Ελλάδα",
        originAbroad: "Κόσμος",
        phoneLabel: "Αριθμός Τηλεφώνου",
        continueBtn: "Συνέχεια",
        rememberMe: "Να με θυμάσαι σε αυτή τη συσκευή",
        passwordLabel: "Κωδικός Πρόσβασης",
        passwordPlaceholder: "Τουλάχιστον 8 χαρακτήρες",
        modeHintSignin: "Αποκτήστε πρόσβαση στα στοιχεία της κράτησης και της άφιξής σας.",
        modeHintSignup: "Δημιουργήστε τον λογαριασμό επισκέπτη σας για να συνεχίσετε.",
        working: "Γίνεται επεξεργασία…",
        a11y: {
            authMode: "Λειτουργία ταυτοποίησης",
            showPassword: "Εμφάνιση κωδικού",
            hidePassword: "Απόκρυψη κωδικού",
        },
        errors: {
            networkError: "Σφάλμα δικτύου",
            networkErrorDetail: "Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά.",
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
