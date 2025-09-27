// Real villa data for Kalamata apartment
const villaData = {
  id: 'kalamata-apartment',
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
    region: 'Messenia',
    country: 'Greece',
    cityGreek: 'Καλαμάτα',
    regionGreek: 'Μεσσηνία',
    coordinates: {
      lat: 37.040635,
      lng: 22.094364
    }
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

  specs: {
    bedrooms: 2,
    bathrooms: 1,
    floor: 2,
    maxGuests: 4,
    size: '75 m²' // estimated
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
  },

  distances: {
    en: [
      { place: 'Town Hall', distance: '50m', time: '1 min walk' },
      { place: 'Public Library & Gallery', distance: '1.8km', time: '15 min walk / 5 min drive' },
      { place: 'Benakeio Archaeological Museum', distance: '2km', time: '15 min walk / 5 min drive' },
      { place: 'Nearest Beach', distance: '3km', time: '5 min drive' },
      { place: 'Kalamata Airport', distance: '6km', time: '15 min drive' },
      { place: 'Supermarket', distance: '100m', time: '2 min walk' },
      { place: 'Bakery', distance: '150m', time: '3 min walk' },
      { place: 'Bus Stop', distance: '100m', time: '2 min walk' }
    ],
    el: [
      { place: 'Δημαρχείο', distance: '50μ', time: '1 λεπτό με τα πόδια' },
      { place: 'Δημόσια Βιβλιοθήκη–Πινακοθήκη', distance: '1,8 χλμ', time: '15 λεπτά με τα πόδια / 5 λεπτά με αυτοκίνητο' },
      { place: 'Μπενάκειο Αρχαιολογικό Μουσείο', distance: '2 χλμ', time: '15 λεπτά με τα πόδια / 5 λεπτά με αυτοκίνητο' },
      { place: 'Κοντινότερη παραλία', distance: '3 χλμ', time: '5 λεπτά με αυτοκίνητο' },
      { place: 'Αεροδρόμιο Καλαμάτας', distance: '6 χλμ', time: '15 λεπτά οδήγηση' },
      { place: 'Σούπερ μάρκετ', distance: '100μ', time: '2 λεπτά με τα πόδια' },
      { place: 'Φούρνος', distance: '150μ', time: '3 λεπτά με τα πόδια' },
      { place: 'Στάση λεωφορείου', distance: '100μ', time: '2 λεπτά με τα πόδια' }
    ]
  },

  pricing: {
    basePrice: 65, // €65/night more realistic for Kalamata 2-bedroom
    cleaningFee: 25,
    serviceFee: 15,
    currency: 'EUR'
  },

  houseRules: {
    en: [
      'No smoking inside',
      'Quiet hours after 22:00', 
      'Maximum 4 guests',
      'Check-in: 15:00 - 22:00',
      'Check-out: 11:00',
      'Families with children welcome',
      'Free parking space included'
    ],
    el: [
      'Απαγορεύεται το κάπνισμα μέσα',
      'Ήσυχες ώρες μετά τις 22:00',
      'Μέγιστο 4 άτομα', 
      'Άφιξη: 15:00 - 22:00',
      'Αναχώρηση: 11:00',
      'Οικογένειες με παιδιά καλοδεχούμενες',
      'Δωρεάν θέση πάρκινγκ'
    ]
  }
};

// Helper to get localized content
export function getVillaContent(locale: 'en' | 'el' = 'en') {
  const data = villaData;
  return {
    name: data.name[locale],
    shortName: data.shortName[locale],
    description: data.description[locale],
    highlights: data.highlights[locale],
    amenities: data.amenities[locale],
    distances: data.distances[locale],
    houseRules: data.houseRules[locale],
    location: data.location,
    specs: data.specs,
    pricing: data.pricing
  };
}
