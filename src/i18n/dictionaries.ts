/**
 * Unified Dictionary - Combines all domain translations.
 * 
 * This file merges domain-specific translations into the single Dictionary type
 * used by the app, while keeping translations organized by feature.
 * 
 * @see ./domains/ for individual domain files
 */

import type { Locale } from "./config";

// Import domain types
import type {
  CommonDictionary,
  HouseDictionary,
  LocationPanelDictionary,
  CheckinDictionary,
  CheckinInfoDictionary,
  PortalDictionary,
  AvailabilityDictionary,
  ShellDictionary,
  HomeDictionary,
  LegalDictionary,
  GuideDictionary,
  StayDictionary
} from './domains';

// Import domain translations
import { commonTranslations } from './domains/common';
import { houseTranslations, locationPanelTranslations } from './domains/house';
import { checkinTranslations, checkinInfoTranslations } from './domains/checkin';
import { portalTranslations } from './domains/portal';
import { availabilityTranslations } from './domains/availability';
import { shellTranslations } from './domains/shell';
import { homeTranslations } from './domains/home';
import { legalTranslations } from './domains/legal';
import { guideTranslations } from './domains/guide';
import { stayTranslations } from './domains/stay';

// ============================================================================
// Combined Dictionary Type
// ============================================================================

/**
 * Full dictionary type combining all domains.
 */
export type Dictionary = CommonDictionary & {
  house: HouseDictionary;
  locationPanel: LocationPanelDictionary;
  checkin: CheckinDictionary;
  checkinInfo: CheckinInfoDictionary;
  portal: PortalDictionary;
  availability: AvailabilityDictionary;
  shell: ShellDictionary;
  home: HomeDictionary;
  legal: LegalDictionary;
  guide: GuideDictionary;
  stay: StayDictionary;
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
    checkin: checkinTranslations[locale],
    checkinInfo: checkinInfoTranslations[locale],
    portal: portalTranslations[locale],
    availability: availabilityTranslations[locale],
    shell: shellTranslations[locale],
    home: homeTranslations[locale],
    legal: legalTranslations[locale],
    guide: guideTranslations[locale],
    stay: stayTranslations[locale],
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
