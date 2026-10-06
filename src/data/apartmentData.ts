import { BRAND_NAME } from '@/data/brand';

// Real apartment data for Kalamata stay
const apartmentData = {
  shortName: {
    en: BRAND_NAME,
    el: BRAND_NAME
  },

  location: {
    city: 'Kalamata',
    country: 'Greece'
  },

  description: {
    en: 'A 90 m² two-bedroom apartment on the 2nd floor, with large sunny terraces and views of the mountain and the sea, on a quiet street 50 m from the new Town Hall. Free Wi-Fi and air conditioning. For families: a baby cot, baby-bath equipment and a high chair. Supermarkets, a bakery and a bus stop are nearby, and there is free private parking at the property.',
    el: 'Διαμέρισμα 90 τ.μ. με δύο υπνοδωμάτια στον 2ο όροφο, με μεγάλες ηλιόλουστες βεράντες και θέα σε βουνό και θάλασσα, σε ήσυχο δρόμο 50 μ. από το νέο Δημαρχείο. Δωρεάν Wi-Fi και κλιματισμός. Για οικογένειες: παρκοκρέβατο, εξοπλισμός μπάνιου μωρού και καρεκλάκι φαγητού. Κοντά υπάρχουν σούπερ μάρκετ, φούρνος και στάση λεωφορείου, και στο κατάλυμα υπάρχει δωρεάν ιδιωτικό πάρκινγκ.'
  },

  // Detailed amenities shown on the check-in page, grouped by area.
  amenityGroups: [
    {
      id: 'essentials',
      title: { en: "Essentials", el: "Βασικά" },
      items: {
        en: [
          "Free private parking",
          "Free Wi-Fi throughout the property",
          "Suitable for families",
          "No smoking inside",
          "Luggage storage",
          "Iron",
        ],
        el: [
          "Δωρεάν ιδιωτικό πάρκινγκ",
          "Δωρεάν Wi-Fi σε όλο το κατάλυμα",
          "Κατάλληλο για οικογένειες",
          "Απαγορεύεται το κάπνισμα στο εσωτερικό",
          "Αποθήκευση αποσκευών",
          "Σίδερο",
        ],
      },
    },
    {
      id: 'comfort',
      title: { en: "Comfort", el: "Άνεση" },
      items: {
        en: [
          "Air conditioning",
          "Heating",
          "Fireplace",
          "Seating area with sofa",
          "Soundproofing",
          "Flat-screen TV",
        ],
        el: [
          "Κλιματισμός",
          "Θέρμανση",
          "Τζάκι",
          "Καθιστικό με καναπέ",
          "Ηχομόνωση",
          "Τηλεόραση επίπεδης οθόνης",
        ],
      },
    },
    {
      id: 'kitchen',
      title: { en: "Kitchen", el: "Κουζίνα" },
      items: {
        en: [
          "Fully equipped kitchen",
          "Coffee/tea maker",
          "Dining table",
          "Dishwasher",
          "Microwave",
          "Refrigerator and oven",
        ],
        el: [
          "Πλήρως εξοπλισμένη κουζίνα",
          "Καφετιέρα/βραστήρας",
          "Τραπεζαρία",
          "Πλυντήριο πιάτων",
          "Φούρνος μικροκυμάτων",
          "Ψυγείο και φούρνος",
        ],
      },
    },
    {
      id: 'bathroom',
      title: { en: "Bathroom", el: "Μπάνιο" },
      items: {
        en: [
          "Private bathroom",
          "Bathtub",
          "Towels and linens",
          "Hair dryer",
          "Free toiletries",
          "Washing machine",
        ],
        el: [
          "Ιδιωτικό μπάνιο",
          "Μπανιέρα",
          "Πετσέτες και λευκά είδη",
          "Σεσουάρ",
          "Δωρεάν προϊόντα περιποίησης",
          "Πλυντήριο ρούχων",
        ],
      },
    },
    {
      id: 'outdoor',
      title: { en: "Outdoor and views", el: "Εξωτερικοί χώροι και θέα" },
      items: {
        en: [
          "Balcony",
          "Terrace / sun terrace",
          "Outdoor dining area",
          // The sea view is the owner's fact (O45); no photo shows the gulf yet (identity §7.4).
          "Sea, mountain, and city views",
        ],
        el: [
          "Μπαλκόνι",
          "Βεράντα / ηλιόλουστη βεράντα",
          "Εξωτερική τραπεζαρία",
          "Θέα σε θάλασσα, βουνό και πόλη",
        ],
      },
    },
    {
      id: 'safety',
      title: { en: "Safety", el: "Ασφάλεια" },
      items: {
        en: [
          "Smoke detectors",
          "Fire extinguishers",
          "Safe",
          "Key access",
        ],
        el: [
          "Ανιχνευτές καπνού",
          "Πυροσβεστήρες",
          "Χρηματοκιβώτιο",
          "Πρόσβαση με κλειδί",
        ],
      },
    },
  ],
};

// Helper to get localized content
export function getApartmentContent(locale: 'en' | 'el') {
  const data = apartmentData;
  return {
    shortName: data.shortName[locale],
    description: data.description[locale],
    amenityGroups: data.amenityGroups.map((group) => ({ id: group.id, title: group.title[locale], items: group.items[locale] })),
    location: data.location
  };
}
