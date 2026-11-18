/** The app's Dictionary: the domain translations of ./domains merged per locale. */

import type { Locale } from "./config";

import { commonTranslations, type CommonDictionary } from './domains/common';
import { houseTranslations, locationPanelTranslations, type HouseDictionary, type LocationPanelDictionary } from './domains/house';
import { checkinTranslations, checkinInfoTranslations, type CheckinDictionary, type CheckinInfoDictionary } from './domains/checkin';
import { portalTranslations, type PortalDictionary } from './domains/portal';
import { availabilityTranslations, type AvailabilityDictionary } from './domains/availability';
import { shellTranslations, type ShellDictionary } from './domains/shell';
import { homeTranslations, type HomeDictionary } from './domains/home';
import { legalTranslations, type LegalDictionary } from './domains/legal';
import { guideTranslations, type GuideDictionary } from './domains/guide';
import { stayTranslations, type StayDictionary } from './domains/stay';

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

function mergeDictionary(locale: Locale): Dictionary {
  return {
    ...commonTranslations[locale],
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

/**
 * Gets the dictionary for a given locale.
 * Returns an immutable canonical dictionary.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}
