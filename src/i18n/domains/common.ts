/**
 * Common translations used across the app.
 * Includes: app-level strings, UI labels, categories, map, updates
 */

import type { Locale } from '../config';
import { BRAND_NAME } from '@/data/brand';

// ============================================================================
// Types
// ============================================================================

export interface CommonDictionary {
    appTitle: string;
    skipLink: string;
    emptyState: string;
    updates: {
        updateAvailable: string;
        refresh: string;
        dismiss: string;
        fromTo: string;
        assetsFromTo: string;
    };
    ui: {
        map: string;
        list: string;
        signIn: string;
        signOut: string;
        menu: string;
        closeMenu: string;
        primaryNavigation: string;
        yourStay: string;
    };
    cta: {
        call: string;
        directions: string;
        website: string;
        home: string;
    };
    labels: {
        networkOnline: string;
        networkOffline: string;
        networkSlow: string;
        networkReconnected: string;
        addedFavorite: string;
        removedFavorite: string;
        contentUpdating: string;
    };
    momentTags: Record<string, string>;
    errors: {
        title: string;
        tryAgain: string;
        contactSupport: string;
        somethingWentWrong: string;
        unexpectedError: string;
        notFoundTitle: string;
        notFoundBody: string;
    };
    a2hs: {
        message: string;
        close: string;
        region: string;
    };
    categories: {
        phones: string;
        moments: string;
    };
    momentsFilters: {
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
    map: {
        loading: string;
        viewDetails: string;
        deferredInteractiveLabel: string;
        address: string;
        phone: string;
        directions: string;
        website: string;
        home: string;
        locateMe: string;
        locationUnavailable: string;
        fitToMarkers: string;
        zoomIn: string;
        zoomOut: string;
    };
}

// ============================================================================
// Translations
// ============================================================================

export const commonTranslations: Record<Locale, CommonDictionary> = {
    en: {
        appTitle: BRAND_NAME,
        skipLink: "Skip to content",
        emptyState: "No items yet.",
        ui: {
            map: "Map",
            list: "List",
            signIn: "Sign in",
            signOut: "Sign out",
            menu: "Open menu",
            closeMenu: "Close menu",
            primaryNavigation: "Primary navigation",
            yourStay: "Your stay",
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
            home: "Home",
        },
        labels: {
            networkOnline: "Online",
            networkOffline: "Offline",
            networkSlow: "Your connection is slow",
            networkReconnected: "Reconnected",
            addedFavorite: "Added to favorites",
            removedFavorite: "Removed from favorites",
            contentUpdating: "Content updating – please check again later."
        },
        momentTags: {
            archaeology: "Archaeology",
            bar: "Bar",
            beach: "Beach",
            brunch: "Brunch",
            cafe: "Cafe",
            culture: "Culture",
            emergency: "Emergency",
            food: "Food",
            health: "Health",
            history: "History",
            hiking: "Hiking",
            hospital: "Hospital",
            military: "History",
            medical: "Medical",
            mountain: "Taygetos",
            museum: "Museum",
            nearby: "Nearby",
            nightlife: "Nightlife",
            outdoor: "Outdoor",
            police: "Police",
            railway: "Railway",
            restaurant: "Restaurant",
            safety: "Safety",
            sightseeing: "Site",
            site: "Site",
            taygetos: "Taygetos",
            taxi: "Taxi",
            transport: "Transport"
        },
        errors: {
            title: "There were some problems",
            tryAgain: "Try again",
            contactSupport: "Contact support",
            somethingWentWrong: "Something went wrong",
            unexpectedError: "An unexpected error occurred. You can try to recover.",
            notFoundTitle: "This page is taking a siesta.",
            notFoundBody: "This page does not exist or has moved. The guide's home page has everything for your stay."
        },
        a2hs: {
            message: "Add to Home Screen: Share → Add to Home Screen",
            close: "Close",
            region: "iOS add to home screen tip"
        },
        categories: {
            phones: "Important phones",
            moments: "Kalamata guide",
        },
        momentsFilters: {
            all: "All",
            beaches: "Beaches",
            museums: "Museums",
            restaurants: "Restaurants",
            bars: "Bars",
            brunchs: "Brunch",
            taygetos: "Taygetos",
            sites: "Sites",
            nearby: "Nearby",
        },
        map: {
            loading: "Loading map...",
            viewDetails: "View details",
            deferredInteractiveLabel: "The interactive map will load here to keep things speedy.",
            address: "Address",
            phone: "Phone",
            directions: "Directions",
            website: "Website",
            home: "You're staying here",
            locateMe: "Locate me",
            locationUnavailable: "Your location is unavailable. Check browser location permission and try again.",
            fitToMarkers: "Fit to markers",
            zoomIn: "Zoom in",
            zoomOut: "Zoom out",
        },
    },
    el: {
        appTitle: BRAND_NAME,
        skipLink: "Μετάβαση στο περιεχόμενο",
        emptyState: "Δεν υπάρχουν στοιχεία ακόμη.",
        ui: {
            map: "Χάρτης",
            list: "Λίστα",
            signIn: "Σύνδεση",
            signOut: "Αποσύνδεση",
            menu: "Άνοιγμα μενού",
            closeMenu: "Κλείσιμο μενού",
            primaryNavigation: "Κύρια πλοήγηση",
            yourStay: "Η διαμονή σας",
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
            home: "Αρχική",
        },
        labels: {
            networkOnline: "Συνδεδεμένο",
            networkOffline: "Εκτός σύνδεσης",
            networkSlow: "Η σύνδεσή σας είναι αργή",
            networkReconnected: "Επανασυνδέθηκε",
            addedFavorite: "Προστέθηκε στα αγαπημένα",
            removedFavorite: "Αφαιρέθηκε από τα αγαπημένα",
            contentUpdating: "Το περιεχόμενο ενημερώνεται – δοκιμάστε ξανά αργότερα."
        },
        momentTags: {
            archaeology: "Αρχαιολογία",
            bar: "Μπαρ",
            beach: "Παραλία",
            brunch: "Brunch",
            cafe: "Καφέ",
            culture: "Πολιτισμός",
            emergency: "Έκτακτη ανάγκη",
            food: "Φαγητό",
            health: "Υγεία",
            history: "Ιστορία",
            hiking: "Πεζοπορία",
            hospital: "Νοσοκομείο",
            military: "Ιστορία",
            medical: "Ιατρική",
            mountain: "Ταΰγετος",
            museum: "Μουσείο",
            nearby: "Κοντά",
            nightlife: "Νυχτερινή ζωή",
            outdoor: "Εξωτερικοί χώροι",
            police: "Αστυνομία",
            railway: "Σιδηρόδρομος",
            restaurant: "Εστιατόριο",
            safety: "Ασφάλεια",
            sightseeing: "Αξιοθέατο",
            site: "Αξιοθέατο",
            taygetos: "Ταΰγετος",
            taxi: "Ταξί",
            transport: "Μεταφορές"
        },
        errors: {
            title: "Παρουσιάστηκαν κάποια προβλήματα",
            tryAgain: "Δοκιμάστε ξανά",
            contactSupport: "Επικοινωνία με υποστήριξη",
            somethingWentWrong: "Κάτι πήγε στραβά",
            unexpectedError: "Παρουσιάστηκε ένα απροσδόκητο σφάλμα. Μπορείτε να δοκιμάσετε ξανά.",
            notFoundTitle: "Αυτή η σελίδα κάνει σιέστα.",
            notFoundBody: "Αυτή η σελίδα δεν υπάρχει ή έχει μετακινηθεί. Στην αρχική σελίδα του οδηγού θα βρείτε όλα όσα χρειάζεστε για τη διαμονή σας."
        },
        a2hs: {
            message: "Προσθήκη στην Αρχική Οθόνη: Κοινοποίηση → Προσθήκη στην Αρχική Οθόνη",
            close: "Κλείσιμο",
            region: "Συμβουλή προσθήκης στην αρχική οθόνη iOS"
        },
        categories: {
            phones: "Χρήσιμα τηλέφωνα",
            moments: "Οδηγός Καλαμάτας",
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
            viewDetails: "Προβολή λεπτομερειών",
            deferredInteractiveLabel: "Ο διαδραστικός χάρτης θα φορτώσει εδώ για να διατηρηθεί η ταχύτητα.",
            address: "Διεύθυνση",
            phone: "Τηλέφωνο",
            directions: "Οδηγίες",
            website: "Ιστότοπος",
            home: "Εδώ μένετε",
            locateMe: "Εντοπισμός θέσης",
            locationUnavailable: "Η τοποθεσία σας δεν είναι διαθέσιμη. Ελέγξτε την άδεια τοποθεσίας του browser και δοκιμάστε ξανά.",
            fitToMarkers: "Προβολή όλων των σημείων",
            zoomIn: "Μεγέθυνση",
            zoomOut: "Σμίκρυνση",
        },
    },
};
