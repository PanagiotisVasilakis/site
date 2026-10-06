/**
 * House/Apartment translations.
 * The apartment page (identity §9.2) and its photo viewer; the copy is the owner-approved R3-C1 text.
 * Claims come from src/data/apartmentData.ts, the photos and the owner's facts (views of the mountain and the sea, O45).
 */

import type { Locale } from '../config';
import type { ApartmentPhotoId } from '@/data/apartmentPhotos';
import type { IconName } from '@/components/icons/iconNames';

// ============================================================================
// Types
// ============================================================================

export interface HouseDictionary {
    /** The page H1 and the metadata title. */
    title: string;
    eyebrow: string;
    /** The page lead and the metadata description. */
    intro: string;
    guideTitle: string;
    roomsNavLabel: string;
    amenities: { eyebrow: string; title: string };
    cta: { eyebrow: string; title: string; lead: string; seeDates: string; contact: string };
    /** GalleryLightbox; `{current}` and `{total}` are replaced in `counter`. */
    viewer: { dialog: string; close: string; previous: string; next: string; counter: string };
    /** Descriptive alt text per marketing photo (identity §7.1). */
    photoAlts: Record<ApartmentPhotoId, string>;
}

export interface LocationPanelDictionary {
    apartmentTitle: string;
    city: string;
    blurb: string;
    nearby: string;
    locationDescription: string;
    locationTitle: string;
    highlights: Array<{
        icon: IconName;
        title: string;
        description: string;
    }>;
    howToEnableMapTitle: string;
    howToEnableSteps: string[];
}

// ============================================================================
// Translations
// ============================================================================

