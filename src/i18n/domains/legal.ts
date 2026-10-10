/**
 * Legal texts (R3-L2: /[locale]/privacy). Every string marked `// legal review` is a draft that
 * the owner approves (review sheet .runtime/content/L2-privacy-review.html) before release.
 * Placeholders in braces are replaced by the page: {months}, {button}.
 *
 * The storage lists are keyed by the exact cookie, localStorage and sessionStorage names the code uses;
 * tests/unit/privacy-storage-inventory.test.ts fails when the code and these lists differ.
 */

import type { Locale } from '../config';

// ============================================================================
// Types
// ============================================================================

export type PrivacyCookieName = 'lang' | 'guest_session' | 'guest_rt' | 'booking_claim_exchange' | 'admin_jwt';

export type PrivacyLocalStorageKey =
    | 'theme'
    | 'motion'
    | 'favorites:v1'
    | 'app-version'
    | 'app-build'
    | 'update-dismissed-version'
    | 'ios-a2hs-dismissed'
    | 'guest_session_changed';

/** sessionStorage: cleared when the tab closes. */
export type PrivacySessionStorageKey = 'brand-intro';

export interface LegalItem {
    title: string;
    text: string;
}

export interface LegalDictionary {
    /** Footer link to the privacy notice. */
    privacyLink: string;
    privacy: {
        metaTitle: string;
        metaDescription: string;
        title: string;
        intro: string;
        controller: {
            title: string;
            intro: string;
            brandLabel: string;
            legalNameLabel: string;
            addressLabel: string;
            emailLabel: string;
            phoneLabel: string;
        };
        purposes: {
            title: string;
            items: Array<LegalItem & { basis: string }>;
        };
        recipients: {
            title: string;
            items: LegalItem[];
        };
        location: {
            title: string;
            paragraphs: string[];
        };
        retention: {
            title: string;
            items: string[];
        };
        rights: {
            title: string;
            text: string;
            contact: string;
            deadline: string;
        };
        complaint: {
            title: string;
            text: string;
        };
        storage: {
            title: string;
            intro: string;
            cookiesTitle: string;
            cookies: Record<PrivacyCookieName, string>;
            localStorageTitle: string;
            localStorage: Record<PrivacyLocalStorageKey, string>;
            sessionStorageTitle: string;
            sessionStorage: Record<PrivacySessionStorageKey, string>;
            cacheTitle: string;
            cache: string;
        };
    };
}

// ============================================================================
// Translations
// ============================================================================

