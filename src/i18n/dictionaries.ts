import type { Locale } from "./config";

export type Dictionary = {
  appTitle: string;
  homeTitle: string;
  homeSubtitle: string;
  backHome: string;
  details: string;
  emptyState: string;
  itemSingular: string;
  itemPlural: string;
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
  };
  categories: {
    phones: string;
    restaurants: string;
    sightseeing: string;
  };
};

const dict: Record<Locale, Dictionary> = {
  en: {
    appTitle: "Guest Guide",
    homeTitle: "Your Guest Guide",
    homeSubtitle: "Curated essentials: phones, restaurants, and sightseeing.",
    backHome: "← Back home",
    details: "Details →",
  emptyState: "No items yet.",
  itemSingular: "item",
  itemPlural: "items",
  search: { where: "Where", addLocation: "Add location", dates: "Dates", addDates: "Add dates", guestsLabel: "Guests", guestSingular: "guest", guestPlural: "guests", search: "Search" },
  ui: { filters: "Filters", map: "Map", list: "List", resetAll: "Reset All", activeTags: "Active Tags", none: "None" },
    cta: {
      call: "Call",
      directions: "Directions",
      website: "Website",
      reserve: "Reserve",
      home: "Home",
    },
  labels: { updated: "Updated", save: "Save", saved: "Saved", favorites: "Favorites" },
    categories: {
      phones: "Important Phones",
      restaurants: "Restaurants",
      sightseeing: "Sightseeing",
    },
  },
  el: {
    appTitle: "Οδηγός Επισκεπτών",
    homeTitle: "Ο οδηγός σας",
    homeSubtitle: "Τα απαραίτητα: τηλέφωνα, εστιατόρια και αξιοθέατα.",
    backHome: "← Πίσω στην αρχική",
    details: "Λεπτομέρειες →",
  emptyState: "Δεν υπάρχουν στοιχεία ακόμη.",
  itemSingular: "στοιχείο",
  itemPlural: "στοιχεία",
  search: { where: "Προορισμός", addLocation: "Προσθήκη τοποθεσίας", dates: "Ημερομηνίες", addDates: "Προσθήκη ημερομηνιών", guestsLabel: "Επισκέπτες", guestSingular: "επισκέπτης", guestPlural: "επισκέπτες", search: "Αναζήτηση" },
  ui: { filters: "Φίλτρα", map: "Χάρτης", list: "Λίστα", resetAll: "Επαναφορά", activeTags: "Ενεργές Ετικέτες", none: "Κανένα" },
    cta: {
      call: "Κλήση",
      directions: "Οδηγίες",
      website: "Ιστότοπος",
      reserve: "Κράτηση",
      home: "Αρχική",
    },
  labels: { updated: "Ενημερώθηκε", save: "Αποθήκευση", saved: "Αποθηκεύτηκε", favorites: "Αγαπημένα" },
    categories: {
      phones: "Σημαντικά Τηλέφωνα",
      restaurants: "Εστιατόρια",
      sightseeing: "Αξιοθέατα",
    },
  },
};

export function getDictionary(locale: Locale): Dictionary {
  return dict[locale] ?? dict.en;
}
