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
        checkAvailability?: string;
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
        mainMenu?: string;
        primaryPages?: string;
        closeFilters?: string;
        done?: string;
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
        featured?: string;
        loadingMore?: string;
        contentUpdating?: string;
    };
    a11y?: {
        placeDetails?: string;
        viewDetailsFor?: string;
        openMapFor?: string;
        apartmentHero?: string;
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
        bookingSummary?: string;
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
        mapCaptionShort?: string;
        removeTag?: string;
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
        apartmentMarkerDesc: string;
        viewDetails: string;
        failed: string;
        tokenMissing: string;
        deferredInteractiveLabel: string;
        travelPrompt: string;
        openMap?: string;
        loadMap: string;
        address: string;
        phone: string;
        directions: string;
        website: string;
        locateMe: string;
        fitToMarkers: string;
        zoomIn: string;
        zoomOut: string;
        approximate: string;
        travelUnavailable: string;
        travelUnavailableWithDirections: string;
        clearRoute: string;
        route: string;
        driving: string;
        walking: string;
        cycling: string;
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
            departurePlaceholder: "Select departure",
            checkAvailability: "Check availability"
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
            mainMenu: "Main menu",
            primaryPages: "Primary pages",
            closeFilters: "Close filters",
            done: "Done"
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
            featured: "Featured",
            loadingMore: "Loading more…",
            contentUpdating: "Content updating – please check again later."
        },
        a11y: {
            placeDetails: "Place details",
            viewDetailsFor: "View details for {name}",
            openMapFor: "Open map for {name}",
            apartmentHero: "Apartment hero",
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
            bookingSummary: "Booking summary",
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
            mapCaptionShort: "🏡 Apartment location and nearby {category} • Zoom and click markers for details",
            removeTag: "Remove {tag}",
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
            apartmentMarkerDesc: "You are here",
            viewDetails: "View details",
            failed: "Map failed to load",
            tokenMissing: "Interactive map temporarily unavailable",
            deferredInteractiveLabel: "The interactive map will load here to keep things speedy.",
            travelPrompt: "Tap a marker to calculate travel time.",
            openMap: "Open map",
            loadMap: "Load map",
            address: "Address",
            phone: "Phone",
            directions: "Directions",
            website: "Website",
            locateMe: "Locate me",
            fitToMarkers: "Fit to markers",
            zoomIn: "Zoom in",
            zoomOut: "Zoom out",
            approximate: "Approximate – OSRM",
            travelUnavailable: "Travel times unavailable.",
            travelUnavailableWithDirections: "Travel times unavailable. Use Directions for live navigation.",
            clearRoute: "Clear route",
            route: "Route",
            driving: "Driving",
            walking: "Walking",
            cycling: "Cycling",
            unavailable: "Unavailable"
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
            departurePlaceholder: "Επιλογή αναχώρησης",
            checkAvailability: "Έλεγχος διαθεσιμότητας"
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
            mainMenu: "Κύριο μενού",
            primaryPages: "Κύριες σελίδες",
            closeFilters: "Κλείσιμο φίλτρων",
            done: "Τέλος"
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
            featured: "Προτεινόμενα",
            loadingMore: "Φόρτωση περισσότερων…",
            contentUpdating: "Το περιεχόμενο ενημερώνεται – δοκιμάστε ξανά αργότερα."
        },
        a11y: {
            placeDetails: "Λεπτομέρειες τοποθεσίας",
            viewDetailsFor: "Δείτε λεπτομέρειες για {name}",
            openMapFor: "Άνοιγμα χάρτη για {name}",
            apartmentHero: "Εικόνα διαμερίσματος",
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
            bookingSummary: "Σύνοψη κράτησης",
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
            mapCaptionShort: "🏡 Τοποθεσία διαμερίσματος και κοντινά {category} • Κάντε ζουμ και πατήστε τους δείκτες για λεπτομέρειες",
            removeTag: "Αφαίρεση {tag}",
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
            apartmentMarkerDesc: "Βρίσκεστε εδώ",
            viewDetails: "Προβολή λεπτομερειών",
            failed: "Αποτυχία φόρτωσης χάρτη",
            tokenMissing: "Ο διαδραστικός χάρτης είναι προσωρινά μη διαθέσιμος",
            deferredInteractiveLabel: "Ο διαδραστικός χάρτης θα φορτώσει εδώ για να διατηρηθεί η ταχύτητα.",
            travelPrompt: "Πατήστε έναν δείκτη για να υπολογίσουμε τον χρόνο διαδρομής.",
            openMap: "Άνοιγμα χάρτη",
            loadMap: "Φόρτωση χάρτη",
            address: "Διεύθυνση",
            phone: "Τηλέφωνο",
            directions: "Οδηγίες",
            website: "Ιστότοπος",
            locateMe: "Εντοπισμός θέσης",
            fitToMarkers: "Προβολή όλων των σημείων",
            zoomIn: "Μεγέθυνση",
            zoomOut: "Σμίκρυνση",
            approximate: "Κατά προσέγγιση – OSRM",
            travelUnavailable: "Οι χρόνοι διαδρομής δεν είναι διαθέσιμοι.",
            travelUnavailableWithDirections: "Οι χρόνοι διαδρομής δεν είναι διαθέσιμοι. Χρησιμοποιήστε τις Οδηγίες για ζωντανή πλοήγηση.",
            clearRoute: "Εκκαθάριση διαδρομής",
            route: "Διαδρομή",
            driving: "Οδήγηση",
            walking: "Πεζή",
            cycling: "Ποδήλατο",
            unavailable: "Μη διαθέσιμο"
        },
    },
};
