/**
 * Check-in related translations.
 * Includes: check-in form, check-in info page, amenities, tips
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface CheckinDictionary {
    navLabel?: string;
    navInfoLabel?: string;
    title?: string;
    summary?: string;
    bookingId?: string;
    reference?: string;
    source?: string;
    phone?: string;
    dates?: string;
    room?: string;
    arrivalTime?: string;
    arrivalTimeInvalid?: string;
    specialRequests?: string;
    acceptTerms?: string;
    submit?: string;
    submitted?: string;
    saving?: string;
    loading?: string;
}

export interface CheckinInfoDictionary {
    welcome?: string;
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
    hostName?: string;
    emergencyServices?: string;
    police?: string;
    localHospital?: string;
    houseRulesTitle?: string;
    rule1?: string;
    rule2?: string;
    rule3?: string;
    rule4?: string;
    rule5?: string;
    amenitiesTitle?: string;
    ac?: string;
    heating?: string;
    kitchen?: string;
    washer?: string;
    parking?: string;
    pool?: string;
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
        title: "Check-in",
        summary: "Your Booking",
        bookingId: "Booking ID",
        reference: "Reference",
        source: "Source",
        phone: "Phone",
        dates: "Dates",
        room: "Room",
        arrivalTime: "Arrival time",
        arrivalTimeInvalid: "Please enter a valid time (HH:mm)",
        specialRequests: "Special requests",
        acceptTerms: "I confirm my details are correct and I accept the terms.",
        submit: "Complete Check-in",
        submitted: "Check-in completed",
        saving: "Saving…",
        loading: "Loading booking…",
    },
    el: {
        navLabel: "Άφιξη",
        navInfoLabel: "Πληροφορίες άφιξης",
        title: "Άφιξη",
        summary: "Η Κράτησή σας",
        bookingId: "Κωδικός κράτησης",
        reference: "Αναφορά",
        source: "Πηγή",
        phone: "Τηλέφωνο",
        dates: "Ημερομηνίες",
        room: "Δωμάτιο",
        arrivalTime: "Ώρα άφιξης",
        arrivalTimeInvalid: "Παρακαλώ εισάγετε έγκυρη ώρα (ΩΩ:λλ)",
        specialRequests: "Ειδικά αιτήματα",
        acceptTerms: "Επιβεβαιώνω ότι τα στοιχεία μου είναι σωστά και αποδέχομαι τους όρους.",
        submit: "Ολοκλήρωση Άφιξης",
        submitted: "Η άφιξη ολοκληρώθηκε",
        saving: "Γίνεται αποθήκευση…",
        loading: "Φόρτωση κράτησης…",
    },
};

export const checkinInfoTranslations: Record<Locale, CheckinInfoDictionary> = {
    en: {
        welcome: "🎉 Welcome!",
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
        hostName: "Available 24/7",
        emergencyServices: "Emergency Services",
        police: "Police, Fire, Ambulance",
        localHospital: "Local Hospital",
        houseRulesTitle: "House Rules",
        rule1: "Quiet hours: 23:00 - 08:00",
        rule2: "No smoking inside the property",
        rule3: "Maximum capacity: 6 guests",
        rule4: "Please respect the neighborhood",
        rule5: "Pets allowed with prior approval",
        amenitiesTitle: "Key Amenities",
        ac: "Air Conditioning",
        heating: "Heating",
        kitchen: "Full Kitchen",
        washer: "Washer/Dryer",
        parking: "Free Parking",
        pool: "Swimming Pool",
        tipsTitle: "Local Tips",
        tip1: "The nearest beach is just 5 minutes walk away",
        tip2: "Supermarket \"AB Vassilopoulos\" is 300m away, open 8:00-21:00",
        tip3: "Check our restaurant recommendations in the main menu",
        tip4: "Need a taxi? Call +30 2721 023456 or use the Taxi app",
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
        welcome: "🎉 Καλώς ήρθατε!",
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
        hostName: "Διαθέσιμος 24/7",
        emergencyServices: "Υπηρεσίες Έκτακτης Ανάγκης",
        police: "Αστυνομία, Πυροσβεστική, Ασθενοφόρο",
        localHospital: "Τοπικό Νοσοκομείο",
        houseRulesTitle: "Κανόνες Οικίας",
        rule1: "Ώρες ησυχίας: 23:00 - 08:00",
        rule2: "Απαγορεύεται το κάπνισμα μέσα στο ακίνητο",
        rule3: "Μέγιστη χωρητικότητα: 6 άτομα",
        rule4: "Παρακαλούμε σεβαστείτε τη γειτονιά",
        rule5: "Κατοικίδια επιτρέπονται με προηγούμενη έγκριση",
        amenitiesTitle: "Βασικές Ανέσεις",
        ac: "Κλιματισμός",
        heating: "Θέρμανση",
        kitchen: "Πλήρης Κουζίνα",
        washer: "Πλυντήριο/Στεγνωτήριο",
        parking: "Δωρεάν Πάρκινγκ",
        pool: "Πισίνα",
        tipsTitle: "Τοπικές Συμβουλές",
        tip1: "Η πλησιέστερη παραλία απέχει μόλις 5' με τα πόδια",
        tip2: "Το σούπερ μάρκετ \"AB Βασιλόπουλος\" απέχει 300μ, ανοιχτό 8:00-21:00",
        tip3: "Δείτε τις προτάσεις μας για εστιατόρια στο κύριο μενού",
        tip4: "Χρειάζεστε ταξί; Καλέστε +30 2721 023456 ή χρησιμοποιήστε την εφαρμογή Taxi",
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
