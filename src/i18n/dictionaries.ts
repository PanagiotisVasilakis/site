import type { Locale } from "./config";

export type Dictionary = {
  appTitle: string;
  homeTitle: string;
  homeSubtitle: string;
  backHome: string;
  skipLink?: string;
  details: string;
  emptyState: string;
  itemSingular: string;
  itemPlural: string;
  updates?: {
    updateAvailable: string; // generic when version unknown
    refresh: string;
    dismiss: string;
    fromTo: string; // pattern e.g. "Update available: {old} → {new}"
    assetsFromTo: string; // pattern for assets
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
  };
  ui?: {
    filters: string;
    map: string;
    list: string;
    resetAll: string;
    activeTags: string;
    none: string;
    back?: string;
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
  };
  categories: {
    phones: string;
    restaurants: string;
    sightseeing: string;
  };
  house?: {
    navLabel: string;
    navSubtitle: string;
    title: string;
    location?: string;
    intro: string;
    overview: string;
    amenities: string;
    rules: string;
    checkin: string;
    emergency: string;
    amenityList: string[]; // pre-translated bullet list
    rulesList: string[];   // house rules bullets
    distances?: string[]; // nearby distances list
    photoAlts?: { living: string; bedroom: string; kitchen: string; };
  };
  booking?: {
    locationDesc: string; // appended after location name
  completeTitle?: string;
  yourDetails?: string;
  datesLabel?: string;
  guestsLabel?: string;
  durationLabel?: string;
  notSelected?: string;
  selectDatesPrompt?: string;
  priceBreakdown?: string;
  cleaningFee?: string;
  serviceFee?: string;
  total?: string;
  whatsIncluded?: string;
  completeDetailsHint?: string;
  };
  locationPanel?: {
    title: string;
    villaTitle: string;
    city: string;
    blurb: string;
    nearby: string;
    attractions: string[];
    howToEnableMapTitle: string;
    howToEnableSteps: string[];
  };
  map?: {
    loading: string;
    villaMarkerTitle: string;
    villaMarkerDesc: string;
    viewDetails: string;
    failed: string;
    tokenMissing: string;
  };
  checkin?: {
    title?: string;
    summary?: string;
    bookingId?: string;
    reference?: string;
    source?: string;
    phone?: string;
    dates?: string;
    room?: string;
    arrivalTime?: string;
    arrivalTimeInvalid?: string;
    specialRequests?: string;
    acceptTerms?: string;
    submit?: string;
    submitted?: string;
    saving?: string;
    loading?: string;
  };
  portal?: {
    signInTitle: string;
    signUpTitle?: string;
    originQuestion: string;
    originGR: string;
    originAbroad: string;
    phoneLabel: string;
    afmLabel: string;
    passportLabel: string;
    bookingRefLabel: string;
    lastNameLabel: string;
    continueBtn: string;
  // verifyingBtn removed (direct verification only)
    noBookingYet: string;
    ctaStartBooking?: string;
    goHome: string;
    rememberMe?: string;
  // verifyRequired removed (no extra prompts)
    // Additional UX strings for auth toggles
    alreadyRegistered?: string;
    newHere?: string;
    signInCta?: string;
    signUpCta?: string;
    hints?: { phone?: string; afm?: string; passport?: string };
    validation?: {
      phoneRequired?: string; phoneInvalid?: string;
      afmRequired?: string; afmInvalid?: string;
      passportRequired?: string; passportInvalid?: string;
    };
  };
};

