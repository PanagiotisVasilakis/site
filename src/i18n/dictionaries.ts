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
    intro: string;
    overview: string;
    amenities: string;
    rules: string;
    checkin: string;
    emergency: string;
    amenityList: string[]; // pre-translated bullet list
    rulesList: string[];   // house rules bullets
  photoAlts?: { living: string; bedroom: string; kitchen: string; };
  };
};

const dict: Record<Locale, Dictionary> = {
  en: {
    appTitle: "Guest Guide",
    homeTitle: "Your Guest Guide",
    homeSubtitle: "Curated essentials: phones, restaurants, and sightseeing.",
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
      navLabel: "House Info",
      navSubtitle: "Photos, amenities & rules",
      title: "Guest House Info",
      intro: "Practical details, amenities and a quick photo tour.",
      overview: "Overview",
      amenities: "Amenities",
      rules: "House Rules",
      checkin: "Check-in / Check-out",
      emergency: "Emergency & Support",
      amenityList: [
        "Fast Wi‑Fi",
        "Air conditioning / heating",
        "Fully equipped kitchen",
        "Washer & basic detergents",
        "Fresh linens & towels",
        "Smart TV with streaming apps",
        "Dedicated workspace"
      ],
      rulesList: [
        "No smoking inside",
        "No parties or events",
        "Quiet hours after 22:00",
        "Report any damage promptly"
  ],
  photoAlts: { living: 'Living area', bedroom: 'Bedroom', kitchen: 'Kitchen' }
    },
  },
  el: {
    appTitle: "Οδηγός Επισκεπτών",
    homeTitle: "Ο οδηγός σας",
    homeSubtitle: "Τα απαραίτητα: τηλέφωνα, εστιατόρια και αξιοθέατα.",
    backHome: "← Πίσω στην αρχική",
  skipLink: "Μετάβαση στο περιεχόμενο",
    details: "Λεπτομέρειες →",
  emptyState: "Δεν υπάρχουν στοιχεία ακόμη.",
  itemSingular: "στοιχείο",
  itemPlural: "στοιχεία",
  search: { where: "Προορισμός", addLocation: "Προσθήκη τοποθεσίας", dates: "Ημερομηνίες", addDates: "Προσθήκη ημερομηνιών", guestsLabel: "Επισκέπτες", guestSingular: "επισκέπτης", guestPlural: "επισκέπτες", search: "Αναζήτηση" },
  ui: { filters: "Φίλτρα", map: "Χάρτης", list: "Λίστα", resetAll: "Επαναφορά", activeTags: "Ενεργές Ετικέτες", none: "Κανένα" },
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
      navLabel: "Πληροφορίες Σπιτιού",
      navSubtitle: "Φωτογραφίες, παροχές & κανόνες",
      title: "Πληροφορίες Ξενώνα",
      intro: "Χρήσιμες λεπτομέρειες, παροχές και μια γρήγορη περιήγηση.",
      overview: "Επισκόπηση",
      amenities: "Παροχές",
      rules: "Κανόνες Σπιτιού",
      checkin: "Άφιξη / Αναχώρηση",
      emergency: "Έκτακτη Ανάγκη & Υποστήριξη",
      amenityList: [
        "Γρήγορο Wi‑Fi",
        "Κλιματισμός / Θέρμανση",
        "Πλήρως εξοπλισμένη κουζίνα",
        "Πλυντήριο & βασικά απορρυπαντικά",
        "Καθαρά σεντόνια & πετσέτες",
        "Smart TV με εφαρμογές streaming",
        "Χώρος εργασίας"
      ],
      rulesList: [
        "Απαγορεύεται το κάπνισμα μέσα",
        "Όχι πάρτι ή εκδηλώσεις",
        "Ήσυχες ώρες μετά τις 22:00",
        "Αναφέρετε άμεσα τυχόν ζημιές"
  ],
  photoAlts: { living: 'Καθιστικό', bedroom: 'Υπνοδωμάτιο', kitchen: 'Κουζίνα' }
    },
  },
};

export function getDictionary(locale: Locale): Dictionary {
  return dict[locale] ?? dict.en;
}
