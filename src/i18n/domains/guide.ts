/**
 * Kalamata guide translations (identity §9.5 list, detail, favourites; §9.6 important phones).
 * The copy is the owner-approved R3-C1 text; `// C2 review` marks R3-C2 copy awaiting owner approval.
 */

import type { Locale } from '../config';

export interface GuideDictionary {
    title: string;
    lead: string;
    searchLabel: string;
    searchPlaceholder: string;
    filtersLabel: string;
    viewLabel: string;
    resultsOne: string;
    resultsOther: string;
    noResultsTitle: string;
    noResultsText: string;
    clearFilters: string;
    saved: string;
    savedCount: string;
    save: string;
    saveNamed: string;
    opensMaps: string;
    opensWebsite: string;
    distance: string;
    mapListLabel: string;
    mapNote: string;
    mapUnplacedLabel: string;
    moreNearby: string;
    favouritesTitle: string;
    favouritesLead: string;
    favouritesEmptyTitle: string;
    favouritesEmptyText: string;
    browseGuide: string;
    phonesTitle: string;
    phonesLead: string;
    emergencyTitle: string;
    call112: string;
    callNamed: string;
    phoneGroups: {
        emergency: string;
        health: string;
        transport: string;
        other: string;
    };
}

export const guideTranslations: Record<Locale, GuideDictionary> = {
    en: {
        title: "Kalamata guide",
        lead: "Museums, beaches, local food, historic sites and day trips, closest first.",
        searchLabel: "Search the guide",
        searchPlaceholder: "Search places",
        filtersLabel: "Filter by category",
        viewLabel: "View",
        resultsOne: "1 place",
        resultsOther: "{count} places",
        noResultsTitle: "No places match",
        noResultsText: "Try another category or clear your search.",
        clearFilters: "Clear filters",
        saved: "Saved",
        savedCount: "Saved places: {count}",
        save: "Save",
        saveNamed: "Save {name}",
        opensMaps: "(opens Google Maps)",
        opensWebsite: "(opens in a new tab)",
        distance: "{distance} from the apartment, in a straight line",
        mapListLabel: "Places on the map",
        mapNote: "The numbers on the map match this list. Distances are in a straight line.",
        mapUnplacedLabel: "Not on the map", // C2 review
        moreNearby: "More nearby",
        favouritesTitle: "Saved places",
        favouritesLead: "Places you saved on this device.",
        favouritesEmptyTitle: "No favourites yet.",
        favouritesEmptyText: "Tap the heart on any place.",
        browseGuide: "Browse the guide",
        phonesTitle: "Important phones",
        phonesLead: "Emergency and local services in Kalamata.",
        emergencyTitle: "112, free from any phone, EU-wide",
        call112: "Call 112",
        callNamed: "Call {name}",
        phoneGroups: {
            emergency: "Emergency services",
            health: "Health",
            transport: "Getting around",
            other: "Other services",
        },
    },
    el: {
        title: "Οδηγός Καλαμάτας",
        lead: "Μουσεία, παραλίες, τοπικές γεύσεις, ιστορικά μέρη και εκδρομές, πρώτα τα πιο κοντινά.",
        searchLabel: "Αναζήτηση στον οδηγό",
        searchPlaceholder: "Αναζήτηση μερών",
        filtersLabel: "Φιλτράρισμα ανά κατηγορία",
        viewLabel: "Προβολή",
        resultsOne: "1 μέρος",
        resultsOther: "{count} μέρη",
        noResultsTitle: "Κανένα μέρος δεν ταιριάζει",
        noResultsText: "Δοκιμάστε άλλη κατηγορία ή καθαρίστε την αναζήτηση.",
        clearFilters: "Καθαρισμός φίλτρων",
        saved: "Αποθηκευμένα",
        savedCount: "Αποθηκευμένα μέρη: {count}",
        save: "Αποθήκευση",
        saveNamed: "Αποθήκευση: {name}",
        opensMaps: "(ανοίγει τους Χάρτες Google)",
        opensWebsite: "(ανοίγει σε νέα καρτέλα)",
        distance: "{distance} από το διαμέρισμα, σε ευθεία γραμμή",
        mapListLabel: "Μέρη στον χάρτη",
        mapNote: "Οι αριθμοί στον χάρτη αντιστοιχούν σε αυτή τη λίστα. Οι αποστάσεις είναι σε ευθεία γραμμή.",
        mapUnplacedLabel: "Χωρίς σημείο στον χάρτη", // C2 review
        moreNearby: "Επίσης κοντά",
        favouritesTitle: "Αποθηκευμένα μέρη",
        favouritesLead: "Τα μέρη που αποθηκεύσατε σε αυτή τη συσκευή.",
        favouritesEmptyTitle: "Δεν έχετε αγαπημένα ακόμη.",
        favouritesEmptyText: "Πατήστε την καρδιά σε οποιοδήποτε μέρος.",
        browseGuide: "Δείτε τον οδηγό",
        phonesTitle: "Χρήσιμα τηλέφωνα",
        phonesLead: "Αριθμοί έκτακτης ανάγκης και τοπικές υπηρεσίες στην Καλαμάτα.",
        emergencyTitle: "112, δωρεάν από κάθε τηλέφωνο, σε όλη την ΕΕ",
        call112: "Κλήση 112",
        callNamed: "Κλήση: {name}",
        phoneGroups: {
            emergency: "Υπηρεσίες έκτακτης ανάγκης",
            health: "Υγεία",
            transport: "Μετακινήσεις",
            other: "Άλλες υπηρεσίες",
        },
    },
};
