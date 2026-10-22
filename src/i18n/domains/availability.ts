/**
 * Availability page translations (/[locale]/availability).
 * Placeholders in braces are replaced by the page: {count}, {nights}, {date},
 * {max}, {time}, {checkin}, {checkout}.
 */

import type { StayRejection } from '@/lib/availability/stayQuote';

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export interface AvailabilityDictionary {
    /** Back link to the apartment page. */
    backToApartment: string;
    title: string;
    intro: string;
    metaDescription: string;
    plannerTitle: string;
    calendarLabel: string;
    legendTitle: string;
    legend: {
        free: string;
        booked: string;
        /** Shown only while a free night is too short to start a stay (see `day.tooShort`). */
        tooShort: string;
        selected: string;
    };
    /** Parts of a day's accessible name, after the full date. */
    day: {
        today: string;
        booked: string;
        selected: string;
        /** The first booked night after the check-in: a stay may end on it. */
        checkOutOnly: string;
        /** Its short visible label inside the day cell. */
        out: string;
        /** A free night that cannot start a stay because the minimum stay does not fit. `{nights}`: that minimum. */
        tooShort: string;
    };
    prompts: {
        checkIn: string;
        /** `{date}`: the latest check-out day. */
        checkOut: string;
        /** `{nights}` */
        minimumStay: string;
        /** `{booked}` (the booked night crossed) and `{date}` (the new check-in). */
        crossing: string;
    };
    clearDates: string;
    showMoreMonths: string;
    previousMonths: string;
    nextMonths: string;
    /** `{count}`; chosen with Intl.PluralRules. */
    nights: {
        one: string;
        other: string;
    };
    summary: {
        title: string;
        empty: string;
        checkIn: string;
        checkOut: string;
        guests: string;
        trust: string;
    };
    /** The static list of the next nights for browsers without JavaScript. */
    noJs: {
        title: string;
    };
    /** `{max}` (max_nights) and `{nights}` (min_nights). */
    rejections: Record<StayRejection, string>;
    status: {
        /** `{time}` */
        lastUpdated: string;
        notConfigured: string;
        unavailable: string;
    };
    booking: {
        bookingCom: string;
        opensInNewTab: string;
        call: string;
        whatsapp: string;
        /** Only `{checkin}` and `{checkout}`: nothing else about the guest is sent. */
        whatsappMessage: string;
    };
    howToBookTitle: string;
    /** Three steps: the home FAQ shows the last one (the arrival sentence). */
    howToBook: string[];
    /** Shown only when the Booking.com listing link is valid. */
    howToBookBookingCom: string;
    contactTitle: string;
    contactIntro: string;
    phoneLabel: string;
    emailLabel: string;
    whatsappLabel: string;
}

// ============================================================================
// Translations
// ============================================================================

