/**
 * Check-in related translations.
 * Includes: check-in navigation labels and the check-in info page
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface CheckinDictionary {
    navLabel: string;
    saving: string;
}

export interface CheckinInfoDictionary {
    pageTitle: string;
    welcomeMessage: string;
    checkInOutTitle: string;
    checkInTime: string;
    checkOutTime: string;
    wifiTitle: string;
    wifiNetwork: string;
    wifiPassword: string;
    copy: string;
    copied: string;
    emergencyTitle: string;
    hostContact: string;
    houseRulesTitle: string;
    rule1: string;
    rule2: string;
    rule3: string;
    rule4: string;
    rule5: string;
    rule6: string;
    amenitiesTitle: string;
    parking: string;
    parkingDetail: string;
    tipsTitle: string;
    tip1: string;
    tip2: string;
    tip3: string;
    /** `{taxiPhone}` is replaced with the `taxi` entry of the phone directory (src/data/items/phones.json). */
    tip4: string;
    additionalTitle: string;
    keysInfo: string;
    keysDetail: string;
    trashInfo: string;
    trashDetail: string;
    waterInfo: string;
    waterDetail: string;
    tvInfo: string;
    tvDetail: string;
    /** Check-in page UI strings (moved from inline locale ternaries). */
    panel: {
        heroTitle: string;
        quickActions: string;
        copyWifi: string;
        openMaps: string;
        viewRules: string;
        guestEssentials: string;
        address: string;
        unavailable: string;
        wifiAvailableFrom: string;
        save: string;
        cancel: string;
        edit: string;
        saved: string;
        standardCheckIn: string;
        requestDifferentArrival: string;
        preferredArrivalTime: string;
        arrivalNote: string;
        arrivalNotePlaceholder: string;
        sendRequest: string;
        requestSent: string;
        requestError: string;
        requestClosed: string;
        requestRequired: string;
        latestRequest: string;
        statusPending: string;
        statusApproved: string;
        statusRejected: string;
        statusPendingCopy: string;
        statusApprovedCopy: string;
        statusRejectedCopy: string;
        editTimesHostOnly: string;
        networkCopyLabel: string;
        passwordCopyLabel: string;
        unknownError: string;
        saveFailed: string;
        saveFailedRetry: string;
        requestAlreadyPending: string;
    };
}

// ============================================================================
// Translations
// ============================================================================

export const checkinTranslations: Record<Locale, CheckinDictionary> = {
    en: {
        navLabel: "Check-in",
        saving: "Saving…",
    },
    el: {
        navLabel: "Άφιξη",
        saving: "Γίνεται αποθήκευση…",
    },
};

