/**
 * In-stay pages (R3-V9; identity §9.4 stay hub, §9.8 check-in and portal refresh, §9.10 404 and errors,
 * §9.11 offline). The copy is the owner-approved R3-C1 text.
 */

import type { Locale } from '../config';

export interface StayDictionary {
    hub: {
        title: string;
        lead: string;
        portalSignInTitle: string;
        portalSignInText: string;
        portalSignInCta: string;
        portalOpenTitle: string;
        portalOpenText: string;
        portalOpenCta: string;
        wifiTitle: string;
        wifiText: string;
        checkoutTitle: string;
        checkoutText: string;
        locked: string;
        rulesTitle: string;
        rulesText: string;
        sosLabel: string;
        phonesAll: string;
        guideText: string;
        searchSubmit: string;
        favouritesTitle: string;
        favouritesText: string;
    };
    checkin: {
        checkoutBy: string;
        emergency112: string;
        guideText: string;
        guideCta: string;
        wifiCopied: string;
        wifiCopyFailed: string;
    };
    guest: {
        setUpTitle: string;
    };
    refresh: {
        title: string;
        lead: string;
        stillWorking: string;
        signIn: string;
    };
    offline: {
        title: string;
        lead: string;
        tip: string;
        emergency: string;
        emergencyText: string;
        retry: string;
    };
}

export const stayTranslations: Record<Locale, StayDictionary> = {
    en: {
        hub: {
            title: "Welcome home.",
            lead: "Everything for your days in Kalamata, in one place.",
            portalSignInTitle: "Sign in to your stay",
            portalSignInText: "Your check-in, Wi-Fi and house details. Your host sends you the link.",
            portalSignInCta: "Sign in",
            portalOpenTitle: "Open your check-in",
            portalOpenText: "Arrival, Wi-Fi, house rules and check-out for your dates.",
            portalOpenCta: "Open check-in",
            wifiTitle: "Wi-Fi",
            wifiText: "Network name and password",
            checkoutTitle: "Check-out",
            checkoutText: "Time and keys",
            locked: "Sign in to see",
            rulesTitle: "House rules",
            rulesText: "Quiet hours, smoking, guests",
            sosLabel: "free from any phone",
            phonesAll: "All phones",
            guideText: "Places to see near the apartment.",
            searchSubmit: "Search",
            favouritesTitle: "Favourites",
            favouritesText: "Places you saved",
        },
        checkin: {
            checkoutBy: "Please check out by {time}.",
            emergency112: "Emergency (112)",
            guideText: "Places, phones and tips near the apartment.",
            guideCta: "Open the guide",
            wifiCopied: "Wi-Fi details copied",
            wifiCopyFailed: "Copy failed. Select the Wi-Fi details and copy them.",
        },
        guest: {
            setUpTitle: "Set up your stay",
        },
        refresh: {
            title: "Signing you in…",
            lead: "One moment while we restore your access.",
            stillWorking: "Still working…",
            signIn: "Sign in instead",
        },
        offline: {
            title: "You're offline",
            lead: "Pages you opened before are still here. When the connection is back, tap Retry.",
            tip: "Tip: open the pages you need while you are online, so they are ready later.",
            emergency: "Emergency: 112",
            emergencyText: "Phone calls work without internet.",
            retry: "Retry",
        },
    },
    el: {
        hub: {
            title: "Καλώς ήρθατε.",
            lead: "Όλα όσα χρειάζεστε για τις μέρες σας στην Καλαμάτα, σε ένα σημείο.",
            portalSignInTitle: "Συνδεθείτε στη διαμονή σας",
            portalSignInText: "Η άφιξη, το Wi-Fi και οι πληροφορίες του σπιτιού. Η οικοδέσποινα σάς στέλνει τον σύνδεσμο.",
            portalSignInCta: "Σύνδεση",
            portalOpenTitle: "Ανοίξτε τη σελίδα άφιξης",
            portalOpenText: "Άφιξη, Wi-Fi, κανόνες του σπιτιού και αναχώρηση για τις ημερομηνίες σας.",
            portalOpenCta: "Άνοιγμα άφιξης",
            wifiTitle: "Wi-Fi",
            wifiText: "Όνομα δικτύου και κωδικός",
            checkoutTitle: "Αναχώρηση",
            checkoutText: "Ώρα και κλειδιά",
            locked: "Συνδεθείτε για να το δείτε",
            rulesTitle: "Κανόνες του σπιτιού",
            rulesText: "Ώρες ησυχίας, κάπνισμα, επισκέπτες",
            sosLabel: "δωρεάν από κάθε τηλέφωνο",
            phonesAll: "Όλα τα τηλέφωνα",
            guideText: "Μέρη να δείτε κοντά στο διαμέρισμα.",
            searchSubmit: "Αναζήτηση",
            favouritesTitle: "Αγαπημένα",
            favouritesText: "Μέρη που αποθηκεύσατε",
        },
        checkin: {
            checkoutBy: "Παρακαλούμε αναχωρήστε έως τις {time}.",
            emergency112: "Έκτακτη ανάγκη (112)",
            guideText: "Μέρη, τηλέφωνα και συμβουλές κοντά στο διαμέρισμα.",
            guideCta: "Άνοιγμα οδηγού",
            wifiCopied: "Τα στοιχεία του Wi-Fi αντιγράφηκαν",
            wifiCopyFailed: "Η αντιγραφή απέτυχε. Επιλέξτε τα στοιχεία του Wi-Fi και αντιγράψτε τα.",
        },
        guest: {
            setUpTitle: "Ρυθμίστε τη διαμονή σας",
        },
        refresh: {
            title: "Σας συνδέουμε…",
            lead: "Μια στιγμή, επαναφέρουμε την πρόσβασή σας.",
            stillWorking: "Ακόμη σε εξέλιξη…",
            signIn: "Σύνδεση με κωδικό",
        },
        offline: {
            title: "Είστε εκτός σύνδεσης",
            lead: "Οι σελίδες που ανοίξατε πριν είναι ακόμη εδώ. Μόλις επανέλθει η σύνδεση, πατήστε Επαναφόρτωση.",
            tip: "Συμβουλή: ανοίξτε τις σελίδες που χρειάζεστε όσο έχετε σύνδεση, για να είναι έτοιμες αργότερα.",
            emergency: "Έκτακτη ανάγκη: 112",
            emergencyText: "Οι κλήσεις λειτουργούν χωρίς internet.",
            retry: "Επαναφόρτωση",
        },
    },
};
