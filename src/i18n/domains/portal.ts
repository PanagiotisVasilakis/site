/**
 * Portal/Authentication translations.
 * Includes: guest sign-in/sign-up labels
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
        claimTokenInvalid: string;
    };
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
        originAbroad: "Abroad",
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
            signInFailed: "We couldn't sign you in. Check your phone number and password. Access opens about 7 days before check-in and closes shortly after the check-out date.",
            claimTokenInvalid: "This claim token is invalid, expired or already used. Ask your host for a new one.",
        },
    },
    el: {
        signInTitle: "Σύνδεση",
        signUpTitle: "Εγγραφή",
        originQuestion: "Από πού ταξιδεύετε;",
        originPlaceholder: "Επιλέξτε χώρα προέλευσης",
        claimTokenLabel: "Κωδικός ενεργοποίησης κράτησης",
        claimTokenHint: "Χρησιμοποιήστε τον εφάπαξ κωδικό που σας έδωσε η οικοδέσποινα.",
        originGR: "Ελλάδα",
        originAbroad: "Εξωτερικό",
        phoneLabel: "Αριθμός Τηλεφώνου",
        continueBtn: "Συνέχεια",
        rememberMe: "Να με θυμάσαι σε αυτή τη συσκευή",
        passwordLabel: "Κωδικός Πρόσβασης",
        passwordPlaceholder: "Τουλάχιστον 8 χαρακτήρες",
        modeHintSignin: "Αποκτήστε πρόσβαση στα στοιχεία της κράτησης και της άφιξής σας.",
        modeHintSignup: "Χρησιμοποιήστε τον κωδικό ενεργοποίησης κράτησης από την οικοδέσποινα για να δημιουργήσετε λογαριασμό. Αν έχετε ήδη λογαριασμό, βάλτε τον κωδικό πρόσβασής σας ή ζητήστε από την οικοδέσποινα επαναφορά πρόσβασης.",
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
            signInFailed: "Δεν ήταν δυνατή η σύνδεση. Ελέγξτε τον αριθμό τηλεφώνου και τον κωδικό σας. Η πρόσβαση ανοίγει περίπου 7 ημέρες πριν την άφιξη και κλείνει λίγο μετά την ημερομηνία αναχώρησης.",
            claimTokenInvalid: "Ο κωδικός ενεργοποίησης δεν είναι έγκυρος, έχει λήξει ή έχει ήδη χρησιμοποιηθεί. Ζητήστε νέο από την οικοδέσποινα.",
        },
    },
};
