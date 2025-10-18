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
    arrivalLabel?: string;
    arrivalPlaceholder?: string;
    departureLabel?: string;
    departurePlaceholder?: string;
  };
  ui?: {
    filters: string;
    map: string;
    list: string;
    resetAll: string;
    activeTags: string;
    none: string;
    back?: string;
    signIn?: string;
    signOut?: string;
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
    apartmentTitle: string;
    city: string;
    blurb: string;
    nearby: string;
    attractions: string[];
    howToEnableMapTitle: string;
    howToEnableSteps: string[];
  };
  map?: {
    loading: string;
    apartmentMarkerTitle: string;
    apartmentMarkerDesc: string;
    viewDetails: string;
    failed: string;
    tokenMissing: string;
    deferredInteractiveLabel: string;
    travelPrompt: string;
  };
  checkin?: {
    navLabel?: string;
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
  checkinInfo?: {
    welcome?: string;
    welcomeMessage?: string;
    checkInOutTitle?: string;
    checkInTime?: string;
    checkOutTime?: string;
    wifiTitle?: string;
    wifiNetwork?: string;
    wifiPassword?: string;
    copy?: string;
    copied?: string;
    emergencyTitle?: string;
    hostContact?: string;
    hostName?: string;
    emergencyServices?: string;
    police?: string;
    localHospital?: string;
    houseRulesTitle?: string;
    rule1?: string;
    rule2?: string;
    rule3?: string;
    rule4?: string;
    rule5?: string;
    amenitiesTitle?: string;
    ac?: string;
    heating?: string;
    kitchen?: string;
    washer?: string;
    parking?: string;
    pool?: string;
    tipsTitle?: string;
    tip1?: string;
    tip2?: string;
    tip3?: string;
    tip4?: string;
    additionalTitle?: string;
    keysInfo?: string;
    keysDetail?: string;
    trashInfo?: string;
    trashDetail?: string;
    waterInfo?: string;
    waterDetail?: string;
    tvInfo?: string;
    tvDetail?: string;
  };
  portal?: {
    introTitle?: string;
    introSubtitle?: string;
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
    or?: string;
  // verifyingBtn removed (direct verification only)
    noBookingYet: string;
    alreadyBooked?: string;
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
  search: {
    where: "Where",
    addLocation: "Add location",
    dates: "Dates",
    addDates: "Add dates",
    guestsLabel: "Guests",
    guestSingular: "guest",
    guestPlural: "guests",
    search: "Search",
    arrivalLabel: "Arrival",
    departureLabel: "Departure",
    arrivalPlaceholder: "Select arrival",
    departurePlaceholder: "Select departure"
  },
  ui: { filters: "Filters", map: "Map", list: "List", resetAll: "Reset All", activeTags: "Active Tags", none: "None", back: "Back", signIn: "Sign in", signOut: "Sign out" },
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
      restaurants: "Kalamata Moments",
      sightseeing: "Sightseeing",
    },
    house: {
  navLabel: "Apartment Photos",
      navSubtitle: "Photo tour & location",
      title: "2-Bedroom Apartment with Mountain & Sea Views",
      location: "Kalamata, Greece",
  intro: "A spacious apartment with large sunny terraces and beautiful views, in a quiet neighborhood near the Town Hall.",
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
  title: "Apartment Location & Nearby Attractions",
      apartmentTitle: "2-Bedroom Apartment with Views",
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
        "Make sure JavaScript is enabled in your browser",
        "Pan or zoom the map to explore the neighborhood",
        "Tap a marker to open details and travel times"
      ]
    }
    ,map: {
      loading: "Loading map...",
  apartmentMarkerTitle: "Seaside Modern Apartment",
      apartmentMarkerDesc: "Your accommodation",
      viewDetails: "View details",
      failed: "Map failed to load",
      tokenMissing: "Interactive map temporarily unavailable",
      deferredInteractiveLabel: "Interactive map loads once it's in view to keep things speedy.",
      travelPrompt: "Tap a marker to calculate travel time."
    },
    portal: {
      introTitle: "How can we help with your stay?",
      introSubtitle: "Choose what you would like to do next.",
      signInTitle: "Sign‑in",
      signUpTitle: "Sign‑up",
      originQuestion: "Where are you coming from?",
      originGR: "Greece",
      originAbroad: "World",
  phoneLabel: "Phone Number",
      afmLabel: "AFM (9 digits)",
  passportLabel: "Passport Number",
      bookingRefLabel: "Booking reference (optional)",
      lastNameLabel: "Last name (optional)",
      continueBtn: "Continue",
      or: "or",
      noBookingYet: "No booking yet?",
      alreadyBooked: "Booking & Check-in Details",
      ctaStartBooking: "Start here",
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
      navLabel: "Check-in",
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
    ,checkinInfo: {
  welcome: "🎉 Welcome to Our Apartment!",
      welcomeMessage: "We're delighted to have you here. Below you'll find everything you need for a comfortable stay.",
      checkInOutTitle: "Check-in & Check-out",
      checkInTime: "Check-in",
      checkOutTime: "Check-out",
      wifiTitle: "WiFi Connection",
      wifiNetwork: "Network Name",
      wifiPassword: "Password",
      copy: "Copy",
      copied: "Copied",
      emergencyTitle: "Emergency Contacts",
      hostContact: "Host (24/7)",
      hostName: "Available anytime",
      emergencyServices: "Emergency Services",
      police: "Police, Fire, Ambulance",
      localHospital: "Local Hospital",
      houseRulesTitle: "House Rules",
      rule1: "Quiet hours: 23:00 - 08:00",
      rule2: "No smoking inside the property",
      rule3: "Maximum capacity: 6 guests",
      rule4: "Please respect the neighborhood",
      rule5: "Pets allowed with prior approval",
      amenitiesTitle: "Key Amenities",
      ac: "Air Conditioning",
      heating: "Heating",
      kitchen: "Full Kitchen",
      washer: "Washer/Dryer",
      parking: "Free Parking",
      pool: "Swimming Pool",
      tipsTitle: "Local Tips",
      tip1: "The nearest beach is just 5 minutes walk away",
      tip2: "Supermarket \"AB Vassilopoulos\" is 300m away, open 8:00-21:00",
      tip3: "Check our restaurant recommendations in the main menu",
      tip4: "Need a taxi? Call +30 2721 023456 or use the Taxi app",
      additionalTitle: "Good to Know",
      keysInfo: "Keys:",
      keysDetail: "Please leave keys in the lockbox when checking out",
      trashInfo: "Trash:",
      trashDetail: "Recycling bins are located near the main entrance",
      waterInfo: "Water:",
      waterDetail: "Tap water is safe to drink",
      tvInfo: "Entertainment:",
      tvDetail: "Smart TV with Netflix and YouTube available"
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
  search: {
    where: "Προορισμός",
    addLocation: "Προσθήκη τοποθεσίας",
    dates: "Ημερομηνίες",
    addDates: "Προσθήκη ημερομηνιών",
    guestsLabel: "Επισκέπτες",
    guestSingular: "επισκέπτης",
    guestPlural: "επισκέπτες",
    search: "Αναζήτηση",
    arrivalLabel: "Άφιξη",
    departureLabel: "Αναχώρηση",
    arrivalPlaceholder: "Επιλογή άφιξης",
    departurePlaceholder: "Επιλογή αναχώρησης"
  },
  ui: { filters: "Φίλτρα", map: "Χάρτης", list: "Λίστα", resetAll: "Επαναφορά", activeTags: "Ενεργές Ετικέτες", none: "Κανένα", back: "Πίσω", signIn: "Σύνδεση", signOut: "Αποσύνδεση" },
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
      restaurants: "Η Καλαματα μας",
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
        instructions: "Χειρισμός προβολής: Χρησιμοποιήστε τα βελάκια για εναλλαγή εικόνων, Home/End για μετάβαση στην πρώτη/τελευταία, Escape για κλείσιμο.",
        counter: "Προβάλλεται η εικόνα {current} από {total}.",
        prev: "Προηγούμενη εικόνα",
        next: "Επόμενη εικόνα",
        close: "Κλείσιμο προβολής"
      },
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
  apartmentTitle: "Διαμέρισμα 2 Υπνοδωματίων με Θέα",
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
        "Βεβαιωθείτε ότι η JavaScript είναι ενεργοποιημένη στο πρόγραμμα περιήγησης",
        "Μετακινήστε ή μεγεθύνετε τον χάρτη για να εξερευνήσετε τη γειτονιά",
        "Πατήστε έναν δείκτη για να δείτε λεπτομέρειες και χρόνους διαδρομής"
      ]
    }
    ,map: {
      loading: "Φόρτωση χάρτη...",
    apartmentMarkerTitle: "Σύγχρονο Διαμέρισμα κοντά στη Θάλασσα",
        apartmentMarkerDesc: "Το κατάλυμά σας",
      viewDetails: "Προβολή λεπτομερειών",
      failed: "Αποτυχία φόρτωσης χάρτη",
      tokenMissing: "Ο διαδραστικός χάρτης είναι προσωρινά μη διαθέσιμος",
      deferredInteractiveLabel: "Ο διαδραστικός χάρτης φορτώνει όταν εμφανιστεί για καλύτερη απόδοση.",
      travelPrompt: "Πατήστε έναν δείκτη για να υπολογίσουμε τον χρόνο διαδρομής."
    },
    portal: {
      introTitle: "Πώς μπορούμε να βοηθήσουμε με τη διαμονή σας;",
      introSubtitle: "Επιλέξτε τι θέλετε να κάνετε στη συνέχεια.",
      signInTitle: "Σύνδεση",
      signUpTitle: "Εγγραφή",
      originQuestion: "Από πού έρχεστε;",
      originGR: "Ελλάδα",
      originAbroad: "Κόσμος",
  phoneLabel: "Αριθμός Τηλεφώνου",
      afmLabel: "ΑΦΜ (9 ψηφία)",
  passportLabel: "Αριθμός Διαβατηρίου",
      bookingRefLabel: "Κωδικός κράτησης (προαιρετικό)",
      lastNameLabel: "Επώνυμο<br/>(προαιρετικό)",
      continueBtn: "Συνέχεια",
      or: "ή",
      noBookingYet: "Δεν έχετε κράτηση;",
      alreadyBooked: "Κράτηση & Στοιχεία Check-in",
      ctaStartBooking: "Ξεκινήστε εδώ",
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
      navLabel: "Άφιξη",
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
    ,checkinInfo: {
  welcome: "🎉 Καλώς Ήρθατε στο Διαμέρισμά μας!",
      welcomeMessage: "Χαιρόμαστε που είστε εδώ. Παρακάτω θα βρείτε όλα όσα χρειάζεστε για μια άνετη διαμονή.",
      checkInOutTitle: "Άφιξη & Αναχώρηση",
      checkInTime: "Άφιξη",
      checkOutTime: "Αναχώρηση",
      wifiTitle: "Σύνδεση WiFi",
      wifiNetwork: "Όνομα Δικτύου",
      wifiPassword: "Κωδικός",
      copy: "Αντιγραφή",
      copied: "Αντιγράφηκε",
      emergencyTitle: "Επαφές Έκτακτης Ανάγκης",
      hostContact: "Οικοδεσπότης (24/7)",
      hostName: "Διαθέσιμος ανά πάσα στιγμή",
      emergencyServices: "Υπηρεσίες Έκτακτης Ανάγκης",
      police: "Αστυνομία, Πυροσβεστική, Ασθενοφόρο",
      localHospital: "Τοπικό Νοσοκομείο",
      houseRulesTitle: "Κανόνες Οικίας",
      rule1: "Ώρες ησυχίας: 23:00 - 08:00",
      rule2: "Απαγορεύεται το κάπνισμα μέσα στο ακίνητο",
      rule3: "Μέγιστη χωρητικότητα: 6 άτομα",
      rule4: "Παρακαλούμε σεβαστείτε τη γειτονιά",
      rule5: "Κατοικίδια επιτρέπονται με προηγούμενη έγκριση",
      amenitiesTitle: "Βασικές Ανέσεις",
      ac: "Κλιματισμός",
      heating: "Θέρμανση",
      kitchen: "Πλήρης Κουζίνα",
      washer: "Πλυντήριο/Στεγνωτήριο",
      parking: "Δωρεάν Πάρκινγκ",
      pool: "Πισίνα",
      tipsTitle: "Τοπικές Συμβουλές",
      tip1: "Η πλησιέστερη παραλία απέχει μόλις 5 λεπτά με τα πόδια",
      tip2: "Το σούπερ μάρκετ \"AB Βασιλόπουλος\" απέχει 300μ, ανοιχτό 8:00-21:00",
      tip3: "Δείτε τις προτάσεις μας για εστιατόρια στο κύριο μενού",
      tip4: "Χρειάζεστε ταξί; Καλέστε +30 2721 023456 ή χρησιμοποιήστε την εφαρμογή Taxi",
      additionalTitle: "Καλό να Γνωρίζετε",
      keysInfo: "Κλειδιά:",
      keysDetail: "Παρακαλούμε αφήστε τα κλειδιά στο lockbox κατά την αναχώρηση",
      trashInfo: "Σκουπίδια:",
      trashDetail: "Οι κάδοι ανακύκλωσης βρίσκονται κοντά στην κεντρική είσοδο",
      waterInfo: "Νερό:",
      waterDetail: "Το νερό της βρύσης είναι πόσιμο",
      tvInfo: "Ψυχαγωγία:",
      tvDetail: "Smart TV με Netflix και YouTube διαθέσιμα"
    }
  },
};

export function getDictionary(locale: Locale): Dictionary {
  return dict[locale] ?? dict.en;
}