export const houseTranslations: Record<Locale, HouseDictionary> = {
    en: {
        title: "The apartment",
        eyebrow: "2nd floor · Kalamata",
        intro: "Two bedrooms, a bright open-plan living room and a sunny balcony, 50 m from Kalamata Town Hall. Taygetos at breakfast, the gulf a short drive away.",
        guideTitle: "Your apartment guide",
        roomsNavLabel: "Rooms",
        amenities: { eyebrow: "Amenities", title: "What you will find" },
        cta: {
            eyebrow: "Availability",
            title: "See when it is free",
            lead: "Free nights and their prices are on the availability calendar.",
            seeDates: "See free dates",
            contact: "Questions? Contact us",
        },
        viewer: {
            dialog: "Photo viewer",
            close: "Close photo viewer",
            previous: "Previous photo",
            next: "Next photo",
            counter: "{current} / {total}",
        },
        photoAlts: {
            living_8: "Open-plan living room with a corner sofa, the dining table and the kitchen behind",
            living_6: "Corner sofa and coffee table, with the kitchen across the room",
            living_2: "Dining table with dark wooden chairs, the fireplace behind",
            living_7: "Sofa facing the corner fireplace, with tall curtained windows",
            living_1: "Entrance hall with a shoe cabinet and the front door open",
            living_4: "Metal leaf artwork on a white wall",
            living_5: "Two small elephant figures on a white shelf",
            kitchen_2: "Wooden kitchen with an oven, an extractor hood and the fridge",
            kitchen_6: "Breakfast bar with stools next to the dishwasher",
            kitchen_3: "Counter with a coffee maker, a French press and a dish rack",
            kitchen_4: "Sink, kettle and cabinets along the kitchen wall",
            kitchen_5: "Stainless-steel fridge, microwave and oven",
            kitchen_1: "Fruit bowl on the breakfast bar",
            bedroom_1: "Double bed against a terracotta wall",
            bedroom_2: "Double bed with folded towels and a mirrored wardrobe",
            bedroom_3: "Bedroom with a storage bench and a small table with a mirror",
            bedroom_2_5: "Second bedroom with a light green wardrobe and towels folded on the bed",
            bedroom_2_6: "Pillows and a bedside table with a silver heart",
            bedroom_2_3: "Bed with a white bedside table",
            bedroom_2_1: "Towels folded into elephants on the bed",
            bathroom_6: "Washbasin with towels on hooks and a mirror",
            bathroom_7: "Vanity unit, towel radiator and hair dryer",
            bathroom_3: "Washing machine under a wall cabinet",
            bathroom_4: "Shell decoration and a storage basket",
            balcony_1: "Balcony table for four among plants, with the rooftops and Taygetos beyond",
        },
    },
    el: {
        title: "Το διαμέρισμα",
        eyebrow: "2ος όροφος · Καλαμάτα",
        intro: "Δύο υπνοδωμάτια, ένα φωτεινό ενιαίο καθιστικό και ένα ηλιόλουστο μπαλκόνι, 50 μ. από το Δημαρχείο της Καλαμάτας. Ο Ταΰγετος στο πρωινό σας, ο κόλπος λίγα λεπτά με το αυτοκίνητο.",
        guideTitle: "Ο οδηγός του διαμερίσματός σας",
        roomsNavLabel: "Δωμάτια",
        amenities: { eyebrow: "Παροχές", title: "Τι θα βρείτε" },
        cta: {
            eyebrow: "Διαθεσιμότητα",
            title: "Δείτε πότε είναι ελεύθερο",
            lead: "Οι ελεύθερες νύχτες και οι τιμές τους βρίσκονται στο ημερολόγιο διαθεσιμότητας.",
            seeDates: "Δείτε ελεύθερες ημερομηνίες",
            contact: "Ερωτήσεις; Επικοινωνήστε μαζί μας",
        },
        viewer: {
            dialog: "Προβολή φωτογραφιών",
            close: "Κλείσιμο προβολής",
            previous: "Προηγούμενη φωτογραφία",
            next: "Επόμενη φωτογραφία",
            counter: "{current} / {total}",
        },
        photoAlts: {
            living_8: "Ενιαίο καθιστικό με γωνιακό καναπέ, την τραπεζαρία και την κουζίνα στο βάθος",
            living_6: "Γωνιακός καναπές και τραπεζάκι σαλονιού, με την κουζίνα απέναντι",
            living_2: "Τραπεζαρία με σκούρες ξύλινες καρέκλες και το τζάκι πίσω της",
            living_7: "Καναπές απέναντι στο γωνιακό τζάκι, με ψηλά παράθυρα και κουρτίνες",
            living_1: "Η είσοδος με παπουτσοθήκη και την εξώπορτα ανοιχτή",
            living_4: "Μεταλλικό διακοσμητικό με φύλλα σε λευκό τοίχο",
            living_5: "Δύο μικρά διακοσμητικά ελεφαντάκια σε λευκό ράφι",
            kitchen_2: "Ξύλινη κουζίνα με φούρνο, απορροφητήρα και ψυγείο",
            kitchen_6: "Πάγκος πρωινού με σκαμπό, δίπλα στο πλυντήριο πιάτων",
            kitchen_3: "Πάγκος με καφετιέρα, γαλλική πρέσα και πιατοθήκη",
            kitchen_4: "Νεροχύτης, βραστήρας και ντουλάπια στον τοίχο της κουζίνας",
            kitchen_5: "Ανοξείδωτο ψυγείο, φούρνος μικροκυμάτων και φούρνος",
            kitchen_1: "Φρουτιέρα στον πάγκο πρωινού",
            bedroom_1: "Διπλό κρεβάτι μπροστά σε τοίχο σε χρώμα τερακότας",
            bedroom_2: "Διπλό κρεβάτι με διπλωμένες πετσέτες και ντουλάπα με καθρέφτη",
            bedroom_3: "Υπνοδωμάτιο με μπαούλο και μικρό τραπέζι με καθρέφτη",
            bedroom_2_5: "Δεύτερο υπνοδωμάτιο με ανοιχτοπράσινη ντουλάπα και πετσέτες διπλωμένες στο κρεβάτι",
            bedroom_2_6: "Μαξιλάρια και κομοδίνο με μια ασημένια καρδιά",
            bedroom_2_3: "Κρεβάτι με λευκό κομοδίνο",
            bedroom_2_1: "Πετσέτες διπλωμένες σε σχήμα ελέφαντα πάνω στο κρεβάτι",
            bathroom_6: "Νιπτήρας με πετσέτες σε κρεμάστρες και καθρέφτη",
            bathroom_7: "Έπιπλο νιπτήρα, θερμαινόμενη πετσετοκρεμάστρα και σεσουάρ",
            bathroom_3: "Πλυντήριο ρούχων κάτω από ντουλάπι",
            bathroom_4: "Διακοσμητικά κοχύλια και καλάθι αποθήκευσης",
            balcony_1: "Τραπέζι για τέσσερις ανάμεσα σε φυτά στο μπαλκόνι, με τις στέγες και τον Ταΰγετο πίσω",
        },
    },
};

