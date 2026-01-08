/**
 * Common translations used across the app.
 * Includes: app-level strings, UI labels, search, categories, updates
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface CommonDictionary {
    appTitle: string;
    homeTitle: string;
    homeSubtitle: string;
    backHome: string;
    skipLink?: string;
    details: string;
    bookingDetails?: string;
    aboutUs?: string;
    emptyState: string;
    itemSingular: string;
    itemPlural: string;
    updates?: {
        updateAvailable: string;
        refresh: string;
        dismiss: string;
        fromTo: string;
        assetsFromTo: string;
    };
    search?: {
        where: string;
        addLocation: string;
        dates: string;
        addDates: string;
        guestsLabel: string;
        guestSingular: string;
        guestPlural: string;
        search: string;
        arrivalLabel?: string;
        arrivalPlaceholder?: string;
        departureLabel?: string;
        departurePlaceholder?: string;
    };
    ui?: {
        filters: string;
        map: string;
        list: string;
        resetAll: string;
        activeTags: string;
        none: string;
        back?: string;
        signIn?: string;
        signOut?: string;
    };
    cta: {
        call: string;
        directions: string;
        website: string;
        reserve: string;
        home: string;
    };
    labels?: {
        updated?: string;
        save?: string;
        saved?: string;
        favorites?: string;
        networkOnline?: string;
        networkOffline?: string;
        networkSlow?: string;
        networkReconnected?: string;
        syncPending?: string;
        syncIdle?: string;
    };
    categories: {
        phones: string;
        moments: string;
    };
    momentsFilters?: {
        all: string;
        beaches: string;
        museums: string;
        restaurants: string;
        bars: string;
        brunchs: string;
        taygetos: string;
        sites: string;
        nearby: string;
    };
    map?: {
        loading: string;
        apartmentMarkerTitle: string;
        apartmentMarkerDesc: string;
        viewDetails: string;
        failed: string;
        tokenMissing: string;
        deferredInteractiveLabel: string;
        travelPrompt: string;
    };
}

// ============================================================================
// Translations
// ============================================================================

export const commonTranslations: Record<Locale, CommonDictionary> = {
    en: {
        appTitle: "Guest Guide",
        homeTitle: "Dolce Far Niente",
        homeSubtitle: "Experience the sweet art of relaxation in a haven where you feel instantly at home.",
        backHome: "← Back home",
        skipLink: "Skip to content",
        details: "Details →",
        bookingDetails: "Booking Details",
        aboutUs: "About Us",
        emptyState: "No items yet.",
        itemSingular: "item",
        itemPlural: "items",
        search: {
            where: "Where",
            addLocation: "Choose a location",
            dates: "Dates",
            addDates: "Select your dates",
            guestsLabel: "Guests",
            guestSingular: "guest",
            guestPlural: "guests",
            search: "Search",
            arrivalLabel: "Arrival",
            departureLabel: "Departure",
            arrivalPlaceholder: "Select arrival",
            departurePlaceholder: "Select departure"
        },
        ui: {
            filters: "Filters",
            map: "Map",
            list: "List",
            resetAll: "Reset filters",
            activeTags: "Applied filters",
            none: "None",
            back: "Back",
            signIn: "Sign in",
            signOut: "Sign out"
        },
        updates: {
            updateAvailable: "An update is available",
            refresh: "Refresh",
            dismiss: "Dismiss",
            fromTo: "A new version is ready: {old} → {new}",
            assetsFromTo: "Local guide updated: {old} → {new}"
        },
        cta: {
            call: "Call",
            directions: "Directions",
            website: "Website",
            reserve: "Reserve",
            home: "Home",
        },
        labels: {
            updated: "Updated",
            save: "Save",
            saved: "Saved",
            favorites: "Favorites",
            networkOnline: "Online",
            networkOffline: "Offline",
            networkSlow: "Your connection is slow",
            networkReconnected: "Reconnected",
            syncPending: "Syncing...",
            syncIdle: "Up to date"
        },
        categories: {
            phones: "Important Phones",
            moments: "Kalamata Moments",
        },
        momentsFilters: {
            all: "All",
            beaches: "Beaches",
            museums: "Museums",
            restaurants: "Restaurants",
            bars: "Bars",
            brunchs: "Brunchs",
            taygetos: "Taygetos",
            sites: "Sites",
            nearby: "Nearby",
        },
        map: {
            loading: "Loading map...",
            apartmentMarkerTitle: "Your Apartment",
            apartmentMarkerDesc: "You are here",
            viewDetails: "View details",
            failed: "Map failed to load",
            tokenMissing: "Interactive map temporarily unavailable",
            deferredInteractiveLabel: "The interactive map will load here to keep things speedy.",
            travelPrompt: "Tap a marker to calculate travel time."
        },
    },
    el: {
        appTitle: "Οδηγός Επισκεπτών",
        homeTitle: "Dolce Far Niente",
        homeSubtitle: "Ζήστε τη γλυκιά τέχνη της χαλάρωσης, σε ένα καταφύγιο που νιώθετε αμέσως σαν το σπίτι σας.",
        backHome: "← Πίσω στην αρχική",
        skipLink: "Μετάβαση στο περιεχόμενο",
        details: "Λεπτομέρειες →",
        bookingDetails: "Στοιχεία Κράτησης",
        aboutUs: "Σχετικά με Εμάς",
        emptyState: "Δεν υπάρχουν στοιχεία ακόμη.",
        itemSingular: "στοιχείο",
        itemPlural: "στοιχεία",
        search: {
            where: "Προορισμός",
            addLocation: "Επιλέξτε τοποθεσία",
            dates: "Ημερομηνίες",
            addDates: "Επιλέξτε ημερομηνίες",
            guestsLabel: "Επισκέπτες",
            guestSingular: "επισκέπτης",
            guestPlural: "επισκέπτες",
            search: "Αναζήτηση",
            arrivalLabel: "Άφιξη",
            departureLabel: "Αναχώρηση",
            arrivalPlaceholder: "Επιλογή άφιξης",
            departurePlaceholder: "Επιλογή αναχώρησης"
        },
        ui: {
            filters: "Φίλτρα",
            map: "Χάρτης",
            list: "Λίστα",
            resetAll: "Επαναφορά φίλτρων",
            activeTags: "Ενεργά φίλτρα",
            none: "Κανένα",
            back: "Πίσω",
            signIn: "Σύνδεση",
            signOut: "Αποσύνδεση"
        },
        updates: {
            updateAvailable: "Μια ενημέρωση είναι διαθέσιμη",
            refresh: "Ανανέωση",
            dismiss: "Κλείσιμο",
            fromTo: "Μια νέα έκδοση είναι έτοιμη: {old} → {new}",
            assetsFromTo: "Ο τοπικός οδηγός ενημερώθηκε: {old} → {new}"
        },
        cta: {
            call: "Κλήση",
            directions: "Οδηγίες",
            website: "Ιστότοπος",
            reserve: "Κράτηση",
            home: "Αρχική",
        },
        labels: {
            updated: "Ενημερώθηκε",
            save: "Αποθήκευση",
            saved: "Αποθηκεύτηκε",
            favorites: "Αγαπημένα",
            networkOnline: "Συνδεδεμένο",
            networkOffline: "Εκτός σύνδεσης",
            networkSlow: "Η σύνδεσή σας είναι αργή",
            networkReconnected: "Επανασυνδέθηκε",
            syncPending: "Συγχρονισμός...",
            syncIdle: "Ενημερωμένο"
        },
        categories: {
            phones: "Χρήσιμα Τηλέφωνα",
            moments: "Η Καλαματα μας",
        },
        momentsFilters: {
            all: "Όλα",
            beaches: "Παραλίες",
            museums: "Μουσεία",
            restaurants: "Εστιατόρια",
            bars: "Μπαρ",
            brunchs: "Brunch",
            taygetos: "Ταΰγετος",
            sites: "Αξιοθέατα",
            nearby: "Κοντά",
        },
        map: {
            loading: "Φόρτωση χάρτη...",
            apartmentMarkerTitle: "Το Διαμέρισμά σας",
            apartmentMarkerDesc: "Βρίσκεστε εδώ",
            viewDetails: "Προβολή λεπτομερειών",
            failed: "Αποτυχία φόρτωσης χάρτη",
            tokenMissing: "Ο διαδραστικός χάρτης είναι προσωρινά μη διαθέσιμος",
            deferredInteractiveLabel: "Ο διαδραστικός χάρτης θα φορτώσει εδώ για να διατηρηθεί η ταχύτητα.",
            travelPrompt: "Πατήστε έναν δείκτη για να υπολογίσουμε τον χρόνο διαδρομής."
        },
    },
};
