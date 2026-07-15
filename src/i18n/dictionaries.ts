/**
 * Unified Dictionary - Combines all domain translations.
 * 
 * This file merges domain-specific translations into a single Dictionary type
 * for backward compatibility while keeping translations organized by feature.
 * 
 * @see ./domains/ for individual domain files
 */

import type { Locale } from "./config";

// Import domain types
import type {
  CommonDictionary,
  HouseDictionary,
  LocationPanelDictionary,
  BookingDictionary,
  CheckinDictionary,
  CheckinInfoDictionary,
  PortalDictionary,
  ContactDictionary,
  AboutDictionary
} from './domains';

// Import domain translations
import { commonTranslations } from './domains/common';
import { houseTranslations, locationPanelTranslations } from './domains/house';
import { bookingTranslations } from './domains/booking';
import { checkinTranslations, checkinInfoTranslations } from './domains/checkin';
import { portalTranslations, contactTranslations } from './domains/portal';
import { aboutTranslations } from './domains/about';

// ============================================================================
// Combined Dictionary Type
// ============================================================================

/**
 * Full dictionary type combining all domains.
 * This maintains backward compatibility with existing code.
 */
export type Dictionary = CommonDictionary & {
  house?: HouseDictionary;
  locationPanel?: LocationPanelDictionary;
  booking?: BookingDictionary;
  checkin?: CheckinDictionary;
  checkinInfo?: CheckinInfoDictionary;
  portal?: PortalDictionary;
  contact?: ContactDictionary;
  about?: AboutDictionary;
};

// ============================================================================
// Dictionary Merger
// ============================================================================

/**
 * Merges all domain translations for a given locale.
 */
function mergeDictionary(locale: Locale): Dictionary {
  return {
    // Common domain (spread at top level)
    ...commonTranslations[locale],
    // Feature domains (nested)
    house: houseTranslations[locale],
    locationPanel: locationPanelTranslations[locale],
    booking: bookingTranslations[locale],
    checkin: checkinTranslations[locale],
    checkinInfo: checkinInfoTranslations[locale],
    portal: portalTranslations[locale],
    contact: contactTranslations[locale],
    about: aboutTranslations[locale],
  };
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }

  return value;
}

// Pre-build dictionaries for performance
const dictionaries: Record<Locale, Dictionary> = deepFreeze({
  en: mergeDictionary('en'),
  el: mergeDictionary('el'),
});

// ============================================================================
// Public API
// ============================================================================

/**
 * Gets the dictionary for a given locale.
 * Returns an immutable canonical dictionary.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}
