/**
 * Site shell translations (identity §8: SiteHeader, MobileMenu, SiteFooter, LanguageSwitch,
 * ThemeSwitch, MotionSwitch). The copy is the owner-approved R3-C1 text.
 */

import type { Locale } from '../config';

export interface ShellDictionary {
    brandPlace: string;
    navApartment: string;
    navAvailability: string;
    navGuide: string;
    navContact: string;
    checkDates: string;
    menuTitle: string;
    footerNavigation: string;
    footerContact: string;
    footerStay: string;
    language: string;
    theme: string;
    themeAuto: string;
    themeDay: string;
    themeNight: string;
    switchToNight: string;
    switchToDay: string;
    reduceMotion: string;
    allowMotion: string;
    motionReducedByDevice: string;
    whatsapp: string;
    instagram: string;
}

export const shellTranslations: Record<Locale, ShellDictionary> = {
    en: {
        brandPlace: "Kalamata",
        navApartment: "Apartment",
        navAvailability: "Availability",
        navGuide: "Kalamata guide",
        navContact: "Contact",
        checkDates: "Check dates",
        menuTitle: "Menu",
        footerNavigation: "Footer",
        footerContact: "Contact",
        footerStay: "Staying with us now? Your stay",
        language: "Language",
        theme: "Theme",
        themeAuto: "Auto",
        themeDay: "Day",
        themeNight: "Night",
        switchToNight: "Switch to night",
        switchToDay: "Switch to day",
        reduceMotion: "Reduce motion",
        allowMotion: "Allow motion",
        motionReducedByDevice: "Reduced by your device settings",
        whatsapp: "WhatsApp",
        instagram: "Instagram",
    },
    el: {
        brandPlace: "Καλαμάτα",
        navApartment: "Διαμέρισμα",
        navAvailability: "Διαθεσιμότητα",
        navGuide: "Οδηγός Καλαμάτας",
        navContact: "Επικοινωνία",
        checkDates: "Δείτε ημερομηνίες",
        menuTitle: "Μενού",
        footerNavigation: "Υποσέλιδο",
        footerContact: "Επικοινωνία",
        footerStay: "Μένετε ήδη μαζί μας; Η διαμονή σας",
        language: "Γλώσσα",
        theme: "Θέμα",
        themeAuto: "Αυτόματο",
        themeDay: "Ημέρα",
        themeNight: "Νύχτα",
        switchToNight: "Αλλαγή σε νυχτερινό",
        switchToDay: "Αλλαγή σε ημερήσιο",
        reduceMotion: "Λιγότερη κίνηση",
        allowMotion: "Επαναφορά κίνησης",
        motionReducedByDevice: "Μειωμένη από τις ρυθμίσεις της συσκευής σας",
        whatsapp: "WhatsApp",
        instagram: "Instagram",
    },
};