const dict: Record<Locale, Dictionary> = {
  en: {
    appTitle: "Guest Guide",
  homeTitle: "Dolce Far Niente",
  homeSubtitle: "The luxury of a Lazy Afternoon",
    backHome: "← Back home",
  skipLink: "Skip to content",
    details: "Details →",
  emptyState: "No items yet.",
  itemSingular: "item",
  itemPlural: "items",
  search: { where: "Where", addLocation: "Add location", dates: "Dates", addDates: "Add dates", guestsLabel: "Guests", guestSingular: "guest", guestPlural: "guests", search: "Search" },
  ui: { filters: "Filters", map: "Map", list: "List", resetAll: "Reset All", activeTags: "Active Tags", none: "None" },
  updates: { updateAvailable: "New version available", refresh: "Refresh", dismiss: "Dismiss", fromTo: "Update available: {old} → {new}", assetsFromTo: "Assets updated: {old} → {new}" },
    cta: {
      call: "Call",
      directions: "Directions",
      website: "Website",
      reserve: "Reserve",
      home: "Home",
    },
  labels: { updated: "Updated", save: "Save", saved: "Saved", favorites: "Favorites", networkOnline: "Online", networkOffline: "Offline", networkSlow: "Slow network", networkReconnected: "Reconnected", syncPending: "Sync pending", syncIdle: "Synced" },
    categories: {
      phones: "Important Phones",
      restaurants: "Restaurants",
      sightseeing: "Sightseeing",
    },
    house: {
      navLabel: "Villa Photos",
      navSubtitle: "Photo tour & location",
      title: "2-Bedroom Apartment with Mountain & Sea Views",
      location: "Kalamata, Greece",
      intro: "A spacious apartment with large sunny terraces and beautiful views, in a quiet neighborhood near the Town Hall.",
      overview: "Overview",
      amenities: "Amenities",
      rules: "House Rules",
      checkin: "Check-in / Check-out",
      emergency: "Emergency & Support",
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
      photoAlts: { living: 'Living area', bedroom: 'Bedroom', kitchen: 'Kitchen' },
      distances: [
        "Town Hall: 50m (1 min walk)",
        "Public Library & Gallery: 1.8km (15 min walk)",
        "Archaeological Museum: 2km (15 min walk)", 
        "Nearest beach: 5 min drive",
        "Kalamata Airport: 6km (15 min drive)"
      ]
    },
    booking: {
  locationDesc: "Quiet neighborhood near the Town Hall",
  completeTitle: "Complete your booking",
  yourDetails: "Your booking details",
  datesLabel: "Dates",
  guestsLabel: "Guests",
  durationLabel: "Duration",
  notSelected: "Not selected",
  selectDatesPrompt: "Please complete your booking details above to continue.",
  priceBreakdown: "Price breakdown",
  cleaningFee: "Cleaning fee",
  serviceFee: "Service fee",
  total: "Total",
  whatsIncluded: "What's included",
  completeDetailsHint: "Select dates to see pricing"
    }
    ,locationPanel: {
      title: "Villa Location & Nearby Attractions",
      villaTitle: "2-Bedroom Apartment with Views",
      city: "Kalamata, Greece",
      blurb: "Quiet neighborhood, 50m from Town Hall with mountain & sea views",
      nearby: "Nearby Attractions",
      attractions: [
        "🏛️ Town Hall (50m walk)",
        "📚 Public Library & Gallery (1.8km)",
        "🏺 Archaeological Museum (2km)",
        "🏖️ Beach (5 min drive)",
        "✈️ Kalamata Airport (6km)",
        "🚗 Free private parking"
      ],
      howToEnableMapTitle: "To enable interactive map:",
      howToEnableSteps: [
        "Get a free token from mapbox.com",
        "Add NEXT_PUBLIC_MAPBOX_TOKEN to .env",
        "Restart dev server"
      ]
    }
    ,map: {
      loading: "Loading map...",
      villaMarkerTitle: "Seaside Modern Villa",
      villaMarkerDesc: "Your accommodation",
      viewDetails: "View details",
      failed: "Map failed to load",
      tokenMissing: "Mapbox token not configured"
    },
    portal: {
      signInTitle: "Guest Sign‑in",
      signUpTitle: "Guest Sign‑up",
      originQuestion: "Where are you coming from?",
      originGR: "Greece",
      originAbroad: "Abroad",
      phoneLabel: "Phone (E.164)",
      afmLabel: "AFM (9 digits)",
      passportLabel: "Passport",
      bookingRefLabel: "Booking reference (optional)",
      lastNameLabel: "Last name (optional)",
      continueBtn: "Continue",
      noBookingYet: "No booking yet?",
      ctaStartBooking: "Start booking",
      goHome: "Go to Home",
      rememberMe: "Remember me on this device",
      
      alreadyRegistered: "Already registered?",
      newHere: "New here?",
      signInCta: "Sign‑in",
      signUpCta: "Sign‑up",
      hints: {
        phone: "Include country code (e.g., +1 415…)",
        afm: "9 digits",
        passport: "Use letters and numbers only."
      },
      validation: {
        phoneRequired: "Phone is required",
        phoneInvalid: "Enter a valid phone with country code (e.g., +1…)",
        afmRequired: "AFM is required",
        afmInvalid: "AFM must be 9 digits",
        passportRequired: "Passport number is required",
        passportInvalid: "Use 5–20 letters or numbers"
      }
    }
    ,checkin: {
      title: "Check-in",
      summary: "Booking summary",
      bookingId: "Booking ID",
      reference: "Reference",
      source: "Source",
      phone: "Phone",
      dates: "Dates",
      room: "Room",
      arrivalTime: "Arrival time",
      arrivalTimeInvalid: "Please enter a valid time (HH:mm)",
      specialRequests: "Special requests",
      acceptTerms: "I confirm my details are correct and accept the terms",
      submit: "Complete Check-in",
      submitted: "Check-in completed",
      saving: "Saving…",
      loading: "Loading booking…",
    }
  },
  el: {
    appTitle: "Οδηγός Επισκεπτών",
    homeTitle: "Dolce Far Niente",
    homeSubtitle: "Η πολυτέλεια ενός χαλαρού απογεύματος",
    backHome: "← Πίσω στην αρχική",
  skipLink: "Μετάβαση στο περιεχόμενο",
    details: "Λεπτομέρειες →",
  emptyState: "Δεν υπάρχουν στοιχεία ακόμη.",
  itemSingular: "στοιχείο",
  itemPlural: "στοιχεία",
  search: { where: "Προορισμός", addLocation: "Προσθήκη τοποθεσίας", dates: "Ημερομηνίες", addDates: "Προσθήκη ημερομηνιών", guestsLabel: "Επισκέπτες", guestSingular: "επισκέπτης", guestPlural: "επισκέπτες", search: "Αναζήτηση" },
  ui: { filters: "Φίλτρα", map: "Χάρτης", list: "Λίστα", resetAll: "Επαναφορά", activeTags: "Ενεργές Ετικέτες", none: "Κανένα", back: "Πίσω" },
  updates: { updateAvailable: "Νέα έκδοση διαθέσιμη", refresh: "Ανανέωση", dismiss: "Κλείσιμο", fromTo: "Διαθέσιμη ενημέρωση: {old} → {new}", assetsFromTo: "Ενημερωμένα αρχεία: {old} → {new}" },
    cta: {
      call: "Κλήση",
      directions: "Οδηγίες",
      website: "Ιστότοπος",
      reserve: "Κράτηση",
      home: "Αρχική",
    },
  labels: { updated: "Ενημερώθηκε", save: "Αποθήκευση", saved: "Αποθηκεύτηκε", favorites: "Αγαπημένα", networkOnline: "Συνδεδεμένο", networkOffline: "Εκτός σύνδεσης", networkSlow: "Αργή σύνδεση", networkReconnected: "Επανασυνδέθηκε", syncPending: "Εκκρεμεί συγχρονισμός", syncIdle: "Συγχρονίστηκε" },
    categories: {
      phones: "Σημαντικά Τηλέφωνα",
      restaurants: "Εστιατόρια",
      sightseeing: "Αξιοθέατα",
    },
    house: {
      navLabel: "Φωτογραφίες Διαμερίσματος",
      navSubtitle: "Φωτογραφική περιήγηση & τοποθεσία",
      title: "Διαμέρισμα 2 Υπνοδωματίων με Θέα Βουνό & Θάλασσα",
      location: "Καλαμάτα, Ελλάδα", 
      intro: "Ένα ευρύχωρο διαμέρισμα με μεγάλες ηλιόλουστες βεράντες και όμορφη θέα, σε ήσυχη γειτονιά κοντά στο Δημαρχείο.",
      overview: "Επισκόπηση",
      amenities: "Παροχές",
      rules: "Κανόνες Σπιτιού",
      checkin: "Άφιξη / Αναχώρηση",
      emergency: "Έκτακτη Ανάγκη & Υποστήριξη",
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
      photoAlts: { living: 'Καθιστικό', bedroom: 'Υπνοδωμάτιο', kitchen: 'Κουζίνα' },
      distances: [
        "Δημαρχείο: 50μ (1 λεπτό με τα πόδια)",
        "Δημόσια Βιβλιοθήκη–Πινακοθήκη: 1,8 χλμ (15 λεπτά με τα πόδια)",
        "Μπενάκειο Αρχαιολογικό Μουσείο: 2 χλμ (15 λεπτά με τα πόδια)",
        "Κοντινότερη παραλία: 5 λεπτά με αυτοκίνητο", 
        "Αεροδρόμιο Καλαμάτας: 6 χλμ (15 λεπτά οδήγηση)"
      ]
    },
    booking: {
  locationDesc: "Ήσυχη γειτονιά κοντά στο Δημαρχείο",
  completeTitle: "Ολοκληρώστε την κράτηση",
  yourDetails: "Στοιχεία κράτησης",
  datesLabel: "Ημερομηνίες",
  guestsLabel: "Επισκέπτες",
  durationLabel: "Διάρκεια",
  notSelected: "Δεν έχει επιλεγεί",
  selectDatesPrompt: "Συμπληρώστε τα στοιχεία κράτησης παραπάνω για να συνεχίσετε.",
  priceBreakdown: "Ανάλυση τιμής",
  cleaningFee: "Τέλος καθαρισμού",
  serviceFee: "Τέλος υπηρεσίας",
  total: "Σύνολο",
  whatsIncluded: "Τι περιλαμβάνεται",
  completeDetailsHint: "Επιλέξτε ημερομηνίες για να δείτε τιμή"
    }
    ,locationPanel: {
      title: "Τοποθεσία & Κοντινά Αξιοθέατα",
      villaTitle: "Διαμέρισμα 2 Υπνοδωματίων με Θέα",
      city: "Καλαμάτα, Ελλάδα",
      blurb: "Ήσυχη γειτονιά, 50μ από το Δημαρχείο με θέα βουνό & θάλασσα",
      nearby: "Κοντινά Σημεία",
      attractions: [
        "🏛️ Δημαρχείο (50μ περπάτημα)",
        "📚 Δημόσια Βιβλιοθήκη & Πινακοθήκη (1,8χλμ)",
        "🏺 Αρχαιολογικό Μουσείο (2χλμ)",
        "🏖️ Παραλία (5 λεπτά με αυτοκίνητο)",
        "✈️ Αεροδρόμιο Καλαμάτας (6χλμ)",
        "🚗 Δωρεάν ιδιωτικό πάρκινγκ"
      ],
      howToEnableMapTitle: "Για ενεργοποίηση διαδραστικού χάρτη:",
      howToEnableSteps: [
        "Λάβετε ένα δωρεάν token από το mapbox.com",
        "Προσθέστε το NEXT_PUBLIC_MAPBOX_TOKEN στο .env",
        "Επανεκκινήστε τον dev server"
      ]
    }
    ,map: {
      loading: "Φόρτωση χάρτη...",
      villaMarkerTitle: "Σύγχρονη Βίλα κοντά στη Θάλασσα",
      villaMarkerDesc: "Το κατάλυμά σας",
      viewDetails: "Προβολή λεπτομερειών",
      failed: "Αποτυχία φόρτωσης χάρτη",
      tokenMissing: "Το Mapbox token δεν έχει ρυθμιστεί"
    },
    portal: {
      signInTitle: "Σύνδεση Επισκέπτη",
      signUpTitle: "Εγγραφή Επισκέπτη",
      originQuestion: "Από πού έρχεστε;",
      originGR: "Ελλάδα",
      originAbroad: "Εξωτερικό",
      phoneLabel: "Τηλέφωνο (E.164)",
      afmLabel: "ΑΦΜ (9 ψηφία)",
      passportLabel: "Διαβατήριο",
      bookingRefLabel: "Κωδικός κράτησης (προαιρετικό)",
      lastNameLabel: "Επώνυμο (προαιρετικό)",
      continueBtn: "Συνέχεια",
      noBookingYet: "Δεν έχετε κράτηση;",
      ctaStartBooking: "Ξεκινήστε κράτηση",
      goHome: "Μετάβαση στην Αρχική",
      rememberMe: "Να με θυμάσαι σε αυτή τη συσκευή",
      
      alreadyRegistered: "Έχετε ήδη εγγραφεί;",
      newHere: "Νέος/α εδώ;",
      signInCta: "Σύνδεση",
      signUpCta: "Εγγραφή",
      hints: {
        phone: "Συμπεριλάβετε κωδικό χώρας (π.χ. +30 69…)",
        afm: "9 ψηφία",
        passport: "Μόνο γράμματα και αριθμοί."
      },
      validation: {
        phoneRequired: "Απαιτείται τηλέφωνο",
        phoneInvalid: "Εισάγετε έγκυρο τηλέφωνο με κωδικό χώρας (π.χ., +30…)",
        afmRequired: "Απαιτείται ΑΦΜ",
        afmInvalid: "Το ΑΦΜ πρέπει να έχει 9 ψηφία",
        passportRequired: "Απαιτείται αριθμός διαβατηρίου",
        passportInvalid: "Χρησιμοποιήστε 5–20 γράμματα ή αριθμούς"
      }
    }
    ,checkin: {
      title: "Άφιξη",
      summary: "Σύνοψη κράτησης",
      bookingId: "Κωδικός κράτησης",
      reference: "Αναφορά",
      source: "Πηγή",
      phone: "Τηλέφωνο",
      dates: "Ημερομηνίες",
      room: "Δωμάτιο",
      arrivalTime: "Ώρα άφιξης",
      arrivalTimeInvalid: "Παρακαλώ εισάγετε έγκυρη ώρα (ΩΩ:λλ)",
      specialRequests: "Ειδικά αιτήματα",
      acceptTerms: "Επιβεβαιώνω ότι τα στοιχεία είναι σωστά και αποδέχομαι τους όρους",
      submit: "Ολοκλήρωση Άφιξης",
      submitted: "Η άφιξη ολοκληρώθηκε",
      saving: "Γίνεται αποθήκευση…",
      loading: "Φόρτωση κράτησης…",
    }
  },
};

export function getDictionary(locale: Locale): Dictionary {
  return dict[locale] ?? dict.en;
}
