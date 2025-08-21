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
  cta: {
    call: string;
    directions: string;
    website: string;
    reserve: string;
    home: string;
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
    cta: {
      call: "Call",
      directions: "Directions",
      website: "Website",
      reserve: "Reserve",
      home: "Home",
    },
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
    cta: {
      call: "Κλήση",
      directions: "Οδηγίες",
      website: "Ιστότοπος",
      reserve: "Κράτηση",
      home: "Αρχική",
    },
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