export const locationPanelTranslations: Record<Locale, LocationPanelDictionary> = {
    en: {
        apartmentTitle: "Two-bedroom apartment with views",
        city: "Kalamata, Greece",
        blurb: "A quiet street 50 m from the Town Hall, with views of the mountain and the sea.",
        nearby: "What's nearby?",
        locationDescription: "Museums, services and places near the apartment, in the Kalamata guide.",
        locationTitle: "Explore the neighbourhood",
        highlights: [
            { icon: "museum", title: "Town Hall", description: "50 m · 1 min walk" },
            { icon: "museum", title: "Public Library–Art Gallery", description: "about 15 min walk · 5 min by car" },
            { icon: "museum", title: "Archaeological Museum of Messenia (Benakeion)", description: "about 15 min walk · 5 min by car" },
            { icon: "plane", title: "Kalamata Airport", description: "6 km · 15 min by car" },
            { icon: "map-pin", title: "City centre", description: "1.5 km · about 15 min walk, 4 min by car" },
            { icon: "beach", title: "Nearest beach", description: "5 min by car" },
            { icon: "bus", title: "Bus stop", description: "100 m · 3 min walk" },
        ],
        howToEnableMapTitle: "How to use the interactive map:",
        howToEnableSteps: [
            "Make sure JavaScript is enabled in your browser",
            "Pan or zoom the map to explore the neighborhood",
            "Tap a marker to open details"
        ]
    },
    el: {
        apartmentTitle: "Διαμέρισμα δύο υπνοδωματίων με θέα",
        city: "Καλαμάτα, Ελλάδα",
        blurb: "Ήσυχος δρόμος 50 μ. από το Δημαρχείο, με θέα σε βουνό και θάλασσα.",
        nearby: "Τι υπάρχει κοντά;",
        locationDescription: "Μουσεία, υπηρεσίες και μέρη κοντά στο διαμέρισμα, στον οδηγό Καλαμάτας.",
        locationTitle: "Εξερευνήστε τη γειτονιά",
        highlights: [
            { icon: "museum", title: "Δημαρχείο", description: "50 μ. · 1 λεπτό με τα πόδια" },
            { icon: "museum", title: "Δημόσια Βιβλιοθήκη–Πινακοθήκη", description: "περίπου 15 λεπτά με τα πόδια · 5 λεπτά με το αυτοκίνητο" },
            { icon: "museum", title: "Μπενάκειο Αρχαιολογικό Μουσείο Μεσσηνίας", description: "περίπου 15 λεπτά με τα πόδια · 5 λεπτά με το αυτοκίνητο" },
            { icon: "plane", title: "Αεροδρόμιο Καλαμάτας", description: "6 χλμ. · 15 λεπτά με το αυτοκίνητο" },
            { icon: "map-pin", title: "Κέντρο πόλης", description: "1,5 χλμ. · περίπου 15 λεπτά με τα πόδια, 4 λεπτά με το αυτοκίνητο" },
            { icon: "beach", title: "Κοντινότερη παραλία", description: "5 λεπτά με το αυτοκίνητο" },
            { icon: "bus", title: "Στάση λεωφορείου", description: "100 μ. · 3 λεπτά με τα πόδια" },
        ],
        howToEnableMapTitle: "Πώς να χρησιμοποιήσετε τον διαδραστικό χάρτη:",
        howToEnableSteps: [
            "Βεβαιωθείτε ότι η JavaScript είναι ενεργοποιημένη στο πρόγραμμα περιήγησης",
            "Μετακινήστε ή μεγεθύνετε τον χάρτη για να εξερευνήσετε τη γειτονιά",
            "Πατήστε έναν δείκτη για να δείτε λεπτομέρειες"
        ]
    },
};