export const checkinInfoTranslations: Record<Locale, CheckinInfoDictionary> = {
    en: {
        pageTitle: "Check-in information",
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
        parkingDetail: "Free private outdoor parking at the property.",
        tipsTitle: "Local Tips",
        tip1: "The nearest beach is 5 minutes away by car",
        tip2: "Supermarket \"AB Vassilopoulos\" is 300m away, open 8:00-21:00",
        tip3: "Museums and places nearby are in the Kalamata guide",
        tip4: "Need a taxi? Call {taxiPhone} or use the Taxi app",
        additionalTitle: "Good to Know",
        keysInfo: "Keys:",
        keysDetail: "Please leave your keys in the lockbox upon checkout.",
        trashInfo: "Trash:",
        trashDetail: "You'll find the recycling bins near the main entrance.",
        waterInfo: "Water:",
        waterDetail: "Tap water is safe to drink",
        tvInfo: "Entertainment:",
        tvDetail: "Smart TV with Netflix and YouTube available",
        panel: {
            heroTitle: "Make yourself at home in Kalamata",
            quickActions: "Quick actions",
            copyWifi: "Copy Wi-Fi",
            openMaps: "Open Maps",
            viewRules: "House Rules",
            guestEssentials: "Guest Essentials",
            address: "Address",
            unavailable: "Unavailable",
            wifiAvailableFrom: "Available from",
            save: "Save",
            cancel: "Cancel",
            edit: "Edit",
            saved: "Check-in times saved.",
            standardCheckIn: "Standard check-in",
            requestDifferentArrival: "Request different arrival time",
            preferredArrivalTime: "Preferred arrival time",
            arrivalNote: "Add a note",
            arrivalNotePlaceholder: "E.g. we may arrive earlier because of our flight.",
            sendRequest: "Send request",
            requestSent: "Your request has been sent. We'll confirm availability as soon as possible.",
            requestError: "Unable to send the request. Please try again.",
            requestClosed: "Your check-in date has passed, so a new arrival time can no longer be requested. For any change, please contact your host.",
            requestRequired: "Choose a preferred arrival time.",
            latestRequest: "Latest request",
            statusPending: "Pending",
            statusApproved: "Confirmed",
            statusRejected: "Unavailable",
            statusPendingCopy: "Your request has been received and is awaiting confirmation.",
            statusApprovedCopy: "Your requested arrival time has been confirmed.",
            statusRejectedCopy: "Your requested arrival time could not be confirmed. Any arrival time confirmed earlier, otherwise the standard check-in time, still applies.",
            editTimesHostOnly: "Edit times (host only)",
            networkCopyLabel: "Copy Wi-Fi network name",
            passwordCopyLabel: "Copy Wi-Fi password",
            unknownError: "Unknown error",
            saveFailed: "Failed to save",
            saveFailedRetry: "Failed to save preferences. Please try again.",
            requestAlreadyPending: "You already have a request awaiting confirmation, so the new time was not sent. You can ask for another time once the host has answered.",
        }
    },
    el: {
        welcomeMessage: "Χαιρόμαστε που είστε εδώ! Παρακάτω θα βρείτε μερικές χρήσιμες πληροφορίες για τη διαμονή σας.",
        pageTitle: "Πληροφορίες άφιξης",
        checkInOutTitle: "Άφιξη & Αναχώρηση",
        checkInTime: "Άφιξη",
        checkOutTime: "Αναχώρηση",
        wifiTitle: "Πρόσβαση στο Internet",
        wifiNetwork: "Όνομα Δικτύου",
        wifiPassword: "Κωδικός",
        copy: "Αντιγραφή",
        copied: "Αντιγράφηκε",
        emergencyTitle: "Επαφές Έκτακτης Ανάγκης",
        hostContact: "Η οικοδέσποινά σας (24/7)",
        houseRulesTitle: "Κανόνες Οικίας",
        rule1: "Ώρες ησυχίας: 23:00 - 08:00",
        rule2: "Απαγορεύεται το κάπνισμα μέσα στο ακίνητο",
        rule3: "Μέγιστη χωρητικότητα: 4 άτομα",
        rule4: "Παρακαλούμε σεβαστείτε τη γειτονιά",
        rule5: "Δεν επιτρέπονται πάρτι ή εκδηλώσεις.",
        rule6: "Οι επισκέπτες χρησιμοποιούν τη βεράντα με δική τους ευθύνη.",
        amenitiesTitle: "Βασικές Ανέσεις",
        parking: "Δωρεάν Πάρκινγκ",
        parkingDetail: "Δωρεάν εξωτερικό ιδιωτικό πάρκινγκ στο κατάλυμα.",
        tipsTitle: "Τοπικές Συμβουλές",
        tip1: "Η κοντινότερη παραλία είναι 5 λεπτά με το αυτοκίνητο",
        tip2: "Το σούπερ μάρκετ \"AB Βασιλόπουλος\" απέχει 300μ, ανοιχτό 8:00-21:00",
        tip3: "Μουσεία και μέρη κοντά θα βρείτε στον οδηγό Καλαμάτας",
        tip4: "Χρειάζεστε ταξί; Καλέστε {taxiPhone} ή χρησιμοποιήστε την εφαρμογή Taxi",
        additionalTitle: "Καλό να Γνωρίζετε",
        keysInfo: "Κλειδιά:",
        keysDetail: "Παρακαλούμε αφήστε τα κλειδιά σας στο κουτί κλειδώματος κατά την αναχώρηση.",
        trashInfo: "Σκουπίδια:",
        trashDetail: "Θα βρείτε τους κάδους ανακύκλωσης κοντά στην κεντρική είσοδο.",
        waterInfo: "Νερό:",
        waterDetail: "Το νερό της βρύσης είναι πόσιμο",
        tvInfo: "Ψυχαγωγία:",
        tvDetail: "Έξυπνη τηλεόραση — διαθέσιμα Netflix και YouTube",
        panel: {
            heroTitle: "Νιώστε σαν στο σπίτι σας στην Καλαμάτα",
            quickActions: "Γρήγορες ενέργειες",
            copyWifi: "Αντιγραφή Wi-Fi",
            openMaps: "Άνοιγμα χάρτη",
            viewRules: "Κανόνες σπιτιού",
            guestEssentials: "Βασικά για τη διαμονή",
            address: "Διεύθυνση",
            unavailable: "Μη διαθέσιμο",
            wifiAvailableFrom: "Διαθέσιμο από",
            save: "Αποθήκευση",
            cancel: "Ακύρωση",
            edit: "Επεξεργασία",
            saved: "Οι ώρες αποθηκεύτηκαν.",
            standardCheckIn: "Κανονική ώρα άφιξης",
            requestDifferentArrival: "Ζητήστε διαφορετική ώρα άφιξης",
            preferredArrivalTime: "Προτιμώμενη ώρα άφιξης",
            arrivalNote: "Προσθέστε σημείωση",
            arrivalNotePlaceholder: "Π.χ. φτάνουμε νωρίτερα λόγω πτήσης.",
            sendRequest: "Αποστολή αιτήματος",
            requestSent: "Το αίτημά σας στάλθηκε. Θα επιβεβαιώσουμε τη διαθεσιμότητα το συντομότερο δυνατό.",
            requestError: "Δεν ήταν δυνατή η αποστολή του αιτήματος. Παρακαλούμε δοκιμάστε ξανά.",
            requestClosed: "Η ημερομηνία άφιξής σας έχει περάσει, οπότε δεν μπορείτε πλέον να ζητήσετε νέα ώρα άφιξης. Για οποιαδήποτε αλλαγή, επικοινωνήστε με την οικοδέσποινα.",
            requestRequired: "Επιλέξτε προτιμώμενη ώρα άφιξης.",
            latestRequest: "Τελευταίο αίτημα",
            statusPending: "Σε εκκρεμότητα",
            statusApproved: "Εγκρίθηκε",
            statusRejected: "Δεν είναι διαθέσιμο",
            statusPendingCopy: "Το αίτημά σας έχει ληφθεί και αναμένει επιβεβαίωση.",
            statusApprovedCopy: "Η ώρα άφιξης που ζητήσατε έχει επιβεβαιωθεί.",
            statusRejectedCopy: "Η ώρα άφιξης που ζητήσατε δεν μπόρεσε να επιβεβαιωθεί. Ισχύει όποια ώρα σας είχε επιβεβαιωθεί νωρίτερα, αλλιώς η κανονική ώρα άφιξης.",
            editTimesHostOnly: "Επεξεργασία ωρών (μόνο οικοδέσποινα)",
            networkCopyLabel: "Αντιγραφή ονόματος δικτύου Wi-Fi",
            passwordCopyLabel: "Αντιγραφή κωδικού Wi-Fi",
            unknownError: "Άγνωστο σφάλμα",
            saveFailed: "Αποτυχία αποθήκευσης",
            saveFailedRetry: "Αποτυχία αποθήκευσης προτιμήσεων. Παρακαλώ δοκιμάστε ξανά.",
            requestAlreadyPending: "Έχετε ήδη αίτημα που περιμένει επιβεβαίωση, οπότε η νέα ώρα δεν στάλθηκε. Μπορείτε να ζητήσετε άλλη ώρα όταν απαντήσει η οικοδέσποινα.",
        }
    },
};