export const legalTranslations: Record<Locale, LegalDictionary> = {
    en: {
        privacyLink: "Privacy", // legal review
        privacy: {
            metaTitle: "Privacy notice", // legal review
            metaDescription: "Which personal data this site processes, why, for how long, who else receives it, and which cookies and browser storage it uses.", // legal review
            title: "Privacy notice", // legal review
            intro: "This notice explains which personal data this website processes, for what purpose, for how long, and what your rights are. It covers the public guide, the availability page and the guest portal (check-in). The site takes no bookings: you book on Airbnb or directly with the host.", // legal review
            controller: {
                title: "Who is responsible", // legal review
                intro: "The controller of your personal data is the host of the apartment:", // legal review
                brandLabel: "Name", // legal review
                legalNameLabel: "Legal name", // legal review
                addressLabel: "Address", // legal review
                emailLabel: "E-mail", // legal review
                phoneLabel: "Phone", // legal review
            },
            purposes: {
                title: "What we process, why, and on what legal basis", // legal review
                items: [
                    {
                        title: "Browsing the site", // legal review
                        text: "The guide and the availability page need no account. Your browser sends the usual technical data of every request (such as your IP address) to our servers and to the providers listed below, so that the pages can be delivered.", // legal review
                        basis: "Legal basis: our legitimate interest in delivering and protecting the site (Art. 6(1)(f) GDPR).", // legal review
                    },
                    {
                        title: "Guest portal and check-in", // legal review
                        text: "When the host gives you access to the guest portal, we keep your mobile number, the password you choose (only as a one-way hash), the dates and reference of your booking, a record that you accepted the terms, and the arrival time and message you send us (with the mobile number of your portal account). We use them to sign you in, to show you the information for your stay and to arrange your arrival.", // legal review
                        basis: "Legal basis: performance of the contract for your stay (Art. 6(1)(b) GDPR).", // legal review
                    },
                    {
                        title: "Tax obligations", // legal review
                        text: "The host keeps the booking records that Greek tax law requires, for example for the short-term stay declaration to the Independent Authority for Public Revenue (AADE).", // legal review
                        basis: "Legal basis: compliance with a legal obligation (Art. 6(1)(c) GDPR).", // legal review
                    },
                    {
                        title: "Security and abuse prevention", // legal review
                        text: "To protect accounts and the site, we record security events and count sign-in attempts and other requests. If a page fails to load correctly, your browser automatically sends us an error report, and we store the page address and technical details of the error. In our database, IP addresses and device details are stored only as keyed cryptographic hashes, never as they are.", // legal review
                        basis: "Legal basis: our legitimate interest in keeping the site and your account secure (Art. 6(1)(f) GDPR).", // legal review
                    },
                ],
            },
            recipients: {
                title: "Who else receives data", // legal review
                items: [
                    {
                        title: "Hosting provider", // legal review
                        text: "Our hosting provider in the EU runs the site and its database and processes all the data described here on our behalf.", // legal review
                    },
                    {
                        title: "Cloudflare", // legal review
                        text: "Cloudflare, Inc. (USA) delivers and protects the site: every request passes through its network, so it sees your IP address and the request. Transfers to the USA rely on the EU-US Data Privacy Framework and the European Commission's standard contractual clauses.", // legal review
                    },
                    {
                        title: "Maps", // legal review
                        text: "Map images load directly from CARTO (basemaps.cartocdn.com) or, where CARTO is not configured, from the OpenStreetMap Foundation (tile.openstreetmap.org). When a page shows a map, your browser requests these images from the provider, which receives your IP address, the standard data your browser sends with a request, the address of our site and the coordinates of the map area shown.", // legal review
                    },
                    {
                        title: "Airbnb", // legal review
                        text: "Our server downloads the apartment's calendar from Airbnb and keeps only which nights are booked. Nothing about you or any other visitor is sent to Airbnb.", // legal review
                    },
                    {
                        title: "Arrival notifications", // legal review
                        text: "When you send your arrival details from the portal, they (arrival time, message, the mobile number of your account and internal booking and account identifiers) are forwarded to the notification service the host uses to receive them.", // legal review
                    },
                    {
                        title: "Operational alerts", // legal review
                        text: "Alerts about the site's operation go to the host's alert service. They contain only rule names and figures, no personal data.", // legal review
                    },
                    {
                        title: "Links to other sites", // legal review
                        text: "Links to Instagram, WhatsApp, Google Maps, Airbnb and other sites only take you there; from then on their own privacy policies apply. Nothing is loaded from them before you follow a link.", // legal review
                    },
                ],
            },
            location: {
                title: "Your location on the map", // legal review
                paragraphs: [
                    "The map has a \"{button}\" button. Only if you press it and allow it in your browser does your browser determine your position. The position is not sent to us: the map moves there, so the map image provider receives requests for the area around you (together with your IP address).", // legal review
                ],
            },
            retention: {
                title: "How long we keep data", // legal review
                items: [
                    "Arrival details (phone, message): deleted {months} months after the booking ends.", // legal review
                    "Portal account (mobile number, password, sign-ins): erased once every booking of the account ended more than {months} months ago. The booking dates and reference stay in the host's records without any link to you, for the host's tax obligations; only a record that the erasure took place, without your details, is kept.", // legal review
                    "Sign-in sessions: deleted 7 days after they expire. Sign-in renewal tokens and access links: deleted 30 days after they expire.", // legal review
                    "Security events, including error reports: 90 days. Request and sign-in attempt counters: until their time window ends.", // legal review
                    "The web server's error log, which can contain your IP address and the address of the requested page: 14 days.", // legal review
                    "Arrival notifications to the host: deleted 30 days after delivery or, if delivery failed, 30 days after the last attempt.", // legal review
                    "Records that tax law requires are kept for as long as that law sets.", // legal review
                ],
            },
            rights: {
                title: "Your rights", // legal review
                text: "You have the right of access to your data, to rectification, to erasure, to restriction of processing and to data portability, and the right to object to processing based on legitimate interest.", // legal review
                contact: "To exercise any of these rights, write to us at:", // legal review
                deadline: "We reply within one month of receiving your request. For complex or numerous requests this period can be extended by two further months; we will tell you so within the first month.", // legal review
            },
            complaint: {
                title: "Complaints", // legal review
                text: "You can lodge a complaint with the Hellenic Data Protection Authority (HDPA), 1-3 Kifisias Avenue, 115 23 Athens, Greece, website:", // legal review
            },
            storage: {
                title: "Cookies and storage in your browser", // legal review
                intro: "The site uses only the cookies and browser storage it needs to work and to remember your choices. It has no analytics or advertising trackers, so no consent banner is shown.", // legal review
                cookiesTitle: "Cookies", // legal review
                cookies: {
                    lang: "Remembers your language (1 year).", // legal review
                    guest_session: "Keeps you signed in to the guest portal (HttpOnly, 2 hours).", // legal review
                    guest_rt: "Renews your portal sign-in (HttpOnly, 7 days).", // legal review
                    booking_claim_exchange: "Carries your one-time access link while you activate the portal (HttpOnly, at most 5 minutes).", // legal review
                    admin_jwt: "Only for the host's sign-in to the administration (HttpOnly, 2 hours).", // legal review
                },
                localStorageTitle: "Browser storage (localStorage)", // legal review
                localStorage: {
                    theme: "Your light or dark theme choice.", // legal review
                    motion: "Your reduced-motion choice.", // legal review
                    'favorites:v1': "The places you saved as favourites.", // legal review
                    'app-version': "The site version, to offer you updates.", // legal review
                    'app-build': "The site build, for the same purpose.", // legal review
                    'update-dismissed-version': "Which update notice you closed.", // legal review
                    'ios-a2hs-dismissed': "That you closed the \"Add to Home Screen\" tip.", // legal review
                    guest_session_changed: "A short signal, removed at once, that tells your other tabs you signed in or out.", // legal review
                },
                sessionStorageTitle: "Tab storage (sessionStorage)", // legal review
                sessionStorage: {
                    'brand-intro': "That the logo animation has already played, so it plays once per visit. It is deleted when you close the tab.", // legal review
                },
                cacheTitle: "Offline copy", // legal review
                cache: "A service worker keeps the site's icons, images, program files and the public pages you visited in your browser, so that they open offline. Portal, check-in, guest and administration pages and the availability page are never stored. You can remove all of it by clearing this site's data in your browser.", // legal review
            },
        },
    },
    el: {
        privacyLink: "Προστασία δεδομένων", // legal review
        privacy: {
            metaTitle: "Ενημέρωση για την προστασία δεδομένων", // legal review
            metaDescription: "Ποια προσωπικά δεδομένα επεξεργάζεται ο ιστότοπος, γιατί, για πόσο, ποιοι άλλοι τα λαμβάνουν και ποια cookies και αποθήκευση του browser χρησιμοποιεί.", // legal review
            title: "Ενημέρωση για την προστασία δεδομένων", // legal review
            intro: "Η ενημέρωση αυτή εξηγεί ποια προσωπικά δεδομένα επεξεργάζεται ο ιστότοπος, για ποιο σκοπό, για πόσο διάστημα και ποια δικαιώματα έχετε. Αφορά τον δημόσιο οδηγό, τη σελίδα διαθεσιμότητας και την πύλη επισκεπτών (check-in). Ο ιστότοπος δεν δέχεται κρατήσεις: κάνετε κράτηση στο Airbnb ή απευθείας με τον οικοδεσπότη.", // legal review
            controller: {
                title: "Υπεύθυνος επεξεργασίας", // legal review
                intro: "Υπεύθυνος επεξεργασίας των προσωπικών σας δεδομένων είναι ο οικοδεσπότης του διαμερίσματος:", // legal review
                brandLabel: "Διακριτικός τίτλος", // legal review
                legalNameLabel: "Ονοματεπώνυμο", // legal review
                addressLabel: "Διεύθυνση", // legal review
                emailLabel: "E-mail", // legal review
                phoneLabel: "Τηλέφωνο", // legal review
            },
            purposes: {
                title: "Τι επεξεργαζόμαστε, γιατί και με ποια νομική βάση", // legal review
                items: [
                    {
                        title: "Περιήγηση στον ιστότοπο", // legal review
                        text: "Ο οδηγός και η σελίδα διαθεσιμότητας δεν απαιτούν λογαριασμό. Ο browser σας στέλνει τα συνήθη τεχνικά στοιχεία κάθε αιτήματος (όπως τη διεύθυνση IP) στους διακομιστές μας και στους παρόχους που αναφέρονται παρακάτω, ώστε να προβληθούν οι σελίδες.", // legal review
                        basis: "Νομική βάση: το έννομο συμφέρον μας να παρέχουμε και να προστατεύουμε τον ιστότοπο (άρθρο 6 παρ. 1 στοιχ. στ ΓΚΠΔ).", // legal review
                    },
                    {
                        title: "Πύλη επισκεπτών και check-in", // legal review
                        text: "Όταν ο οικοδεσπότης σάς δώσει πρόσβαση στην πύλη επισκεπτών, διατηρούμε τον αριθμό του κινητού σας, τον κωδικό που επιλέγετε (μόνο ως μη αναστρέψιμο hash), τις ημερομηνίες και τον κωδικό της κράτησής σας, την καταγραφή ότι αποδεχθήκατε τους όρους, καθώς και την ώρα άφιξης και το μήνυμα που μας στέλνετε (μαζί με τον αριθμό κινητού του λογαριασμού σας στην πύλη). Τα χρησιμοποιούμε για τη σύνδεσή σας, για να σας δείχνουμε τις πληροφορίες της διαμονής σας και για να οργανώσουμε την άφιξή σας.", // legal review
                        basis: "Νομική βάση: η εκτέλεση της σύμβασης για τη διαμονή σας (άρθρο 6 παρ. 1 στοιχ. β ΓΚΠΔ).", // legal review
                    },
                    {
                        title: "Φορολογικές υποχρεώσεις", // legal review
                        text: "Ο οικοδεσπότης τηρεί τα στοιχεία κρατήσεων που απαιτεί η ελληνική φορολογική νομοθεσία, για παράδειγμα για τη Δήλωση Βραχυχρόνιας Διαμονής στην Ανεξάρτητη Αρχή Δημοσίων Εσόδων (ΑΑΔΕ).", // legal review
                        basis: "Νομική βάση: η συμμόρφωση με έννομη υποχρέωση (άρθρο 6 παρ. 1 στοιχ. γ ΓΚΠΔ).", // legal review
                    },
                    {
                        title: "Ασφάλεια και αποτροπή κατάχρησης", // legal review
                        text: "Για να προστατεύσουμε τους λογαριασμούς και τον ιστότοπο, καταγράφουμε συμβάντα ασφαλείας και μετράμε τις προσπάθειες σύνδεσης και άλλα αιτήματα. Αν μια σελίδα δεν φορτώσει σωστά, ο browser σας μάς στέλνει αυτόματα αναφορά σφάλματος και αποθηκεύουμε τη διεύθυνση της σελίδας και τεχνικά στοιχεία του σφάλματος. Στη βάση δεδομένων μας, οι διευθύνσεις IP και τα στοιχεία της συσκευής αποθηκεύονται μόνο ως κρυπτογραφικά hash με μυστικό κλειδί, ποτέ αυτούσια.", // legal review
                        basis: "Νομική βάση: το έννομο συμφέρον μας να διατηρούμε ασφαλή τον ιστότοπο και τον λογαριασμό σας (άρθρο 6 παρ. 1 στοιχ. στ ΓΚΠΔ).", // legal review
                    },
                ],
            },
            recipients: {
                title: "Ποιοι άλλοι λαμβάνουν δεδομένα", // legal review
                items: [
                    {
                        title: "Πάροχος φιλοξενίας", // legal review
                        text: "Ο πάροχος φιλοξενίας μας στην ΕΕ εκτελεί τον ιστότοπο και τη βάση δεδομένων του και επεξεργάζεται για λογαριασμό μας όλα τα δεδομένα που περιγράφονται εδώ.", // legal review
                    },
                    {
                        title: "Cloudflare", // legal review
                        text: "Η Cloudflare, Inc. (ΗΠΑ) παραδίδει και προστατεύει τον ιστότοπο: κάθε αίτημα περνά από το δίκτυό της, οπότε βλέπει τη διεύθυνση IP σας και το αίτημα. Η διαβίβαση στις ΗΠΑ βασίζεται στο Πλαίσιο Προστασίας Δεδομένων ΕΕ-ΗΠΑ και στις τυποποιημένες συμβατικές ρήτρες της Ευρωπαϊκής Επιτροπής.", // legal review
                    },
                    {
                        title: "Χάρτες", // legal review
                        text: "Οι εικόνες του χάρτη φορτώνονται απευθείας από την CARTO (basemaps.cartocdn.com) ή, όταν η CARTO δεν έχει ρυθμιστεί, από το OpenStreetMap Foundation (tile.openstreetmap.org). Όταν μια σελίδα δείχνει χάρτη, ο browser σας ζητά αυτές τις εικόνες από τον πάροχο, ο οποίος λαμβάνει τη διεύθυνση IP σας, τα συνήθη στοιχεία που στέλνει ο browser με κάθε αίτημα, τη διεύθυνση του ιστότοπού μας και τις συντεταγμένες της περιοχής του χάρτη που προβάλλεται.", // legal review
                    },
                    {
                        title: "Airbnb", // legal review
                        text: "Ο διακομιστής μας κατεβάζει από το Airbnb το ημερολόγιο του διαμερίσματος και κρατά μόνο ποιες νύχτες είναι κλεισμένες. Τίποτα για εσάς ή για άλλους επισκέπτες δεν αποστέλλεται στο Airbnb.", // legal review
                    },
                    {
                        title: "Ειδοποιήσεις άφιξης", // legal review
                        text: "Όταν στέλνετε τα στοιχεία άφιξης από την πύλη, αυτά (ώρα άφιξης, μήνυμα, ο αριθμός κινητού του λογαριασμού σας και εσωτερικοί κωδικοί κράτησης και λογαριασμού) προωθούνται στην υπηρεσία ειδοποιήσεων που χρησιμοποιεί ο οικοδεσπότης για να τα λαμβάνει.", // legal review
                    },
                    {
                        title: "Ειδοποιήσεις λειτουργίας", // legal review
                        text: "Οι ειδοποιήσεις για τη λειτουργία του ιστότοπου πηγαίνουν στην υπηρεσία ειδοποιήσεων του οικοδεσπότη. Περιέχουν μόνο ονόματα κανόνων και αριθμούς, όχι προσωπικά δεδομένα.", // legal review
                    },
                    {
                        title: "Σύνδεσμοι προς άλλους ιστότοπους", // legal review
                        text: "Οι σύνδεσμοι προς Instagram, WhatsApp, Google Maps, Airbnb και άλλους ιστότοπους απλώς σας μεταφέρουν εκεί. Από εκεί και πέρα ισχύουν οι δικές τους πολιτικές απορρήτου. Τίποτα δεν φορτώνεται από αυτούς πριν ακολουθήσετε έναν σύνδεσμο.", // legal review
                    },
                ],
            },
            location: {
                title: "Η θέση σας στον χάρτη", // legal review
                paragraphs: [
                    "Ο χάρτης έχει κουμπί «{button}». Μόνο αν το πατήσετε και το επιτρέψετε στον browser, ο browser σας προσδιορίζει τη θέση σας. Η θέση δεν αποστέλλεται σε εμάς: ο χάρτης μετακινείται εκεί, οπότε ο πάροχος των εικόνων του χάρτη λαμβάνει αιτήματα για την περιοχή γύρω σας (μαζί με τη διεύθυνση IP σας).", // legal review
                ],
            },
            retention: {
                title: "Πόσο διατηρούμε τα δεδομένα", // legal review
                items: [
                    "Στοιχεία άφιξης (τηλέφωνο, μήνυμα): διαγράφονται {months} μήνες μετά το τέλος της κράτησης.", // legal review
                    "Λογαριασμός πύλης (κινητό, κωδικός, συνδέσεις): διαγράφεται όταν όλες οι κρατήσεις του έληξαν πριν από περισσότερους από {months} μήνες. Οι ημερομηνίες και ο κωδικός κράτησης μένουν στα αρχεία του οικοδεσπότη χωρίς σύνδεση με εσάς, για τις φορολογικές του υποχρεώσεις. Διατηρείται μόνο μια καταγραφή ότι έγινε η διαγραφή, χωρίς τα στοιχεία σας.", // legal review
                    "Συνεδρίες σύνδεσης: διαγράφονται 7 ημέρες μετά τη λήξη τους. Διακριτικά ανανέωσης σύνδεσης και σύνδεσμοι πρόσβασης: διαγράφονται 30 ημέρες μετά τη λήξη τους.", // legal review
                    "Συμβάντα ασφαλείας, μαζί με τις αναφορές σφαλμάτων: 90 ημέρες. Μετρητές αιτημάτων και προσπαθειών σύνδεσης: μέχρι να λήξει το χρονικό τους παράθυρο.", // legal review
                    "Το αρχείο καταγραφής σφαλμάτων του διακομιστή ιστού, που μπορεί να περιέχει τη διεύθυνση IP σας και τη διεύθυνση της σελίδας που ζητήθηκε: 14 ημέρες.", // legal review
                    "Ειδοποιήσεις άφιξης προς τον οικοδεσπότη: διαγράφονται 30 ημέρες μετά την παράδοση ή, αν η παράδοση απέτυχε, 30 ημέρες μετά την τελευταία προσπάθεια.", // legal review
                    "Τα στοιχεία που απαιτεί η φορολογική νομοθεσία διατηρούνται για όσο ορίζει ο νόμος.", // legal review
                ],
            },
            rights: {
                title: "Τα δικαιώματά σας", // legal review
                text: "Έχετε δικαίωμα πρόσβασης στα δεδομένα σας, διόρθωσης, διαγραφής, περιορισμού της επεξεργασίας και φορητότητας, καθώς και δικαίωμα εναντίωσης στην επεξεργασία που βασίζεται σε έννομο συμφέρον.", // legal review
                contact: "Για να ασκήσετε οποιοδήποτε από αυτά τα δικαιώματα, γράψτε μας στο:", // legal review
                deadline: "Απαντάμε μέσα σε έναν μήνα από τη λήψη του αιτήματος. Για σύνθετα ή πολλά αιτήματα η προθεσμία μπορεί να παραταθεί κατά δύο ακόμη μήνες. Σε αυτή την περίπτωση θα σας ενημερώσουμε μέσα στον πρώτο μήνα.", // legal review
            },
            complaint: {
                title: "Καταγγελία", // legal review
                text: "Μπορείτε να υποβάλετε καταγγελία στην Αρχή Προστασίας Δεδομένων Προσωπικού Χαρακτήρα (ΑΠΔΠΧ), Λεωφόρος Κηφισίας 1-3, 115 23 Αθήνα, ιστότοπος:", // legal review
            },
            storage: {
                title: "Cookies και αποθήκευση στον browser", // legal review
                intro: "Ο ιστότοπος χρησιμοποιεί μόνο τα cookies και την αποθήκευση του browser που χρειάζεται για να λειτουργεί και για να θυμάται τις επιλογές σας. Δεν έχει εργαλεία ανάλυσης επισκεψιμότητας ούτε διαφημιστικούς ιχνηλάτες, γι' αυτό δεν εμφανίζεται μήνυμα συναίνεσης.", // legal review
                cookiesTitle: "Cookies", // legal review
                cookies: {
                    lang: "Θυμάται τη γλώσσα σας (1 έτος).", // legal review
                    guest_session: "Σας κρατά συνδεδεμένους στην πύλη επισκεπτών (HttpOnly, 2 ώρες).", // legal review
                    guest_rt: "Ανανεώνει τη σύνδεσή σας στην πύλη (HttpOnly, 7 ημέρες).", // legal review
                    booking_claim_exchange: "Μεταφέρει τον σύνδεσμο πρόσβασης μίας χρήσης όσο ενεργοποιείτε την πύλη (HttpOnly, έως 5 λεπτά).", // legal review
                    admin_jwt: "Μόνο για τη σύνδεση του οικοδεσπότη στη διαχείριση (HttpOnly, 2 ώρες).", // legal review
                },
                localStorageTitle: "Αποθήκευση στον browser (localStorage)", // legal review
                localStorage: {
                    theme: "Η επιλογή φωτεινού ή σκοτεινού θέματος.", // legal review
                    motion: "Η επιλογή μειωμένης κίνησης.", // legal review
                    'favorites:v1': "Τα μέρη που αποθηκεύσατε στα αγαπημένα.", // legal review
                    'app-version': "Η έκδοση του ιστότοπου, για να σας προτείνουμε ενημερώσεις.", // legal review
                    'app-build': "Η έκδοση κατασκευής (build) του ιστότοπου, για τον ίδιο σκοπό.", // legal review
                    'update-dismissed-version': "Ποια ειδοποίηση ενημέρωσης κλείσατε.", // legal review
                    'ios-a2hs-dismissed': "Ότι κλείσατε τη συμβουλή «Προσθήκη στην οθόνη αφετηρίας».", // legal review
                    guest_session_changed: "Σύντομο σήμα, που διαγράφεται αμέσως, το οποίο ενημερώνει τις άλλες καρτέλες σας ότι συνδεθήκατε ή αποσυνδεθήκατε.", // legal review
                },
                sessionStorageTitle: "Αποθήκευση καρτέλας (sessionStorage)", // legal review
                sessionStorage: {
                    'brand-intro': "Ότι η κίνηση του λογότυπου έχει ήδη παίξει, ώστε να παίζει μία φορά ανά επίσκεψη. Διαγράφεται όταν κλείσετε την καρτέλα.", // legal review
                },
                cacheTitle: "Αντίγραφο για χρήση χωρίς σύνδεση", // legal review
                cache: "Ένας service worker κρατά στον browser σας τα εικονίδια, τις εικόνες, τα αρχεία του προγράμματος και τις δημόσιες σελίδες που επισκεφθήκατε, ώστε να ανοίγουν και χωρίς σύνδεση. Οι σελίδες της πύλης, του check-in, των επισκεπτών και της διαχείρισης, καθώς και η σελίδα διαθεσιμότητας, δεν αποθηκεύονται ποτέ. Μπορείτε να τα διαγράψετε όλα διαγράφοντας τα δεδομένα του ιστότοπου στον browser σας.", // legal review
            },
        },
    },
};
