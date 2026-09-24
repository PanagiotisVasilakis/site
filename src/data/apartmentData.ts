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

  highlights: {
    en: [
      'Mountain and sea views from terraces',
      'Quiet neighborhood location',  
      'Just 50m from Town Hall',
      'Free private parking',
      'Family-friendly with baby equipment',
      'Walking distance to amenities'
    ],
    el: [
      'Θέα βουνού και θάλασσας από βεράντες',
      'Ήσυχη γειτονιά',
      'Μόλις 50μ από το Δημαρχείο', 
      'Δωρεάν ιδιωτικό πάρκινγκ',
      'Φιλικό για οικογένειες με εξοπλισμό μωρού',
      'Κοντά σε όλες τις ανέσεις'
    ]
  },

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
    highlights: data.highlights[locale],
    amenities: data.amenities[locale],
    location: data.location
  };
}
