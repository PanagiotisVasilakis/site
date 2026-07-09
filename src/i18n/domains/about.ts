/**
 * About page translations.
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface AboutDictionary {
    introPre: string;
    introPost: string;
    storyTitle: string;
    story: string;
    commitmentTitle: string;
    commitment: string;
    whyTitle: string;
    whyLocationTitle: string;
    whyLocationDesc: string;
    whyAmenitiesTitle: string;
    whyAmenitiesDesc: string;
    whyServiceTitle: string;
    whyServiceDesc: string;
    experienceTitle: string;
    experienceIntro: string;
    experienceItems: string[];
    metaDescription: string;
}

// ============================================================================
// Translations
// ============================================================================

export const aboutTranslations: Record<Locale, AboutDictionary> = {
    en: {
        introPre: "Welcome to ",
        introPost: " — where luxury meets the art of doing nothing. Our carefully curated apartment offers the perfect blend of modern comfort and traditional Greek hospitality.",
        storyTitle: "Our Story",
        story: "Nestled in the heart of Kalamata, our apartment represents the essence of Mediterranean living. Every detail has been thoughtfully designed to provide an unforgettable experience for our guests.",
        commitmentTitle: "Our Commitment",
        commitment: "We are dedicated to providing exceptional hospitality with attention to every detail. From the moment you arrive until your departure, we ensure your stay is comfortable and memorable.",
        whyTitle: "Why Choose Us",
        whyLocationTitle: "Prime Location",
        whyLocationDesc: "Steps from the beach and town center",
        whyAmenitiesTitle: "Luxury Amenities",
        whyAmenitiesDesc: "Modern comforts with Greek charm",
        whyServiceTitle: "Personal Service",
        whyServiceDesc: "Dedicated support throughout your stay",
        experienceTitle: "Experience Kalamata",
        experienceIntro: "Our apartment serves as your gateway to discovering the authentic beauty of Kalamata and the Peloponnese region.",
        experienceItems: [
            "🏛️ Historic sites and museums",
            "🍽️ Local cuisine and tavernas",
            "🏖️ Beautiful beaches and coastline",
            "🍇 Wine tasting in nearby vineyards"
        ],
        metaDescription: "Learn about our story, commitment to luxury hospitality, and why guests choose our apartment in Kalamata, Greece."
    },
    el: {
        introPre: "Καλώς ήρθατε στο ",
        introPost: " — όπου η πολυτέλεια συναντά την τέχνη του «να μην κάνεις τίποτα». Το φροντισμένο διαμέρισμά μας προσφέρει τον ιδανικό συνδυασμό σύγχρονης άνεσης και παραδοσιακής ελληνικής φιλοξενίας.",
        storyTitle: "Η Ιστορία μας",
        story: "Στην καρδιά της Καλαμάτας, το διαμέρισμά μας αποτελεί την ουσία της μεσογειακής ζωής. Κάθε λεπτομέρεια έχει σχεδιαστεί με φροντίδα ώστε να προσφέρει μια αξέχαστη εμπειρία στους επισκέπτες μας.",
        commitmentTitle: "Η Δέσμευσή μας",
        commitment: "Είμαστε αφοσιωμένοι στο να προσφέρουμε εξαιρετική φιλοξενία με προσοχή σε κάθε λεπτομέρεια. Από τη στιγμή που φτάνετε μέχρι την αναχώρησή σας, φροντίζουμε η διαμονή σας να είναι άνετη και αξέχαστη.",
        whyTitle: "Γιατί να μας Επιλέξετε",
        whyLocationTitle: "Προνομιακή Τοποθεσία",
        whyLocationDesc: "Λίγα βήματα από την παραλία και το κέντρο της πόλης",
        whyAmenitiesTitle: "Πολυτελείς Ανέσεις",
        whyAmenitiesDesc: "Σύγχρονες ανέσεις με ελληνική γοητεία",
        whyServiceTitle: "Προσωπική Εξυπηρέτηση",
        whyServiceDesc: "Αφοσιωμένη υποστήριξη σε όλη τη διαμονή σας",
        experienceTitle: "Ζήστε την Καλαμάτα",
        experienceIntro: "Το διαμέρισμά μας αποτελεί την πύλη σας για να ανακαλύψετε την αυθεντική ομορφιά της Καλαμάτας και της Πελοποννήσου.",
        experienceItems: [
            "🏛️ Ιστορικά αξιοθέατα και μουσεία",
            "🍽️ Τοπική κουζίνα και ταβέρνες",
            "🏖️ Πανέμορφες παραλίες και ακτογραμμή",
            "🍇 Οινογνωσία σε κοντινούς αμπελώνες"
        ],
        metaDescription: "Μάθετε για την ιστορία μας, τη δέσμευσή μας στην πολυτελή φιλοξενία και γιατί οι επισκέπτες επιλέγουν το διαμέρισμά μας στην Καλαμάτα."
    },
};