export const availabilityTranslations: Record<Locale, AvailabilityDictionary> = {
    en: {
        backToApartment: "The apartment",
        title: "Free dates",
        intro: "Choose your check-in night, then your check-out day.",
        metaDescription: "Free nights for the apartment in Kalamata, and how to book.",
        plannerTitle: "Choose your dates",
        calendarLabel: "Availability calendar",
        legendTitle: "Reading the calendar",
        legend: {
            free: "Free night",
            booked: "Booked: the date is crossed out",
            tooShort: "Free, but the minimum stay does not fit: dashed outline",
            selected: "Your stay: highlighted from check-in to check-out",
        },
        day: {
            today: "Today",
            booked: "booked",
            selected: "selected",
            checkOutOnly: "check-out only",
            out: "out",
            tooShort: "free, but a stay must be at least {nights}",
        },
        prompts: {
            checkIn: "Choose your check-in night.",
            checkOut: "Now choose your check-out day, at the latest {date}.",
            minimumStay: "Minimum stay from this check-in: {nights}.",
            crossing: "{booked} is booked, so {date} is your new check-in.",
        },
        clearDates: "Clear dates",
        showMoreMonths: "Show 3 more months",
        previousMonths: "Previous months",
        nextMonths: "Next months",
        nights: {
            one: "{count} night",
            other: "{count} nights",
        },
        summary: {
            title: "Your stay",
            empty: "Pick your dates.",
            checkIn: "Check-in",
            checkOut: "Check-out",
            guests: "Up to 4 guests",
            trust: "You pay nothing on this site.", // legal review
        },
        noJs: {
            title: "The next 60 nights",
        },
        rejections: {
            invalid: "Those dates are not valid. Choose a check-in night and a later check-out day.",
            past: "That check-in date has passed. Choose new dates.",
            beyond_horizon: "Those dates are beyond the calendar shown here. Call us or send a WhatsApp message.",
            max_nights: "A stay can be at most {max} nights. For a longer stay, call us or send a WhatsApp message.",
            blocked: "Some of those nights are already booked. Choose other dates.",
            min_nights: "The minimum stay from this check-in is {nights}.",
        },
        status: {
            lastUpdated: "Availability last updated: {time}",
            notConfigured: "Free dates are not shown on this page yet. Please call us or send a WhatsApp message.",
            unavailable: "Free dates cannot be shown right now. Please call us or send a WhatsApp message.",
        },
        booking: {
            bookingCom: "Book on Booking.com", // legal review
            opensInNewTab: "(opens in a new tab)",
            call: "Call",
            whatsapp: "WhatsApp",
            whatsappMessage: "Hello! Is the apartment free from {checkin} to {checkout}?",
        },
        howToBookTitle: "How to book",
        howToBook: [
            "Choose your check-in night and check-out day in the calendar.",
            "Call us or send a WhatsApp message with your dates: we confirm availability and the arrival details with you.",
            "Arrival instructions are shared with you before check-in.",
        ],
        // TODO (owner): wording; no payment or confirmation claim for Booking.com until the owner confirms the Booking.com settings.
        howToBookBookingCom: "Book the same dates on Booking.com.", // legal review
        contactTitle: "Contact",
        contactIntro: "Questions about dates? We are happy to help.",
        phoneLabel: "Phone",
        emailLabel: "E-mail",
        whatsappLabel: "Message us on WhatsApp",
    },
    el: {
        backToApartment: "Το διαμέρισμα",
        title: "Διαθεσιμότητα",
        intro: "Επιλέξτε τη νύχτα άφιξης και μετά την ημέρα αναχώρησης.",
        metaDescription: "Ελεύθερες νύχτες για το διαμέρισμα στην Καλαμάτα, και πώς να κάνετε κράτηση.",
        plannerTitle: "Επιλέξτε ημερομηνίες",
        calendarLabel: "Ημερολόγιο διαθεσιμότητας",
        legendTitle: "Πώς διαβάζεται το ημερολόγιο",
        legend: {
            free: "Ελεύθερη νύχτα",
            booked: "Κρατημένη: η ημερομηνία είναι διαγραμμένη",
            tooShort: "Ελεύθερη, αλλά δεν χωράει η ελάχιστη διαμονή: διακεκομμένο περίγραμμα",
            selected: "Η διαμονή σας: επισημαίνεται από την άφιξη ως την αναχώρηση",
        },
        day: {
            today: "Σήμερα",
            booked: "κρατημένη",
            selected: "επιλεγμένη",
            checkOutOnly: "μόνο αναχώρηση",
            out: "αναχ.",
            tooShort: "ελεύθερη, αλλά η διαμονή πρέπει να είναι τουλάχιστον {nights}",
        },
        prompts: {
            checkIn: "Επιλέξτε τη νύχτα άφιξης.",
            checkOut: "Τώρα επιλέξτε την ημέρα αναχώρησης, το αργότερο {date}.",
            minimumStay: "Ελάχιστη διαμονή με αυτή την άφιξη: {nights}.",
            crossing: "{booked}: κρατημένη. Νέα άφιξη: {date}.",
        },
        clearDates: "Καθαρισμός ημερομηνιών",
        showMoreMonths: "Εμφάνιση 3 ακόμη μηνών",
        previousMonths: "Προηγούμενοι μήνες",
        nextMonths: "Επόμενοι μήνες",
        nights: {
            one: "{count} νύχτα",
            other: "{count} νύχτες",
        },
        summary: {
            title: "Η διαμονή σας",
            empty: "Επιλέξτε ημερομηνίες.",
            checkIn: "Άφιξη",
            checkOut: "Αναχώρηση",
            guests: "Έως 4 επισκέπτες",
            trust: "Σε αυτόν τον ιστότοπο δεν πληρώνετε τίποτα.", // legal review
        },
        noJs: {
            title: "Οι επόμενες 60 νύχτες",
        },
        rejections: {
            invalid: "Οι ημερομηνίες δεν είναι έγκυρες. Επιλέξτε νύχτα άφιξης και μεταγενέστερη ημέρα αναχώρησης.",
            past: "Η ημερομηνία άφιξης έχει περάσει. Επιλέξτε νέες ημερομηνίες.",
            beyond_horizon: "Οι ημερομηνίες είναι πέρα από το ημερολόγιο που εμφανίζεται εδώ. Τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp.",
            max_nights: "Η διαμονή μπορεί να είναι έως {max} νύχτες. Για μεγαλύτερη διαμονή, τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp.",
            blocked: "Κάποιες από αυτές τις νύχτες είναι ήδη κρατημένες. Επιλέξτε άλλες ημερομηνίες.",
            min_nights: "Η ελάχιστη διαμονή με αυτή την άφιξη είναι {nights}.",
        },
        status: {
            lastUpdated: "Τελευταία ενημέρωση διαθεσιμότητας: {time}",
            notConfigured: "Η διαθεσιμότητα δεν εμφανίζεται ακόμη σε αυτή τη σελίδα. Τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp.",
            unavailable: "Η διαθεσιμότητα δεν μπορεί να εμφανιστεί αυτή τη στιγμή. Τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp.",
        },
        booking: {
            bookingCom: "Κράτηση στο Booking.com", // legal review
            opensInNewTab: "(ανοίγει σε νέα καρτέλα)",
            call: "Κλήση",
            whatsapp: "WhatsApp",
            whatsappMessage: "Γεια σας! Είναι ελεύθερο το διαμέρισμα από {checkin} έως {checkout};",
        },
        howToBookTitle: "Πώς να κάνετε κράτηση",
        howToBook: [
            "Επιλέξτε στο ημερολόγιο τη νύχτα άφιξης και την ημέρα αναχώρησης.",
            "Τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp με τις ημερομηνίες σας: επιβεβαιώνουμε μαζί σας τη διαθεσιμότητα και τις λεπτομέρειες άφιξης.",
            "Οι οδηγίες άφιξης σας αποστέλλονται πριν από το check-in.",
        ],
        // TODO (owner): wording; no payment or confirmation claim for Booking.com until the owner confirms the Booking.com settings.
        howToBookBookingCom: "Κλείστε τις ίδιες ημερομηνίες στο Booking.com.", // legal review
        contactTitle: "Επικοινωνία",
        contactIntro: "Ερωτήσεις για ημερομηνίες; Είμαστε εδώ για να βοηθήσουμε.",
        phoneLabel: "Τηλέφωνο",
        emailLabel: "E-mail",
        whatsappLabel: "Στείλτε μας μήνυμα στο WhatsApp",
    },
};
