/**
 * Home page translations (identity §9.1); the copy is the owner-approved R3-C1 text.
 * The hero H1 "Dolce far niente" is the Italian brand in both locales, so it is not translated.
 * Every claim comes from the existing house data (src/data/apartmentData.ts, the house and check-in
 * dictionaries), the photos or the owner's facts (views of the mountain and the sea, O45; distances, R3-C1).
 */

import type { Locale } from '../config';
import type { IconName } from '@/components/icons/iconNames';

export type HomeRoomKey = 'living' | 'kitchen' | 'bedroom1' | 'bedroom2' | 'bathroom' | 'balcony';

type HighlightCard = { icon: IconName; title: string; text: string };

export interface HomeDictionary {
    heroAlt: string;
    heroTagline: string;
    heroFacts: string;
    /** `{price}` is the formatted lowest nightly price. */
    heroPriceFrom: string;
    heroPriceNone: string;
    heroScroll: string;
    /** FactStrip: six facts, never a price (identity §8). `sign` draws the value as a road sign. */
    facts: {
        label: string;
        items: Array<{ value: string; unit?: string; label: string; sign?: boolean }>;
        seeDates: string;
    };
    intro: { eyebrow: string; title: string; titleEm: string; lead: string };
    /** SeasonSwitch: the climate-fee seasons of src/data/stayPolicy.ts. */
    seasons: {
        label: string;
        summer: { label: string; link: string; cards: HighlightCard[] };
        winter: { label: string; link: string; cards: HighlightCard[] };
    };
    balcony: { eyebrow: string; title: string; alt: string; quote: string };
    rooms: {
        eyebrow: string;
        title: string;
        chipsLabel: string;
        trackLabel: string;
        allPhotos: string;
        items: Record<HomeRoomKey, { name: string; line: string }>;
    };
    /** NightsTeaser (§8): the next 14 nights. `{date}` and `{count}` are replaced. */
    nights: {
        eyebrow: string;
        title: string;
        listLabel: string;
        lowestFrom: string;
        legendBest: string;
        cta: string;
        /** The stale note, chosen with Intl.PluralRules on the hours since the last sync. */
        staleUpdated: { one: string; other: string };
    };
    /** Location band (§8 LocationRelief + DistanceList). The list is the source of truth; the map is illustrative. */
    location: {
        eyebrow: string;
        title: string;
        titleEm: string;
        lead: string;
        distancesLabel: string;
        /** `pin`: a shorter label for the relief map pin when `name` is too long for it. */
        distances: Array<{ key: HomeDistanceKey; name: string; pin?: string; value: string; how: string }>;
        mapAlt: string;
        mapNote: string;
        homePin: string;
        gulf: string;
        taygetos: string;
    };
    /** HostLetter (§8). The paragraphs are the host's letter (owner text, R3-C1); owner fields render only with data (§1.4). */
    host: {
        eyebrow: string;
        title: string;
        paragraphs: string[];
        languages: string;
        replies: string;
    };
    /** FAQ (§9.1 item 11): questions only; the answers reuse the availability and check-in texts. */
    faq: {
        title: string;
        checkInOut: string;
        arrivalTime: string;
        parking: string;
        climateFee: string;
        cancellation: string;
        children: string;
    };
    contact: { eyebrow: string; title: string; titleEm: string };
    /** BookBar (§8). `{date}` is the next free night. */
    bookBar: { freeTonight: string; nextFree: string };
}

/** DistanceList rows; the ones with coordinates in the guide's map data get a pin (homeRelief.ts). */
export type HomeDistanceKey = 'townHall' | 'bus' | 'beach' | 'centre' | 'library' | 'museum' | 'airport';

