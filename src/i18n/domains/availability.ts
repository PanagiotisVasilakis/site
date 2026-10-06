/**
 * Availability and prices page translations (/[locale]/availability).
 * Placeholders in braces are replaced by the page: {count}, {nights}, {price},
 * {date}, {max}, {time}, {months}, {amount}, {checkin}, {checkout}.
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
        priceOnRequest: string;
        selected: string;
        best: string;
    };
    /** Parts of a day's accessible name, after the full date. */
    day: {
        today: string;
        booked: string;
        priceOnRequest: string;
        selected: string;
        /** `{price}` */
        perNight: string;
        /** The first booked night after the check-in: a stay may end on it. */
        checkOutOnly: string;
        /** Its short visible label inside the day cell. */
        out: string;
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
        /** `{nights}` × `{price}` */
        priceGroup: string;
        subtotal: string;
        climateFee: string;
        total: string;
        priceOnRequest: string;
        priceOnRequestNote: string;
        guests: string;
        finePrint: string;
        /** Without an Airbnb listing URL. */
        trust: string;
        /** With an Airbnb listing URL. */
        trustAirbnb: string;
    };
    /** The mobile bar with the total of a complete stay. */
    quoteBar: {
        label: string;
        /** `{price}` and `{nights}` */
        total: string;
        /** `{nights}` */
        priceOnRequest: string;
        details: string;
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
        stale: string;
        notConfigured: string;
        unavailable: string;
    };
    booking: {
        airbnb: string;
        opensInNewTab: string;
        call: string;
        whatsapp: string;
        /** Only `{checkin}` and `{checkout}`: nothing else about the guest is sent. */
        whatsappMessage: string;
    };
    howToBookTitle: string;
    howToBook: string[];
    /** Shown only when the Airbnb listing URL is set. */
    howToBookAirbnb: string;
    cancellationTitle: string;
    cancellation: string[];
    withdrawalTitle: string;
    withdrawal: string;
    climateFeeTitle: string;
    climateFeeIntro: string;
    /** `{months}`: `{amount}` */
    climateFeeRate: string;
    climateFeeSummary: string;
    pricesTitle: string;
    prices: string[];
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
        title: "Free dates & prices",
        intro: "Choose your check-in night, then your check-out day. Every free night shows its price.",
        metaDescription: "Free nights and nightly prices for the apartment in Kalamata, and how to book.",
        plannerTitle: "Choose your dates",
        calendarLabel: "Availability calendar",
        legendTitle: "Reading the calendar",
        legend: {
            free: "Free night: its price is shown under the date",
            booked: "Booked: the date is crossed out",
            priceOnRequest: "Free night without a price: price on request",
            selected: "Your stay: highlighted from check-in to check-out",
            best: "Lowest price",
        },
        day: {
            today: "Today",
            booked: "booked",
            priceOnRequest: "price on request",
            selected: "selected",
            perNight: "{price} per night",
            checkOutOnly: "check-out only",
            out: "out",
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
            empty: "Pick your dates to see the total.",
            checkIn: "Check-in",
            checkOut: "Check-out",
            priceGroup: "{nights} × {price}",
            subtotal: "Subtotal",
            climateFee: "Climate resilience fee",
            total: "Total",
            priceOnRequest: "Price on request",
            priceOnRequestNote: "Some of these nights have no price yet. Call us or send a WhatsApp message for the total.",
            guests: "Up to 4 guests",
            finePrint: "Prices per night in euros. The climate resilience fee is set by Greek law and paid at the property.",
            trust: "You pay nothing on this site: we confirm your dates by phone or WhatsApp.",
            trustAirbnb: "Final price confirmed on Airbnb; Airbnb's own fees may apply. You pay nothing on this site.", // legal review
        },
        quoteBar: {
            label: "Stay total",
            total: "{price} · {nights} · total",
            priceOnRequest: "{nights} · price on request",
            details: "See details",
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
            stale: "The calendar could not be updated recently, so booked nights are not shown. The prices apply; please confirm availability by phone or WhatsApp.",
            notConfigured: "Free dates and prices are not shown on this page yet. Please call us or send a WhatsApp message.",
            unavailable: "Free dates and prices cannot be shown right now. Please call us or send a WhatsApp message.",
        },
        booking: {
            airbnb: "Book on Airbnb",
            opensInNewTab: "(opens in a new tab)",
            call: "Call",
            whatsapp: "WhatsApp",
            whatsappMessage: "Hello! Is the apartment free from {checkin} to {checkout}?",
        },
        howToBookTitle: "How to book",
        howToBook: [
            "Choose your check-in night and check-out day in the calendar to see the price of each night and the total.",
            "Call us or send a WhatsApp message with your dates: we confirm availability and the arrival details with you.",
            "Arrival instructions are shared with you before check-in.",
        ],
        howToBookAirbnb: "Book the same dates on Airbnb: payment and confirmation happen there.",
        cancellationTitle: "Cancellation policy",
        cancellation: [
            "Free cancellation up to 30 days before arrival",
            "50% refund for cancellations 14-30 days prior",
            "No refund for cancellations within 14 days",
            "Travel insurance recommended",
        ],
        withdrawalTitle: "Right of withdrawal",
        withdrawal: "For stays on fixed dates the 14-day right of withdrawal does not apply (Law 2251/1994, art. 3ιβ); the cancellation policy above applies.",
        climateFeeTitle: "Climate resilience fee",
        climateFeeIntro: "A fee set by Greek law, paid at the property for each night of the stay:",
        climateFeeRate: "{months}: {amount} per night",
        climateFeeSummary: "The stay summary above shows it on its own line.",
        pricesTitle: "About the prices",
        prices: [
            "Prices are per night, in euros.",
            "Airbnb shows its own price and fees; the price on Airbnb is final for Airbnb bookings.",
            "For bookings by phone or WhatsApp, the final price, including all fees (e.g. the climate resilience fee), is stated in the host's written confirmation.",
            "Nothing is booked or paid on this site.",
        ],
        contactTitle: "Contact",
        contactIntro: "Questions about dates or prices? We are happy to help.",
        phoneLabel: "Phone",
        emailLabel: "E-mail",
        whatsappLabel: "Message us on WhatsApp",
    },
    el: {
        backToApartment: "Το διαμέρισμα",
        title: "Διαθεσιμότητα και τιμές",
        intro: "Επιλέξτε τη νύχτα άφιξης και μετά την ημέρα αναχώρησης. Κάθε ελεύθερη νύχτα δείχνει την τιμή της.",
        metaDescription: "Ελεύθερες νύχτες και τιμές ανά νύχτα για το διαμέρισμα στην Καλαμάτα, και πώς να κάνετε κράτηση.",
        plannerTitle: "Επιλέξτε ημερομηνίες",
        calendarLabel: "Ημερολόγιο διαθεσιμότητας",
        legendTitle: "Πώς διαβάζεται το ημερολόγιο",
        legend: {
            free: "Ελεύθερη νύχτα: η τιμή της φαίνεται κάτω από την ημερομηνία",
            booked: "Κρατημένη: η ημερομηνία είναι διαγραμμένη",
            priceOnRequest: "Ελεύθερη νύχτα χωρίς τιμή: τιμή κατόπιν επικοινωνίας",
            selected: "Η διαμονή σας: επισημαίνεται από την άφιξη ως την αναχώρηση",
            best: "Χαμηλότερη τιμή",
        },
        day: {
            today: "Σήμερα",
            booked: "κρατημένη",
            priceOnRequest: "τιμή κατόπιν επικοινωνίας",
            selected: "επιλεγμένη",
            perNight: "{price} ανά νύχτα",
            checkOutOnly: "μόνο αναχώρηση",
            out: "αναχ.",
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
            empty: "Επιλέξτε ημερομηνίες για να δείτε το σύνολο.",
            checkIn: "Άφιξη",
            checkOut: "Αναχώρηση",
            priceGroup: "{nights} × {price}",
            subtotal: "Μερικό σύνολο",
            climateFee: "Τέλος ανθεκτικότητας στην κλιματική κρίση",
            total: "Σύνολο",
            priceOnRequest: "Τιμή κατόπιν επικοινωνίας",
            priceOnRequestNote: "Κάποιες από αυτές τις νύχτες δεν έχουν ακόμη τιμή. Τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp για το σύνολο.",
            guests: "Έως 4 επισκέπτες",
            finePrint: "Τιμές ανά νύχτα σε ευρώ. Το τέλος ανθεκτικότητας στην κλιματική κρίση ορίζεται από την ελληνική νομοθεσία και καταβάλλεται στο κατάλυμα.",
            trust: "Σε αυτόν τον ιστότοπο δεν πληρώνετε τίποτα: επιβεβαιώνουμε τις ημερομηνίες σας τηλεφωνικά ή στο WhatsApp.",
            trustAirbnb: "Η τελική τιμή επιβεβαιώνεται στο Airbnb· μπορεί να ισχύουν και οι χρεώσεις του Airbnb. Σε αυτόν τον ιστότοπο δεν πληρώνετε τίποτα.", // legal review
        },
        quoteBar: {
            label: "Σύνολο διαμονής",
            total: "{price} · {nights} · σύνολο",
            priceOnRequest: "{nights} · τιμή κατόπιν επικοινωνίας",
            details: "Δείτε λεπτομέρειες",
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
            stale: "Το ημερολόγιο δεν ενημερώθηκε πρόσφατα, γι' αυτό οι κρατημένες νύχτες δεν εμφανίζονται. Οι τιμές ισχύουν· επιβεβαιώστε τη διαθεσιμότητα τηλεφωνικά ή στο WhatsApp.",
            notConfigured: "Η διαθεσιμότητα και οι τιμές δεν εμφανίζονται ακόμη σε αυτή τη σελίδα. Τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp.",
            unavailable: "Η διαθεσιμότητα και οι τιμές δεν μπορούν να εμφανιστούν αυτή τη στιγμή. Τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp.",
        },
        booking: {
            airbnb: "Κράτηση στο Airbnb",
            opensInNewTab: "(ανοίγει σε νέα καρτέλα)",
            call: "Κλήση",
            whatsapp: "WhatsApp",
            whatsappMessage: "Γεια σας! Είναι ελεύθερο το διαμέρισμα από {checkin} έως {checkout};",
        },
        howToBookTitle: "Πώς να κάνετε κράτηση",
        howToBook: [
            "Επιλέξτε στο ημερολόγιο τη νύχτα άφιξης και την ημέρα αναχώρησης για να δείτε την τιμή κάθε νύχτας και το σύνολο.",
            "Τηλεφωνήστε μας ή στείλτε μας μήνυμα στο WhatsApp με τις ημερομηνίες σας: επιβεβαιώνουμε μαζί σας τη διαθεσιμότητα και τις λεπτομέρειες άφιξης.",
            "Οι οδηγίες άφιξης σας αποστέλλονται πριν από το check-in.",
        ],
        howToBookAirbnb: "Κλείστε τις ίδιες ημερομηνίες στο Airbnb: η πληρωμή και η επιβεβαίωση γίνονται εκεί.",
        cancellationTitle: "Πολιτική ακύρωσης",
        cancellation: [
            "Δωρεάν ακύρωση έως 30 ημέρες πριν την άφιξη",
            "Επιστροφή 50% για ακυρώσεις 14-30 ημέρες πριν",
            "Καμία επιστροφή για ακυρώσεις εντός 14 ημερών",
            "Συνιστάται ταξιδιωτική ασφάλιση",
        ],
        withdrawalTitle: "Δικαίωμα υπαναχώρησης",
        withdrawal: "Για διαμονή με συγκεκριμένες ημερομηνίες δεν ισχύει το 14ήμερο δικαίωμα υπαναχώρησης (ν. 2251/1994 άρθ. 3ιβ)· ισχύει η παραπάνω πολιτική ακύρωσης.",
        climateFeeTitle: "Τέλος ανθεκτικότητας στην κλιματική κρίση",
        climateFeeIntro: "Ορίζεται από την ελληνική νομοθεσία και καταβάλλεται στο κατάλυμα για κάθε διανυκτέρευση:",
        climateFeeRate: "{months}: {amount} ανά διανυκτέρευση",
        climateFeeSummary: "Η σύνοψη της διαμονής παραπάνω το εμφανίζει σε ξεχωριστή γραμμή.",
        pricesTitle: "Σχετικά με τις τιμές",
        prices: [
            "Οι τιμές είναι ανά νύχτα, σε ευρώ.",
            "Το Airbnb εμφανίζει τη δική του τιμή και τις δικές του χρεώσεις· για κρατήσεις μέσω Airbnb τελική είναι η τιμή του Airbnb.",
            "Για κρατήσεις τηλεφωνικά ή μέσω WhatsApp, η τελική τιμή, συμπεριλαμβανομένων όλων των τελών (π.χ. τέλος ανθεκτικότητας στην κλιματική κρίση), αναγράφεται στη γραπτή επιβεβαίωση του οικοδεσπότη.",
            "Σε αυτόν τον ιστότοπο δεν γίνεται κράτηση ούτε πληρωμή.",
        ],
        contactTitle: "Επικοινωνία",
        contactIntro: "Ερωτήσεις για ημερομηνίες ή τιμές; Είμαστε εδώ για να βοηθήσουμε.",
        phoneLabel: "Τηλέφωνο",
        emailLabel: "E-mail",
        whatsappLabel: "Στείλτε μας μήνυμα στο WhatsApp",
    },
};
