/**
 * House/Apartment translations.
 * Includes: apartment details, amenities, rules, room descriptions
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface HouseDictionary {
    navLabel: string;
    navSubtitle: string;
    title: string;
    location?: string;
    intro: string;
    guideTitle?: string;
    overview: string;
    amenities: string;
    rules: string;
    checkin: string;
    emergency: string;
    amenityList: string[];
    rulesList: string[];
    photoAlts?: { living: string; bedroom: string; kitchen: string; balcony?: string; bathroom?: string; };
    glanceTitle?: string;
    specs?: string[];
    ctaPrimary?: string;
    ctaSecondary?: string;
    rooms?: Partial<Record<'living_room' | 'kitchen' | 'bedroom' | 'balcony' | 'bathroom', { title?: string; description?: string }>>;
    photoViewer?: {
        instructions?: string;
        counter?: string;
        prev?: string;
        next?: string;
        close?: string;
    };
    // Index signature for extensibility (used by ApartmentCinematic)
    [k: string]: unknown;
}

export interface LocationPanelDictionary {
    title: string;
    apartmentTitle: string;
    city: string;
    blurb: string;
    nearby: string;
    locationDescription?: string;
    locationTitle?: string;
    highlights?: Array<{
        icon?: string;
        title: string;
        description: string;
    }>;
    locationTownTitle?: string;
    locationTownDescription?: string;
    locationBeachTitle?: string;
    locationBeachDescription?: string;
    locationTransportTitle?: string;
    locationTransportDescription?: string;
    howToEnableMapTitle: string;
    howToEnableSteps: string[];
}

// ============================================================================
// Translations
// ============================================================================

export const houseTranslations: Record<Locale, HouseDictionary> = {
    en: {
        navLabel: "Photo Gallery",
        navSubtitle: "Explore the apartment and its location",
        title: "Your 2-Bedroom Apartment with Mountain & Sea Views",
        location: "Kalamata, Greece",
        intro: "Welcome to your spacious apartment, featuring large sunny terraces and beautiful views in a quiet neighborhood near the Town Hall.",
        overview: "Overview",
        amenities: "Amenities",
        rules: "House Rules",
        checkin: "Check-in / Check-out",
        emergency: "Emergency & Support",
        glanceTitle: "At a Glance",
        specs: [
            "2 bedrooms",
            "1 bathroom",
            "2nd floor",
            "75 m²",
            "Mountain & sea views",
            "Free parking"
        ],
        ctaPrimary: "Book",
        ctaSecondary: "Contact Us",
        guideTitle: "Your Apartment Guide",
        amenityList: [
            "Free Wi-Fi",
            "Air conditioning",
            "Large sunny terraces",
            "Mountain & sea views",
            "Free private parking",
            "Baby equipment available",
            "Fully equipped kitchen",
            "Washing machine"
        ],
        rulesList: [
            "No smoking inside",
            "Quiet hours after 22:00",
            "Maximum 4 guests",
            "Check-in: 15:00-22:00",
            "Check-out: 11:00",
            "Families with children welcome"
        ],
        photoAlts: { living: 'Living area', bedroom: 'Bedroom', kitchen: 'Kitchen', balcony: 'Balcony', bathroom: 'Bathroom' },
        rooms: {
            living_room: {
                title: "Living Room",
                description: "An airy lounge with soft seating, daylight, and access to the balcony for relaxed gatherings."
            },
            kitchen: {
                title: "Kitchen",
                description: "Fully equipped with modern appliances and a breakfast nook for easy meals and morning coffee."
            },
            bedroom: {
                title: "Bedroom",
                description: "A calming retreat with plush bedding, blackout shades, and built-in storage for long stays."
            },
            balcony: {
                title: "Balcony",
                description: "Open-air terrace capturing both mountain and sea breezes, perfect for sunset unwinding."
            },
            bathroom: {
                title: "Bathroom",
                description: "Bright bathroom with rainfall shower, premium amenities, and ample counter space."
            }
        },
        photoViewer: {
            instructions: "Photo viewer controls: Use arrow keys to navigate between images, Home/End keys to jump to first/last image, Escape to close viewer.",
            counter: "Currently viewing image {current} of {total}.",
            prev: "Previous image",
            next: "Next image",
            close: "Close viewer"
        },
    },
    el: {
        navLabel: "Συλλογή Φωτογραφιών",
        navSubtitle: "Εξερευνήστε το διαμέρισμα και την τοποθεσία του",
        title: "Το 2-υπνοδωματίων διαμέρισμά σας με θέα σε βουνό & θάλασσα",
        location: "Καλαμάτα, Ελλάδα",
        intro: "Καλώς ήρθατε στο ευρύχωρο διαμέρισμά σας, με μεγάλες ηλιόλουστες βεράντες και όμορφη θέα σε μια ήσυχη γειτονιά κοντά στο Δημαρχείο.",
        overview: "Επισκόπηση",
        amenities: "Παροχές",
        rules: "Κανόνες Σπιτιού",
        checkin: "Άφιξη / Αναχώρηση",
        emergency: "Έκτακτη Ανάγκη & Υποστήριξη",
        glanceTitle: "Με μια Ματιά",
        specs: [
            "2 υπνοδωμάτια",
            "1 μπάνιο",
            "2ος όροφος",
            "75 τ.μ.",
            "Θέα βουνό & θάλασσα",
            "Δωρεάν πάρκινγκ"
        ],
        ctaPrimary: "Κράτηση",
        ctaSecondary: "Επικοινωνία",
        guideTitle: "Ο Οδηγός του Διαμερίσματός σας",
        amenityList: [
            "Δωρεάν Wi-Fi",
            "Κλιματισμός",
            "Μεγάλες ηλιόλουστες βεράντες",
            "Θέα βουνού και θάλασσας",
            "Δωρεάν ιδιωτικό πάρκινγκ",
            "Εξοπλισμός μωρού διαθέσιμος",
            "Πλήρως εξοπλισμένη κουζίνα",
            "Πλυντήριο ρούχων"
        ],
        rulesList: [
            "Απαγορεύεται το κάπνισμα μέσα",
            "Ήσυχες ώρες μετά τις 22:00",
            "Μέγιστο 4 άτομα",
            "Άφιξη: 15:00-22:00",
            "Αναχώρηση: 11:00",
            "Οικογένειες με παιδιά καλοδεχούμενες"
        ],
        photoAlts: { living: 'Καθιστικό', bedroom: 'Υπνοδωμάτιο', kitchen: 'Κουζίνα', balcony: 'Μπαλκόνι', bathroom: 'Μπάνιο' },
        rooms: {
            living_room: {
                title: "Καθιστικό",
                description: "Φωτεινό καθιστικό με άνετο καναπέ, ημέρας φως και πρόσβαση στο μπαλκόνι για στιγμές χαλάρωσης."
            },
            kitchen: {
                title: "Κουζίνα",
                description: "Πλήρως εξοπλισμένη με σύγχρονες ηλεκτρικές συσκευές και χώρο πρωινού για εύκολα γεύματα."
            },
            bedroom: {
                title: "Υπνοδωμάτιο",
                description: "Ήρεμο δωμάτιο με αναπαυτικό στρώμα, συσκότιση και ευρύχωρες ντουλάπες για μεγαλύτερες διαμονές."
            },
            balcony: {
                title: "Μπαλκόνι",
                description: "Ανοιχτός χώρος με δροσερό αεράκι βουνού και θάλασσας, ιδανικός για χαλάρωση στο ηλιοβασίλεμα."
            },
            bathroom: {
                title: "Μπάνιο",
                description: "Φωτεινό μπάνιο με ντους βροχής, ποιοτικά προϊόντα και άνετο πάγκο."
            }
        },
        photoViewer: {
            instructions: "Χειρισμός προβολής: Χρησιμοποιήστε τα βελάκια για εναλλαγή εικόνων, τα πλήκτρα Home/End για μετάβαση στην πρώτη/τελευταία εικόνα, και το πλήκτρο Escape για κλείσιμο.",
            counter: "Προβάλλεται η εικόνα {current} από {total}.",
            prev: "Προηγούμενη εικόνα",
            next: "Επόμενη εικόνα",
            close: "Κλείσιμο προβολής"
        },
    },
};

export const locationPanelTranslations: Record<Locale, LocationPanelDictionary> = {
    en: {
        title: "Explore the Neighborhood",
        apartmentTitle: "2-Bedroom Apartment with Views",
        city: "Kalamata, Greece",
        blurb: "A quiet neighborhood just 50m from the Town Hall, with stunning mountain and sea views.",
        nearby: "What's Nearby?",
        locationDescription: "Discover your apartment's prime location in Kalamata and explore Kalamata Moments, services, and sights within minutes.",
        locationTitle: "Explore the Neighborhood",
        highlights: [
            { icon: "🏛️", title: "Town Hall", description: "50 m (1' walk)" },
            { icon: "🏺", title: "Archaeological Museum", description: "2 km (15' walk)" },
            { icon: "✈️", title: "Kalamata Airport", description: "6 km (15' drive)" },
            { icon: "🏙️", title: "City Center", description: "1.5 km (14' walk / 4' drive)" },
            { icon: "🏖️", title: "Beach Access", description: "1 km (5' drive to the coast)" },
            { icon: "🚗", title: "Bus Stop", description: "100 m (3' walk)" },
        ],
        howToEnableMapTitle: "How to use the interactive map:",
        howToEnableSteps: [
            "Make sure JavaScript is enabled in your browser",
            "Pan or zoom the map to explore the neighborhood",
            "Tap a marker to open details and travel times"
        ]
    },
    el: {
        title: "Τοποθεσία & Κοντινά",
        apartmentTitle: "Διαμέρισμα 2 Υπνοδωματίων με Θέα",
        city: "Καλαμάτα, Ελλάδα",
        blurb: "Μια ήσυχη γειτονιά μόλις 50μ από το Δημαρχείο, με εκπληκτική θέα σε βουνό και θάλασσα.",
        nearby: "Τι υπάρχει κοντά;",
        locationDescription: "Ανακαλύψτε την εξαιρετική τοποθεσία του διαμερίσματός σας στην Καλαμάτα και εξερευνήστε τις Στιγμές Καλαμάτας, υπηρεσίες και αξιοθέατα μέσα σε λίγα λεπτά.",
        locationTitle: "Εξερευνήστε τη Γειτονιά",
        highlights: [
            { icon: "🏛️", title: "Δημαρχείο", description: "50 μ (1' με τα πόδια)" },
            { icon: "🏺", title: "Μπενάκειο Αρχαιολογικό Μουσείο", description: "2 χλμ (15' με τα πόδια)" },
            { icon: "✈️", title: "Αεροδρόμιο Καλαμάτας", description: "6 χλμ (15' οδήγηση)" },
            { icon: "🏙️", title: "Κέντρο Πόλης", description: "1,5 χλμ (14' περπάτημα / 4' οδήγηση)" },
            { icon: "🏖️", title: "Πρόσβαση στην Παραλία", description: "1 χλμ (5' με αυτοκίνητο)" },
            { icon: "🚗", title: "Στάση Λεωφορείου", description: "100 μ (3' με τα πόδια)" },
        ],
        howToEnableMapTitle: "Πώς να χρησιμοποιήσετε τον διαδραστικό χάρτη:",
        howToEnableSteps: [
            "Βεβαιωθείτε ότι η JavaScript είναι ενεργοποιημένη στο πρόγραμμα περιήγησης",
            "Μετακινήστε ή μεγεθύνετε τον χάρτη για να εξερευνήσετε τη γειτονιά",
            "Πατήστε έναν δείκτη για να δείτε λεπτομέρειες και χρόνους διαδρομής"
        ]
    },
};
