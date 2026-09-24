/**
 * Check-in related translations.
 * Includes: check-in navigation labels and the check-in info page
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface CheckinDictionary {
    navLabel?: string;
    navInfoLabel?: string;
    saving?: string;
}

export interface CheckinInfoDictionary {
    welcomeMessage?: string;
    checkInOutTitle?: string;
    checkInTime?: string;
    checkOutTime?: string;
    wifiTitle?: string;
    wifiNetwork?: string;
    wifiPassword?: string;
    copy?: string;
    copied?: string;
    emergencyTitle?: string;
    hostContact?: string;
    houseRulesTitle?: string;
    rule1?: string;
    rule2?: string;
    rule3?: string;
    rule4?: string;
    rule5?: string;
    rule6?: string;
    amenitiesTitle?: string;
    parking?: string;
    tipsTitle?: string;
    tip1?: string;
    tip2?: string;
    tip3?: string;
    tip4?: string;
    additionalTitle?: string;
    keysInfo?: string;
    keysDetail?: string;
    trashInfo?: string;
    trashDetail?: string;
    waterInfo?: string;
    waterDetail?: string;
    tvInfo?: string;
    tvDetail?: string;
}

// ============================================================================
// Translations
// ============================================================================

export const checkinTranslations: Record<Locale, CheckinDictionary> = {
    en: {
        navLabel: "Check-in",
        navInfoLabel: "Check-In Info",
        saving: "Saving…",
    },
    el: {
        navLabel: "Άφιξη",
        navInfoLabel: "Πληροφορίες άφιξης",
        saving: "Γίνεται αποθήκευση…",
    },
};

export const checkinInfoTranslations: Record<Locale, CheckinInfoDictionary> = {
    en: {
        welcomeMessage: "We're so glad you're here! Below is some helpful information for your stay.",
        checkInOutTitle: "Check-in & Check-out",
        checkInTime: "Check-in",
        checkOutTime: "Check-out",
        wifiTitle: "Internet Access",
        wifiNetwork: "Network Name",
        wifiPassword: "Password",
        copy: "Copy",
        copied: "Copied",
        emergencyTitle: "Emergency Contacts",
        hostContact: "Your Host (24/7)",
        houseRulesTitle: "House Rules",
        rule1: "Quiet hours: 23:00 - 08:00",
        rule2: "No smoking inside the property",
        rule3: "Maximum capacity: 4 guests",
        rule4: "Please respect the neighborhood",
        rule5: "No parties or events are allowed.",
        rule6: "Guests use the terrace at their own risk.",
        amenitiesTitle: "Key Amenities",
        parking: "Free Parking",
        tipsTitle: "Local Tips",
        tip1: "The nearest beach is just 5 minutes walk away",
        tip2: "Supermarket \"AB Vassilopoulos\" is 300m away, open 8:00-21:00",
        tip3: "Check our restaurant recommendations in the main menu",
        tip4: "Need a taxi? Call +30 27210 21112 or use the Taxi app",
        additionalTitle: "Good to Know",
        keysInfo: "Keys:",
        keysDetail: "Please leave your keys in the lockbox upon checkout.",
        trashInfo: "Trash:",
        trashDetail: "You'll find the recycling bins near the main entrance.",
        waterInfo: "Water:",
        waterDetail: "Tap water is safe to drink",
        tvInfo: "Entertainment:",
        tvDetail: "Smart TV with Netflix and YouTube available"
    },
    el: {
        welcomeMessage: "Χαιρόμαστε που είστε εδώ! Παρακάτω θα βρείτε μερικές χρήσιμες πληροφορίες για τη διαμονή σας.",
        checkInOutTitle: "Άφιξη & Αναχώρηση",
        checkInTime: "Άφιξη",
        checkOutTime: "Αναχώρηση",
        wifiTitle: "Πρόσβαση στο Internet",
        wifiNetwork: "Όνομα Δικτύου",
        wifiPassword: "Κωδικός",
        copy: "Αντιγραφή",
        copied: "Αντιγράφηκε",
        emergencyTitle: "Επαφές Έκτακτης Ανάγκης",
        hostContact: "Ο Οικοδεσπότης σας (24/7)",
        houseRulesTitle: "Κανόνες Οικίας",
        rule1: "Ώρες ησυχίας: 23:00 - 08:00",
        rule2: "Απαγορεύεται το κάπνισμα μέσα στο ακίνητο",
        rule3: "Μέγιστη χωρητικότητα: 4 άτομα",
        rule4: "Παρακαλούμε σεβαστείτε τη γειτονιά",
        rule5: "Δεν επιτρέπονται πάρτι ή εκδηλώσεις.",
        rule6: "Οι επισκέπτες χρησιμοποιούν τη βεράντα με δική τους ευθύνη.",
        amenitiesTitle: "Βασικές Ανέσεις",
        parking: "Δωρεάν Πάρκινγκ",
        tipsTitle: "Τοπικές Συμβουλές",
        tip1: "Η πλησιέστερη παραλία απέχει μόλις 5' με τα πόδια",
        tip2: "Το σούπερ μάρκετ \"AB Βασιλόπουλος\" απέχει 300μ, ανοιχτό 8:00-21:00",
        tip3: "Δείτε τις προτάσεις μας για εστιατόρια στο κύριο μενού",
        tip4: "Χρειάζεστε ταξί; Καλέστε +30 27210 21112 ή χρησιμοποιήστε την εφαρμογή Taxi",
        additionalTitle: "Καλό να Γνωρίζετε",
        keysInfo: "Κλειδιά:",
        keysDetail: "Παρακαλούμε αφήστε τα κλειδιά σας στο κουτί κλειδώματος κατά την αναχώρηση.",
        trashInfo: "Σκουπίδια:",
        trashDetail: "Θα βρείτε τους κάδους ανακύκλωσης κοντά στην κεντρική είσοδο.",
        waterInfo: "Νερό:",
        waterDetail: "Το νερό της βρύσης είναι πόσιμο",
        tvInfo: "Ψυχαγωγία:",
        tvDetail: "Έξυπνη τηλεόραση — διαθέσιμα Netflix και YouTube"
    },
};
