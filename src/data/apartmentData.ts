// Real apartment data for Kalamata stay
const apartmentData = {
  name: {
    en: '2-Bedroom Apartment with Mountain & Sea Views',
    el: 'Διαμέρισμα 2 Υπνοδωματίων με Θέα Βουνό & Θάλασσα'
  },
  
  shortName: {
    en: 'Kalamata Apartment',
    el: 'Διαμέρισμα Καλαμάτας'
  },

  location: {
    city: 'Kalamata',
    country: 'Greece'
  },

  description: {
    en: 'A spacious 2-bedroom apartment on the 2nd floor, with large sunny terraces and mountain and sea views, in a quiet neighborhood just 50m from the new Town Hall. Free Wi-Fi and air conditioning are provided. For families, a baby cot, baby bath equipment and high chair are available. Nearby there are supermarkets, bakery and bus stop, while the property provides free outdoor private parking.',
    el: 'Ένα ευρύχωρο διαμέρισμα 2 υπνοδωματίων στον 2ο όροφο, με μεγάλες ηλιόλουστες βεράντες και θέα σε βουνό και θάλασσα, σε ήσυχη γειτονιά μόλις 50 μ. από το νέο Δημαρχείο. Παρέχονται δωρεάν Wi-Fi και κλιματισμός. Για οικογένειες διατίθενται παρκοκρέβατο, εξοπλισμός μπάνιου μωρού και καρεκλάκι φαγητού. Σε μικρή απόσταση υπάρχουν σούπερ μάρκετ, φούρνος και στάση λεωφορείου, ενώ στο κατάλυμα παρέχεται δωρεάν εξωτερικό ιδιωτικό πάρκινγκ.'
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
          "Family rooms",
          "Non-smoking rooms",
          "Luggage storage",
        ],
        el: [
          "Δωρεάν ιδιωτικό πάρκινγκ",
          "Δωρεάν Wi-Fi σε όλο το κατάλυμα",
          "Οικογενειακά δωμάτια",
          "Δωμάτια μη καπνιστών",
          "Αποθήκευση αποσκευών",
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
          "Washing machine",
          "Dishwasher",
          "Microwave",
          "Refrigerator and oven",
        ],
        el: [
          "Πλήρως εξοπλισμένη κουζίνα",
          "Καφετιέρα/βραστήρας",
          "Τραπεζαρία",
          "Πλυντήριο ρούχων",
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
        ],
        el: [
          "Ιδιωτικό μπάνιο",
          "Μπανιέρα",
          "Πετσέτες και λευκά είδη",
          "Σεσουάρ",
          "Δωρεάν προϊόντα περιποίησης",
        ],
      },
    },
    {
      id: 'outdoor',
      title: { en: "Outdoor & Views", el: "Εξωτερικοί χώροι & θέα" },
      items: {
        en: [
          "Balcony",
          "Terrace / sun terrace",
          "Outdoor dining area",
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
          "Iron",
        ],
        el: [
          "Ανιχνευτές καπνού",
          "Πυροσβεστήρες",
          "Χρηματοκιβώτιο",
          "Πρόσβαση με κλειδί",
          "Σίδερο",
        ],
      },
    },
  ],
  amenities: {
    en: [
      'Free Wi-Fi',
      'Air conditioning', 
      'Large sunny terraces',
      'Mountain & sea views',
      'Free private parking',
      'Baby cot available',
      'Baby bath equipment',
      'High chair',
      'Fully equipped kitchen',
      'Washing machine'
    ],
    el: [
      'Δωρεάν Wi-Fi',
      'Κλιματισμός',
      'Μεγάλες ηλιόλουστες βεράντες', 
      'Θέα βουνού και θάλασσας',
      'Δωρεάν ιδιωτικό πάρκινγκ',
      'Παρκοκρέβατο διαθέσιμο',
      'Εξοπλισμός μπάνιου μωρού',
      'Καρεκλάκι φαγητού',
      'Πλήρως εξοπλισμένη κουζίνα',
      'Πλυντήριο ρούχων'
    ]
  }
};

// Helper to get localized content
export function getApartmentContent(locale: 'en' | 'el' = 'en') {
  const data = apartmentData;
  return {
    name: data.name[locale],
    shortName: data.shortName[locale],
    description: data.description[locale],
    amenities: data.amenities[locale],
    amenityGroups: data.amenityGroups.map((group) => ({ id: group.id, title: group.title[locale], items: group.items[locale] })),
    location: data.location
  };
}
