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
    passwordLabel?: string;
    passwordPlaceholder?: string;
    passwordMinError?: string;
    lastNameLabelReq?: string;
    lastNamePlaceholder?: string;
    additionalInfo?: string;
    bookingRefChip?: string;
    modeHintSignin?: string;
    modeHintSignup?: string;
    working?: string;
    a11y?: {
        authMode?: string;
        originSelection?: string;
        selectCountryCode?: string;
        countryCodes?: string;
        showPassword?: string;
        hidePassword?: string;
    };
    errors?: {
        problemWith?: string;
        errorPrefix?: string;
        empty?: string;
        fieldLastName?: string;
        fieldPhone?: string;
        fieldAfm?: string;
        fieldPassport?: string;
        fieldBookingRef?: string;
        fieldPassword?: string;
        lastNameEmptyHint?: string;
        phoneEmpty1?: string;
        phoneEmpty2?: string;
        phoneShort?: string;
        phoneShort1?: string;
        phoneShort2?: string;
        afmEmpty1?: string;
        afmEmpty2?: string;
        afmEntered?: string;
        afmMust9?: string;
        afmExample?: string;
        afmAll9?: string;
        afmCheck?: string;
        passportEmpty1?: string;
        passportEmpty2?: string;
        passportEntered?: string;
        passportMust?: string;
        passportMust2?: string;
        passportExample?: string;
        passportCheck?: string;
        passportCheck2?: string;
        bookingRefEntered?: string;
        bookingRefMin?: string;
        bookingRefEmptyHint?: string;
        bookingRefCheck?: string;
        somethingWentWrong?: string;
        phoneFormatIncorrect?: string;
        phoneIncludeCode?: string;
        passwordIncorrect?: string;
        passwordTryReset?: string;
        passwordMin8?: string;
        passwordStronger?: string;
        signinFailed?: string;
        signinIncorrect?: string;
        phoneCheckCorrect?: string;
        passwordUseRight?: string;
        tipSamePassword?: string;
        forgotPassword?: string;
        couldNotVerify?: string;
        checkAllFields?: string;
        verifyLastName?: string;
        verifyPhone?: string;
        verifyAfm?: string;
        verifyPassport?: string;
        ifCorrectContact?: string;
        doubleCheckFields?: string;
        verifyPassword8?: string;
        useSignupInstead?: string;
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
            afmInvalid: "AFM must be exactly 9 digits",
            passportRequired: "Passport number is required",
            passportInvalid: "Passport number must be 5-20 alphanumeric characters"
        },
        passwordLabel: "Password",
        passwordPlaceholder: "At least 8 characters",
        passwordMinError: "Password must be at least 8 characters",
        lastNameLabelReq: "Last name",
        lastNamePlaceholder: "Doe",
        additionalInfo: "Additional Information (Optional)",
        bookingRefChip: "• Booking reference",
        modeHintSignin: "Access your booking and check-in details.",
        modeHintSignup: "Create your guest account to continue.",
        working: "Working…",
        a11y: {
            authMode: "Authentication mode",
            originSelection: "Origin selection",
            selectCountryCode: "Select country code",
            countryCodes: "Country codes",
            showPassword: "Show password",
            hidePassword: "Hide password"
        },
        errors: {
            problemWith: "❌ Problem with: {field}",
            errorPrefix: "Error: ",
            empty: "This field is empty",
            fieldLastName: "Last name",
            fieldPhone: "Phone Number",
            fieldAfm: "AFM (9 digits)",
            fieldPassport: "Passport Number",
            fieldBookingRef: "Booking Reference",
            fieldPassword: "Password",
            lastNameEmptyHint: "Please enter your surname as it appears on your booking",
            phoneEmpty1: "Please enter your phone number with country code",
            phoneEmpty2: "Example: +30 695 581 0051 or 6955810051",
            phoneShort: "You entered: {value} (only {count} digits)",
            phoneShort1: "Phone numbers must be at least 8 digits",
            phoneShort2: "Please enter your complete phone number",
            afmEmpty1: "Please enter your 9-digit AFM (Αριθμός Φορολογικού Μητρώου)",
            afmEmpty2: "Your Greek tax identification number",
            afmEntered: "You entered: {value} ({count} digits)",
            afmMust9: "AFM must be exactly 9 digits (0-9)",
            afmExample: "Example: 123456789",
            afmAll9: "Please enter all 9 digits of your Greek tax number",
            afmCheck: "Please check your Greek tax identification number",
            passportEmpty1: "Please enter your passport number",
            passportEmpty2: "Found on the information page of your passport",
            passportEntered: "You entered: {value} ({count} characters)",
            passportMust: "Passport must be 5-20 letters and numbers only",
            passportMust2: "Passport must be 5-20 letters and numbers",
            passportExample: "Example: AB1234567",
            passportCheck: "Please check your passport and enter the number correctly",
            passportCheck2: "Please check your passport and enter correctly",
            bookingRefEntered: "You entered: {value} (only {count} characters)",
            bookingRefMin: "Booking reference must be at least 3 characters",
            bookingRefEmptyHint: "Or leave it empty if you don't have one",
            bookingRefCheck: "Check your booking confirmation email",
            somethingWentWrong: "Something went wrong",
            phoneFormatIncorrect: "Phone number format is incorrect",
            phoneIncludeCode: "Include country code: +30 695 581 0051",
            passwordIncorrect: "The password you entered is incorrect",
            passwordTryReset: "Please try again or reset your password",
            passwordMin8: "Password must be at least 8 characters long",
            passwordStronger: "Please enter a stronger password",
            signinFailed: "❌ Sign-in failed",
            signinIncorrect: "The phone number or password you entered is incorrect",
            phoneCheckCorrect: "📱 Phone Number: Check that you entered the correct number",
            passwordUseRight: "🔒 Password: Make sure you're using the right password",
            tipSamePassword: "Tip: If you just signed up, use the same password you created",
            forgotPassword: "If you forgot your password, please contact support",
            couldNotVerify: "❌ Could not verify your information",
            checkAllFields: "Please check that all these fields are correct:",
            verifyLastName: "📝 Last name: Must match your booking",
            verifyPhone: "📱 Phone Number: Include +30 or just the 10 digits",
            verifyAfm: "🆔 AFM: All 9 digits of your tax number",
            verifyPassport: "🛂 Passport: Your passport number",
            ifCorrectContact: "If everything looks correct, contact support",
            doubleCheckFields: "Please double-check that all fields are correct:",
            verifyPassword8: "🔒 Password: Must be at least 8 characters",
            useSignupInstead: "If you haven't signed up yet, please use Sign Up instead",
            networkError: "Network error",
            networkErrorDetail: "Please check your connection and try again."
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
            afmInvalid: "Το ΑΦΜ πρέπει να έχει ακριβώς 9 ψηφία",
            passportRequired: "Απαιτείται αριθμός διαβατηρίου",
            passportInvalid: "Ο αριθμός διαβατηρίου πρέπει να έχει 5-20 αλφαριθμητικούς χαρακτήρες"
        },
        passwordLabel: "Κωδικός Πρόσβασης",
        passwordPlaceholder: "Τουλάχιστον 8 χαρακτήρες",
        passwordMinError: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες",
        lastNameLabelReq: "Επώνυμο",
        lastNamePlaceholder: "Παπαδόπουλος",
        additionalInfo: "Πρόσθετες Πληροφορίες (Προαιρετικό)",
        bookingRefChip: "• Αριθμός κράτησης",
        modeHintSignin: "Αποκτήστε πρόσβαση στα στοιχεία της κράτησης και της άφιξής σας.",
        modeHintSignup: "Δημιουργήστε τον λογαριασμό επισκέπτη σας για να συνεχίσετε.",
        working: "Γίνεται επεξεργασία…",
        a11y: {
            authMode: "Λειτουργία ταυτοποίησης",
            originSelection: "Επιλογή προέλευσης",
            selectCountryCode: "Επιλογή κωδικού χώρας",
            countryCodes: "Κωδικοί χωρών",
            showPassword: "Εμφάνιση κωδικού",
            hidePassword: "Απόκρυψη κωδικού"
        },
        errors: {
            problemWith: "❌ Πρόβλημα με: {field}",
            errorPrefix: "Σφάλμα: ",
            empty: "Αυτό το πεδίο είναι κενό",
            fieldLastName: "Επώνυμο",
            fieldPhone: "Αριθμός Τηλεφώνου",
            fieldAfm: "ΑΦΜ (9 ψηφία)",
            fieldPassport: "Αριθμός Διαβατηρίου",
            fieldBookingRef: "Κωδικός Κράτησης",
            fieldPassword: "Κωδικός Πρόσβασης",
            lastNameEmptyHint: "Παρακαλώ εισάγετε το επώνυμό σας όπως εμφανίζεται στην κράτησή σας",
            phoneEmpty1: "Παρακαλώ εισάγετε τον αριθμό τηλεφώνου σας με τον κωδικό χώρας",
            phoneEmpty2: "Παράδειγμα: +30 695 581 0051 ή 6955810051",
            phoneShort: "Εισαγάγατε: {value} (μόνο {count} ψηφία)",
            phoneShort1: "Ο αριθμός τηλεφώνου πρέπει να έχει τουλάχιστον 8 ψηφία",
            phoneShort2: "Παρακαλώ εισάγετε ολόκληρο τον αριθμό τηλεφώνου σας",
            afmEmpty1: "Παρακαλώ εισάγετε το 9ψήφιο ΑΦΜ σας (Αριθμός Φορολογικού Μητρώου)",
            afmEmpty2: "Ο ελληνικός αριθμός φορολογικού μητρώου σας",
            afmEntered: "Εισαγάγατε: {value} ({count} ψηφία)",
            afmMust9: "Το ΑΦΜ πρέπει να έχει ακριβώς 9 ψηφία (0-9)",
            afmExample: "Παράδειγμα: 123456789",
            afmAll9: "Παρακαλώ εισάγετε και τα 9 ψηφία του ΑΦΜ σας",
            afmCheck: "Παρακαλώ ελέγξτε τον ελληνικό αριθμό φορολογικού μητρώου σας",
            passportEmpty1: "Παρακαλώ εισάγετε τον αριθμό διαβατηρίου σας",
            passportEmpty2: "Βρίσκεται στη σελίδα πληροφοριών του διαβατηρίου σας",
            passportEntered: "Εισαγάγατε: {value} ({count} χαρακτήρες)",
            passportMust: "Το διαβατήριο πρέπει να έχει 5-20 γράμματα και αριθμούς μόνο",
            passportMust2: "Το διαβατήριο πρέπει να έχει 5-20 γράμματα και αριθμούς",
            passportExample: "Παράδειγμα: AB1234567",
            passportCheck: "Παρακαλώ ελέγξτε το διαβατήριό σας και εισάγετε σωστά τον αριθμό",
            passportCheck2: "Παρακαλώ ελέγξτε το διαβατήριό σας και εισάγετε σωστά",
            bookingRefEntered: "Εισαγάγατε: {value} (μόνο {count} χαρακτήρες)",
            bookingRefMin: "Ο κωδικός κράτησης πρέπει να έχει τουλάχιστον 3 χαρακτήρες",
            bookingRefEmptyHint: "Ή αφήστε το κενό αν δεν έχετε",
            bookingRefCheck: "Ελέγξτε το email επιβεβαίωσης της κράτησής σας",
            somethingWentWrong: "Κάτι πήγε στραβά",
            phoneFormatIncorrect: "Η μορφή του αριθμού τηλεφώνου είναι λανθασμένη",
            phoneIncludeCode: "Συμπεριλάβετε κωδικό χώρας: +30 695 581 0051",
            passwordIncorrect: "Ο κωδικός που εισαγάγατε είναι λανθασμένος",
            passwordTryReset: "Δοκιμάστε ξανά ή επαναφέρετε τον κωδικό σας",
            passwordMin8: "Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες",
            passwordStronger: "Παρακαλώ εισάγετε έναν ισχυρότερο κωδικό",
            signinFailed: "❌ Η σύνδεση απέτυχε",
            signinIncorrect: "Ο αριθμός τηλεφώνου ή ο κωδικός που εισαγάγατε είναι λανθασμένος",
            phoneCheckCorrect: "📱 Αριθμός Τηλεφώνου: Βεβαιωθείτε ότι εισαγάγατε τον σωστό αριθμό",
            passwordUseRight: "🔒 Κωδικός: Βεβαιωθείτε ότι χρησιμοποιείτε τον σωστό κωδικό",
            tipSamePassword: "Συμβουλή: Αν μόλις εγγραφήκατε, χρησιμοποιήστε τον ίδιο κωδικό που δημιουργήσατε",
            forgotPassword: "Αν ξεχάσατε τον κωδικό σας, επικοινωνήστε με την υποστήριξη",
            couldNotVerify: "❌ Δεν ήταν δυνατή η επαλήθευση των στοιχείων σας",
            checkAllFields: "Παρακαλώ ελέγξτε ότι όλα τα παρακάτω πεδία είναι σωστά:",
            verifyLastName: "📝 Επώνυμο: Πρέπει να ταιριάζει με την κράτησή σας",
            verifyPhone: "📱 Αριθμός Τηλεφώνου: Συμπεριλάβετε +30 ή απλώς τα 10 ψηφία",
            verifyAfm: "🆔 ΑΦΜ: Και τα 9 ψηφία του ΑΦΜ σας",
            verifyPassport: "🛂 Διαβατήριο: Ο αριθμός διαβατηρίου σας",
            ifCorrectContact: "Αν όλα φαίνονται σωστά, επικοινωνήστε με την υποστήριξη",
            doubleCheckFields: "Παρακαλώ ελέγξτε ξανά ότι όλα τα πεδία είναι σωστά:",
            verifyPassword8: "🔒 Κωδικός: Πρέπει να έχει τουλάχιστον 8 χαρακτήρες",
            useSignupInstead: "Αν δεν έχετε εγγραφεί ακόμη, χρησιμοποιήστε την Εγγραφή",
            networkError: "Σφάλμα δικτύου",
            networkErrorDetail: "Ελέγξτε τη σύνδεσή σας και δοκιμάστε ξανά."
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
