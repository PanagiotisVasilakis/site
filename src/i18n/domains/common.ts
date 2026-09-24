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
    bookingDetails?: string;
    aboutUs?: string;
    emptyState: string;
    updates?: {
        updateAvailable: string;
        refresh: string;
        dismiss: string;
        fromTo: string;
        assetsFromTo: string;
    };
    search?: {
        addDates: string;
        arrivalLabel?: string;
        arrivalPlaceholder?: string;
        departureLabel?: string;
        departurePlaceholder?: string;
        checkAvailability?: string;
    };
    ui?: {
        map: string;
        list: string;
        resetAll: string;
        back?: string;
        signIn?: string;
        signOut?: string;
        menu?: string;
        closeMenu?: string;
        guestGuide?: string;
        preferences?: string;
        lightMode?: string;
        darkMode?: string;
        primaryNavigation?: string;
        yourStay?: string;
        explore?: string;
        account?: string;
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
        rating?: string;
        addedFavorite?: string;
        removedFavorite?: string;
        addFavorite?: string;
        removeFavorite?: string;
        share?: string;
        contentUpdating?: string;
    };
    a11y?: {
        placeDetails?: string;
        viewDetailsFor?: string;
        openMapFor?: string;
        switchToLight?: string;
        switchToDark?: string;
        toggleColorScheme?: string;
        addNamedFavorite?: string;
        removeNamedFavorite?: string;
    };
    datePicker?: {
        calendar?: string;
        clearSelected?: string;
        clearDates?: string;
        prevMonth?: string;
        nextMonth?: string;
        selectDates?: string;
        applyDates?: string;
        applyRange?: string;
        rangePicker?: string;
    };
    momentTags?: Record<string, string>;
    moments?: {
        searchAndFilter?: string;
        searchMoments?: string;
        searchPlaceholder?: string;
        noPlaces?: string;
        clearSearch?: string;
        filterByCategory?: string;
        mapCaption?: string;
        subtitle?: string;
    };
    errors?: {
        title?: string;
        tryAgain?: string;
        contactSupport?: string;
        somethingWentWrong?: string;
        unexpectedError?: string;
    };
    a2hs?: {
        message?: string;
        close?: string;
        region?: string;
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
        viewDetails: string;
        deferredInteractiveLabel: string;
        travelPrompt: string;
        openMap?: string;
        loadMap: string;
        address: string;
        phone: string;
        directions: string;
        website: string;
        locateMe: string;
        locationUnavailable: string;
        fitToMarkers: string;
        zoomIn: string;
        zoomOut: string;
        approximate: string;
        travelUnavailable: string;
        travelUnavailableWithDirections: string;
        unavailable: string;
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
        bookingDetails: "Booking Details",
        aboutUs: "About Us",
        emptyState: "No items yet.",
        search: {
            addDates: "Select your dates",
            arrivalLabel: "Arrival",
            departureLabel: "Departure",
            arrivalPlaceholder: "Select arrival",
            departurePlaceholder: "Select departure",
            checkAvailability: "Check availability"
        },
        ui: {
            map: "Map",
            list: "List",
            resetAll: "Reset filters",
            back: "Back",
            signIn: "Sign in",
            signOut: "Sign out",
            menu: "Open menu",
            closeMenu: "Close menu",
            guestGuide: "Your stay, at a glance",
            preferences: "Preferences",
            lightMode: "Light",
            darkMode: "Dark",
            primaryNavigation: "Primary navigation",
            yourStay: "Your stay",
            explore: "Explore Kalamata",
            account: "Guest account",
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
            syncIdle: "Up to date",
            rating: "{value} rating",
            addedFavorite: "Added to favorites",
            removedFavorite: "Removed from favorites",
            addFavorite: "Add to favorites",
            removeFavorite: "Remove from favorites",
            share: "Share",
            contentUpdating: "Content updating – please check again later."
        },
        a11y: {
            placeDetails: "Place details",
            viewDetailsFor: "View details for {name}",
            openMapFor: "Open map for {name}",
            switchToLight: "Switch to light mode",
            switchToDark: "Switch to dark mode",
            toggleColorScheme: "Toggle color scheme",
            addNamedFavorite: "Add {label} to favorites",
            removeNamedFavorite: "Remove {label} from favorites"
        },
        datePicker: {
            calendar: "Date picker calendar",
            clearSelected: "Clear selected dates",
            clearDates: "Clear dates",
            prevMonth: "Previous month",
            nextMonth: "Next month",
            selectDates: "Select check-in and check-out dates",
            applyDates: "Apply dates",
            applyRange: "Apply selected date range",
            rangePicker: "Date range picker"
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
        moments: {
            searchAndFilter: "Search and filter moments",
            searchMoments: "Search moments",
            searchPlaceholder: "Search places, beaches, museums...",
            noPlaces: "No places found. Try another category or clear your search.",
            clearSearch: "Clear search",
            filterByCategory: "Filter moments by category",
            mapCaption: "Apartment location and nearby {category}. Zoom and click markers for details.",
            subtitle: "Curated local recommendations for your stay"
        },
        errors: {
            title: "There were some problems",
            tryAgain: "Try again",
            contactSupport: "Contact support",
            somethingWentWrong: "Something went wrong",
            unexpectedError: "An unexpected error occurred. You can try to recover."
        },
        a2hs: {
            message: "Add to Home Screen: Share → Add to Home Screen",
            close: "Close",
            region: "iOS add to home screen tip"
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
            viewDetails: "View details",
            deferredInteractiveLabel: "The interactive map will load here to keep things speedy.",
            travelPrompt: "Tap a marker to calculate travel time.",
            openMap: "Open map",
            loadMap: "Load map",
            address: "Address",
            phone: "Phone",
            directions: "Directions",
            website: "Website",
            locateMe: "Locate me",
            locationUnavailable: "Your location is unavailable. Check browser location permission and try again.",
            fitToMarkers: "Fit to markers",
            zoomIn: "Zoom in",
            zoomOut: "Zoom out",
            approximate: "Approximate – OSRM",
            travelUnavailable: "Travel times unavailable.",
            travelUnavailableWithDirections: "Travel times unavailable. Use Directions for live navigation.",
            unavailable: "Unavailable"
        },
    },
    el: {
        appTitle: "Οδηγός Επισκεπτών",
        homeTitle: "Dolce Far Niente",
        homeSubtitle: "Ζήστε τη γλυκιά τέχνη της χαλάρωσης, σε ένα καταφύγιο που νιώθετε αμέσως σαν το σπίτι σας.",
        backHome: "← Πίσω στην αρχική",
        skipLink: "Μετάβαση στο περιεχόμενο",
        bookingDetails: "Στοιχεία Κράτησης",
        aboutUs: "Σχετικά με Εμάς",
        emptyState: "Δεν υπάρχουν στοιχεία ακόμη.",
        search: {
            addDates: "Επιλέξτε ημερομηνίες",
            arrivalLabel: "Άφιξη",
            departureLabel: "Αναχώρηση",
            arrivalPlaceholder: "Επιλογή άφιξης",
            departurePlaceholder: "Επιλογή αναχώρησης",
            checkAvailability: "Έλεγχος διαθεσιμότητας"
        },
        ui: {
            map: "Χάρτης",
            list: "Λίστα",
            resetAll: "Επαναφορά φίλτρων",
            back: "Πίσω",
            signIn: "Σύνδεση",
            signOut: "Αποσύνδεση",
            menu: "Άνοιγμα μενού",
            closeMenu: "Κλείσιμο μενού",
            guestGuide: "Η διαμονή σας, με μια ματιά",
            preferences: "Προτιμήσεις",
            lightMode: "Φωτεινό",
            darkMode: "Σκούρο",
            primaryNavigation: "Κύρια πλοήγηση",
            yourStay: "Η διαμονή σας",
            explore: "Ανακαλύψτε την Καλαμάτα",
            account: "Λογαριασμός επισκέπτη",
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
            syncIdle: "Ενημερωμένο",
            rating: "βαθμολογία {value}",
            addedFavorite: "Προστέθηκε στα αγαπημένα",
            removedFavorite: "Αφαιρέθηκε από τα αγαπημένα",
            addFavorite: "Προσθήκη στα αγαπημένα",
            removeFavorite: "Αφαίρεση από τα αγαπημένα",
            share: "Κοινοποίηση",
            contentUpdating: "Το περιεχόμενο ενημερώνεται – δοκιμάστε ξανά αργότερα."
        },
        a11y: {
            placeDetails: "Λεπτομέρειες τοποθεσίας",
            viewDetailsFor: "Δείτε λεπτομέρειες για {name}",
            openMapFor: "Άνοιγμα χάρτη για {name}",
            switchToLight: "Εναλλαγή σε φωτεινή λειτουργία",
            switchToDark: "Εναλλαγή σε σκοτεινή λειτουργία",
            toggleColorScheme: "Εναλλαγή χρωματικού θέματος",
            addNamedFavorite: "Προσθήκη {label} στα αγαπημένα",
            removeNamedFavorite: "Αφαίρεση {label} από τα αγαπημένα"
        },
        datePicker: {
            calendar: "Ημερολόγιο επιλογής ημερομηνιών",
            clearSelected: "Καθαρισμός επιλεγμένων ημερομηνιών",
            clearDates: "Καθαρισμός ημερομηνιών",
            prevMonth: "Προηγούμενος μήνας",
            nextMonth: "Επόμενος μήνας",
            selectDates: "Επιλέξτε ημερομηνίες άφιξης και αναχώρησης",
            applyDates: "Εφαρμογή ημερομηνιών",
            applyRange: "Εφαρμογή επιλεγμένου εύρους ημερομηνιών",
            rangePicker: "Επιλογέας εύρους ημερομηνιών"
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
        moments: {
            searchAndFilter: "Αναζήτηση και φιλτράρισμα στιγμών",
            searchMoments: "Αναζήτηση στιγμών",
            searchPlaceholder: "Αναζήτηση για μέρη, παραλίες, μουσεία...",
            noPlaces: "Δεν βρέθηκαν μέρη. Δοκιμάστε άλλη κατηγορία ή καθαρίστε την αναζήτηση.",
            clearSearch: "Καθαρισμός αναζήτησης",
            filterByCategory: "Φιλτράρισμα στιγμών ανά κατηγορία",
            mapCaption: "Τοποθεσία διαμερίσματος και κοντινά {category}. Κάντε ζουμ και πατήστε τους δείκτες για λεπτομέρειες.",
            subtitle: "Επιλεγμένες τοπικές προτάσεις για τη διαμονή σας"
        },
        errors: {
            title: "Παρουσιάστηκαν κάποια προβλήματα",
            tryAgain: "Δοκιμάστε ξανά",
            contactSupport: "Επικοινωνία με υποστήριξη",
            somethingWentWrong: "Κάτι πήγε στραβά",
            unexpectedError: "Παρουσιάστηκε ένα απροσδόκητο σφάλμα. Μπορείτε να δοκιμάσετε ξανά."
        },
        a2hs: {
            message: "Προσθήκη στην Αρχική Οθόνη: Κοινοποίηση → Προσθήκη στην Αρχική Οθόνη",
            close: "Κλείσιμο",
            region: "Συμβουλή προσθήκης στην αρχική οθόνη iOS"
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
            viewDetails: "Προβολή λεπτομερειών",
            deferredInteractiveLabel: "Ο διαδραστικός χάρτης θα φορτώσει εδώ για να διατηρηθεί η ταχύτητα.",
            travelPrompt: "Πατήστε έναν δείκτη για να υπολογίσουμε τον χρόνο διαδρομής.",
            openMap: "Άνοιγμα χάρτη",
            loadMap: "Φόρτωση χάρτη",
            address: "Διεύθυνση",
            phone: "Τηλέφωνο",
            directions: "Οδηγίες",
            website: "Ιστότοπος",
            locateMe: "Εντοπισμός θέσης",
            locationUnavailable: "Η τοποθεσία σας δεν είναι διαθέσιμη. Ελέγξτε την άδεια τοποθεσίας του browser και δοκιμάστε ξανά.",
            fitToMarkers: "Προβολή όλων των σημείων",
            zoomIn: "Μεγέθυνση",
            zoomOut: "Σμίκρυνση",
            approximate: "Κατά προσέγγιση – OSRM",
            travelUnavailable: "Οι χρόνοι διαδρομής δεν είναι διαθέσιμοι.",
            travelUnavailableWithDirections: "Οι χρόνοι διαδρομής δεν είναι διαθέσιμοι. Χρησιμοποιήστε τις Οδηγίες για ζωντανή πλοήγηση.",
            unavailable: "Μη διαθέσιμο"
        },
    },
};