export const homeTranslations: Record<Locale, HomeDictionary> = {
    en: {
        heroAlt: "The balcony: a table for four among plants, with rooftops, a pine and Mount Taygetos beyond.",
        heroTagline: "Slow days on a sunlit balcony in Kalamata.",
        heroFacts: "2nd floor · 50 m from Kalamata Town Hall",
        heroPriceFrom: "from {price} / night",
        heroPriceNone: "See prices & free dates",
        heroScroll: "Scroll",
        facts: {
            label: "Key facts",
            items: [
                { value: "90", unit: "m²", label: "floor area" },
                { value: "2", label: "bedrooms" },
                { value: "1", label: "bathroom" },
                { value: "4", label: "guests at most" },
                { value: "2nd", label: "floor" },
                { value: "P", label: "free private parking", sign: true },
            ],
            seeDates: "See free dates",
        },
        intro: {
            eyebrow: "The apartment",
            title: "A calm home in the city,",
            titleEm: "with a view of Taygetos.",
            lead: "Morning sun on the balcony, a long lunch at the dining table, an evening walk into town. The apartment is quiet and bright, 50 m from the Town Hall, with views of the mountain and the sea.",
        },
        seasons: {
            label: "Season",
            summer: {
                label: "Summer (Apr–Oct)",
                link: "See summer dates",
                cards: [
                    { icon: "mountain", title: "Balcony facing Taygetos", text: "A table for four among plants, looking over the rooftops to the mountain." },
                    { icon: "snowflake", title: "Air conditioning and Wi-Fi", text: "Air conditioning for the hot days, and free Wi-Fi throughout the apartment." },
                    { icon: "beach", title: "The coast a short drive away", text: "The nearest beach is 5 minutes away by car." },
                    { icon: "parking", title: "Free private parking", text: "Outdoor parking at the property, for day trips by car." },
                ],
            },
            winter: {
                label: "Winter (Nov–Mar)",
                link: "See winter dates",
                cards: [
                    { icon: "flame", title: "Fireplace and heating", text: "A fireplace, heating and a sofa for slow evenings indoors." },
                    { icon: "walk", title: "Daily needs on foot", text: "Town Hall 50 m, bus stop 100 m, supermarkets and a bakery nearby." },
                    { icon: "kitchen", title: "Fully equipped kitchen", text: "Oven, dishwasher, coffee maker and a dining table for long meals at home." },
                    { icon: "baby", title: "Ready for families", text: "A baby cot, baby-bath equipment and a high chair are available." },
                ],
            },
        },
        balcony: {
            eyebrow: "The balcony",
            title: "Step onto the balcony",
            alt: "The balcony table and chairs among plants, with the rooftops and Mount Taygetos behind.",
            quote: "Coffee at eight. Taygetos across the rooftops. Nowhere to be.",
        },
        rooms: {
            eyebrow: "Inside",
            title: "A slow walk through the rooms",
            chipsLabel: "Rooms",
            trackLabel: "Room photos",
            allPhotos: "See all photos",
            items: {
                living: { name: "Living room", line: "Open plan, with a corner sofa and a fireplace" },
                kitchen: { name: "Kitchen", line: "Fully equipped, with a dining table" },
                bedroom1: { name: "Bedroom 1", line: "Double bed, terracotta wall" },
                bedroom2: { name: "Bedroom 2", line: "Bright, with a wardrobe" },
                bathroom: { name: "Bathroom", line: "Towels, hair dryer and washing machine" },
                balcony: { name: "Balcony", line: "Table for four, facing Taygetos" },
            },
        },
        nights: {
            eyebrow: "Availability",
            title: "The next 14 nights",
            listLabel: "The next 14 nights and their prices",
            lowestFrom: "First night at this price: {date}",
            legendBest: "lowest price",
            cta: "See availability & prices",
            staleUpdated: {
                one: "Calendar updated {count} hour ago, so booked nights are hidden for now. The prices are current.",
                other: "Calendar updated {count} hours ago, so booked nights are hidden for now. The prices are current.",
            },
        },
        location: {
            eyebrow: "Location",
            title: "Between Taygetos",
            titleEm: "and the gulf",
            lead: "A quiet street in the west of Kalamata, 50\u00a0m from the new Town Hall. The centre is about 15 minutes on foot; the beach, 5 minutes by car.",
            distancesLabel: "Distances from the apartment",
            distances: [
                { key: "townHall", name: "Town Hall", value: "50 m", how: "1 min walk" },
                { key: "bus", name: "Bus stop", value: "100 m", how: "3 min walk" },
                { key: "beach", name: "Nearest beach", value: "5 min", how: "by car" },
                { key: "centre", name: "City centre", value: "1.5 km", how: "about 15 min walk" },
                { key: "library", name: "Public Library–Art Gallery", value: "15 min", how: "on foot · 5 min by car" },
                { key: "museum", name: "Archaeological Museum of Messenia (Benakeion)", pin: "Benakeion Museum", value: "15 min", how: "on foot · 5 min by car" },
                { key: "airport", name: "Airport", value: "6 km", how: "15 min by car" },
            ],
            mapAlt: "Illustrative map of Kalamata: the apartment in the west of the city, the centre and the Archaeological Museum of Messenia (Benakeion) to the east, the beach and the Messinian Gulf to the south, Mount Taygetos to the east.",
            mapNote: "Illustrative map, not to scale. Positions from the guide's map data.",
            homePin: "You're staying here",
            gulf: "Messinian Gulf",
            taygetos: "Taygetos",
        },
        host: {
            eyebrow: "A letter from your host",
            title: "Stay a little longer than you planned.",
            paragraphs: [
                "Dolce Far Niente is looked after by its host herself. She spent many years in luxury hotels as housekeeping supervisor and manager for the VIP suites, so cleanliness here is hotel-grade and every room is organised with an eye for detail.",
                "Courteous and discreet, she makes sure you feel at home from the very first moment. She is always easy to reach, flexible with arrival and departure times where possible, and happy to share her favourite beaches, restaurants and hidden corners of Kalamata.",
                "Her aim is a carefree, well-kept stay: the professionalism of a good hotel with the warmth of Greek hospitality. She looks forward to welcoming you!",
            ],
            languages: "Languages",
            replies: "Usually replies",
        },
        faq: {
            title: "Good to know",
            checkInOut: "How do check-in and check-out work?",
            arrivalTime: "Once you have signed in to your stay, you can ask for a different arrival time.",
            parking: "Is there parking?",
            climateFee: "What is the climate resilience fee?",
            cancellation: "Can I cancel?",
            children: "Is it suitable for children?",
        },
        contact: {
            eyebrow: "Book your stay",
            title: "Your balcony",
            titleEm: "is waiting.",
        },
        bookBar: {
            freeTonight: "Free tonight",
            nextFree: "Next free night: {date}",
        },
    },
    el: {
        heroAlt: "Το μπαλκόνι: τραπέζι για τέσσερις ανάμεσα σε φυτά, με στέγες, ένα πεύκο και τον Ταΰγετο στο βάθος.",
        heroTagline: "Αργές μέρες σε ένα ηλιόλουστο μπαλκόνι στην Καλαμάτα.",
        heroFacts: "2ος όροφος · 50 μ. από το Δημαρχείο Καλαμάτας",
        heroPriceFrom: "από {price} / νύχτα",
        heroPriceNone: "Δείτε τιμές και ελεύθερες ημερομηνίες",
        heroScroll: "Κύλιση",
        facts: {
            label: "Βασικά στοιχεία",
            items: [
                { value: "90", unit: "τ.μ.", label: "εμβαδόν" },
                { value: "2", label: "υπνοδωμάτια" },
                { value: "1", label: "μπάνιο" },
                { value: "4", label: "επισκέπτες το πολύ" },
                { value: "2ος", label: "όροφος" },
                { value: "P", label: "δωρεάν ιδιωτικό πάρκινγκ", sign: true },
            ],
            seeDates: "Δείτε ελεύθερες ημερομηνίες",
        },
        intro: {
            eyebrow: "Το διαμέρισμα",
            title: "Ένα ήσυχο σπίτι στην πόλη,",
            titleEm: "με θέα τον Ταΰγετο.",
            lead: "Πρωινός ήλιος στο μπαλκόνι, ένα μεσημεριανό χωρίς βιασύνη στην τραπεζαρία, μια βραδινή βόλτα στην πόλη. Το διαμέρισμα είναι ήσυχο και φωτεινό, 50 μ. από το Δημαρχείο, με θέα σε βουνό και θάλασσα.",
        },
        seasons: {
            label: "Εποχή",
            summer: {
                label: "Καλοκαίρι (Απρ–Οκτ)",
                link: "Δείτε ημερομηνίες καλοκαιριού",
                cards: [
                    { icon: "mountain", title: "Μπαλκόνι με θέα τον Ταΰγετο", text: "Τραπέζι για τέσσερις ανάμεσα σε φυτά, με θέα πάνω από τις στέγες ως το βουνό." },
                    { icon: "snowflake", title: "Κλιματισμός και Wi-Fi", text: "Κλιματισμός για τις ζεστές μέρες και δωρεάν Wi-Fi σε όλο το διαμέρισμα." },
                    { icon: "beach", title: "Η ακτή λίγα λεπτά με το αυτοκίνητο", text: "Η κοντινότερη παραλία είναι 5 λεπτά με το αυτοκίνητο." },
                    { icon: "parking", title: "Δωρεάν ιδιωτικό πάρκινγκ", text: "Εξωτερικό πάρκινγκ στο κατάλυμα, για εκδρομές με το αυτοκίνητο." },
                ],
            },
            winter: {
                label: "Χειμώνας (Νοε–Μαρ)",
                link: "Δείτε ημερομηνίες χειμώνα",
                cards: [
                    { icon: "flame", title: "Τζάκι και θέρμανση", text: "Τζάκι, θέρμανση και καναπές για ήσυχα βράδια στο σπίτι." },
                    { icon: "walk", title: "Τα καθημερινά με τα πόδια", text: "Δημαρχείο 50 μ., στάση λεωφορείου 100 μ., σούπερ μάρκετ και φούρνος κοντά." },
                    { icon: "kitchen", title: "Πλήρως εξοπλισμένη κουζίνα", text: "Φούρνος, πλυντήριο πιάτων, καφετιέρα και τραπεζαρία για μεγάλα γεύματα στο σπίτι." },
                    { icon: "baby", title: "Έτοιμο για οικογένειες", text: "Διατίθενται παρκοκρέβατο, εξοπλισμός μπάνιου μωρού και καρεκλάκι φαγητού." },
                ],
            },
        },
        balcony: {
            eyebrow: "Το μπαλκόνι",
            title: "Βγείτε στο μπαλκόνι",
            alt: "Το τραπέζι και οι καρέκλες του μπαλκονιού ανάμεσα σε φυτά, με τις στέγες και τον Ταΰγετο πίσω τους.",
            quote: "Καφές στις οκτώ. Ο Ταΰγετος πάνω από τις στέγες. Καμία βιασύνη.",
        },
        rooms: {
            eyebrow: "Μέσα",
            title: "Μια αργή βόλτα στα δωμάτια",
            chipsLabel: "Δωμάτια",
            trackLabel: "Φωτογραφίες δωματίων",
            allPhotos: "Δείτε όλες τις φωτογραφίες",
            items: {
                living: { name: "Καθιστικό", line: "Ενιαίος χώρος, με γωνιακό καναπέ και τζάκι" },
                kitchen: { name: "Κουζίνα", line: "Πλήρως εξοπλισμένη, με τραπεζαρία" },
                bedroom1: { name: "Υπνοδωμάτιο 1", line: "Διπλό κρεβάτι, τοίχος σε χρώμα τερακότας" },
                bedroom2: { name: "Υπνοδωμάτιο 2", line: "Φωτεινό, με ντουλάπα" },
                bathroom: { name: "Μπάνιο", line: "Πετσέτες, σεσουάρ και πλυντήριο ρούχων" },
                balcony: { name: "Μπαλκόνι", line: "Τραπέζι για τέσσερις, με θέα τον Ταΰγετο" },
            },
        },
        nights: {
            eyebrow: "Διαθεσιμότητα",
            title: "Οι επόμενες 14 νύχτες",
            listLabel: "Οι επόμενες 14 νύχτες και οι τιμές τους",
            lowestFrom: "Πρώτη νύχτα σε αυτή την τιμή: {date}",
            legendBest: "χαμηλότερη τιμή",
            cta: "Δείτε διαθεσιμότητα και τιμές",
            staleUpdated: {
                one: "Το ημερολόγιο ενημερώθηκε πριν από {count} ώρα, γι' αυτό οι κρατημένες νύχτες δεν φαίνονται προς το παρόν. Οι τιμές ισχύουν.",
                other: "Το ημερολόγιο ενημερώθηκε πριν από {count} ώρες, γι' αυτό οι κρατημένες νύχτες δεν φαίνονται προς το παρόν. Οι τιμές ισχύουν.",
            },
        },
        location: {
            eyebrow: "Τοποθεσία",
            title: "Ανάμεσα στον Ταΰγετο",
            titleEm: "και τον κόλπο",
            lead: "Ένας ήσυχος δρόμος στα δυτικά της Καλαμάτας, 50\u00a0μ. από το νέο Δημαρχείο. Το κέντρο είναι περίπου 15 λεπτά με τα πόδια· η παραλία, 5 λεπτά με το αυτοκίνητο.",
            distancesLabel: "Αποστάσεις από το διαμέρισμα",
            distances: [
                { key: "townHall", name: "Δημαρχείο", value: "50 μ.", how: "1 λεπτό με τα πόδια" },
                { key: "bus", name: "Στάση λεωφορείου", value: "100 μ.", how: "3 λεπτά με τα πόδια" },
                { key: "beach", name: "Κοντινότερη παραλία", value: "5 λεπτά", how: "με το αυτοκίνητο" },
                { key: "centre", name: "Κέντρο πόλης", value: "1,5 χλμ.", how: "περίπου 15 λεπτά με τα πόδια" },
                { key: "library", name: "Δημόσια Βιβλιοθήκη–Πινακοθήκη", value: "15 λεπτά", how: "με τα πόδια · 5 λεπτά με το αυτοκίνητο" },
                { key: "museum", name: "Μπενάκειο Αρχαιολογικό Μουσείο Μεσσηνίας", pin: "Μπενάκειο Μουσείο", value: "15 λεπτά", how: "με τα πόδια · 5 λεπτά με το αυτοκίνητο" },
                { key: "airport", name: "Αεροδρόμιο", value: "6 χλμ.", how: "15 λεπτά με το αυτοκίνητο" },
            ],
            mapAlt: "Ενδεικτικός χάρτης της Καλαμάτας: το διαμέρισμα στα δυτικά της πόλης, το κέντρο και το Μπενάκειο Αρχαιολογικό Μουσείο Μεσσηνίας ανατολικά, η παραλία και ο Μεσσηνιακός κόλπος νότια, ο Ταΰγετος ανατολικά.",
            mapNote: "Ενδεικτικός χάρτης, όχι υπό κλίμακα. Οι θέσεις προέρχονται από τα δεδομένα χάρτη του οδηγού.",
            homePin: "Εδώ μένετε",
            gulf: "Μεσσηνιακός κόλπος",
            taygetos: "Ταΰγετος",
        },
        host: {
            eyebrow: "Ένα γράμμα από την οικοδέσποινά σας",
            title: "Μείνετε λίγο περισσότερο απ' ό,τι σχεδιάζατε.",
            paragraphs: [
                "Το Dolce Far Niente το φροντίζει η ίδια η οικοδέσποινά του. Έχει πολλά χρόνια εμπειρίας σε ξενοδοχεία πολυτελείας, ως supervisor και manager στο housekeeping των VIP σουιτών. Γι' αυτό η καθαριότητα εδώ είναι ξενοδοχειακού επιπέδου και κάθε χώρος είναι οργανωμένος με προσοχή στη λεπτομέρεια.",
                "Με ευγένεια και διακριτικότητα, φροντίζει να νιώσετε άνετα από την πρώτη στιγμή. Είναι πάντα διαθέσιμη να σας απαντήσει, ευέλικτη με τις ώρες άφιξης και αναχώρησης όπου γίνεται, και χαίρεται να σας προτείνει παραλίες, εστιατόρια και κρυφές γωνιές της Καλαμάτας.",
                "Στόχος της είναι μια ξέγνοιαστη, προσεγμένη διαμονή, με τον επαγγελματισμό ενός καλού ξενοδοχείου και τη ζεστασιά της ελληνικής φιλοξενίας. Ανυπομονεί να σας καλωσορίσει!",
            ],
            languages: "Γλώσσες",
            replies: "Συνήθως απαντά",
        },
        faq: {
            title: "Καλό να ξέρετε",
            checkInOut: "Πώς γίνονται η άφιξη και η αναχώρηση;",
            arrivalTime: "Αφού συνδεθείτε στη διαμονή σας, μπορείτε να ζητήσετε διαφορετική ώρα άφιξης.",
            parking: "Υπάρχει πάρκινγκ;",
            climateFee: "Τι είναι το τέλος ανθεκτικότητας στην κλιματική κρίση;",
            cancellation: "Μπορώ να ακυρώσω;",
            children: "Είναι κατάλληλο για παιδιά;",
        },
        contact: {
            eyebrow: "Κλείστε τη διαμονή σας",
            title: "Το μπαλκόνι",
            titleEm: "σας περιμένει.",
        },
        bookBar: {
            freeTonight: "Ελεύθερο απόψε",
            nextFree: "Επόμενη ελεύθερη νύχτα: {date}",
        },
    },
};
