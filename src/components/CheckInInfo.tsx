"use client";

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { getApartmentContent } from '@/data/apartmentData';
import {
  getApartmentMapLocation,
  type CategoryMapItem,
  type MapContentItem,
} from '@/data/mapLocations';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import internalFetch from '@/lib/internalFetchClient';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import { MAP_DEFAULTS } from '@/lib/mapConstants';

type LocationHighlight = { title: string; description: string };

type NearbyCategoryItem = CategoryMapItem;

type IconName =
  | 'air'
  | 'basket'
  | 'bath'
  | 'car'
  | 'check'
  | 'clock'
  | 'copy'
  | 'external'
  | 'flame'
  | 'home'
  | 'info'
  | 'key'
  | 'map'
  | 'mapPin'
  | 'phone'
  | 'shield'
  | 'sun'
  | 'utensils'
  | 'washer'
  | 'waves'
  | 'wifi';

type CopyTarget = 'wifi' | 'network' | 'password' | null;

type ArrivalRequestStatus = 'pending' | 'approved' | 'rejected';

type ArrivalRequest = {
  id: string;
  requestedTime: string;
  message?: string;
  status: ArrivalRequestStatus;
  createdAt: string;
  updatedAt: string;
};

const WIFI_NETWORK = 'ApartmentGuest_5G';
const WIFI_PASSWORD = 'Welcome2024!';
const MAP_HEIGHT = 'clamp(240px, 35vw, 420px)';
const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

const DynamicApartmentLocationMap = dynamic(() => import('@/components/ApartmentLocationMap'), {
  ssr: false,
  loading: () => <MapLoadingSkeleton height={MAP_DEFAULTS.HEIGHT.COMPACT} />,
});

interface CheckInInfoProps {
  locale: string;
  nearbyRestaurants?: NearbyCategoryItem[];
  nearbyServices?: NearbyCategoryItem[];
}

function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  const common = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  switch (name) {
    case 'air':
      return (
        <svg {...common}>
          <path d="M4 9h11a3 3 0 1 0-3-3" />
          <path d="M4 14h14a3 3 0 1 1-3 3" />
          <path d="M4 19h6" />
        </svg>
      );
    case 'basket':
      return (
        <svg {...common}>
          <path d="M6 10h12l-1.4 8.2a2 2 0 0 1-2 1.8H9.4a2 2 0 0 1-2-1.8L6 10Z" />
          <path d="M9 10a3 3 0 0 1 6 0" />
          <path d="M9 14h6" />
        </svg>
      );
    case 'bath':
      return (
        <svg {...common}>
          <path d="M5 11V6a3 3 0 0 1 6 0" />
          <path d="M4 11h16v3a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-3Z" />
          <path d="M8 21v-2" />
          <path d="M16 21v-2" />
        </svg>
      );
    case 'car':
      return (
        <svg {...common}>
          <path d="M5 15h14l-1.6-4.7A2 2 0 0 0 15.5 9h-7a2 2 0 0 0-1.9 1.3L5 15Z" />
          <path d="M4 15v3h3" />
          <path d="M17 18h3v-3" />
          <circle cx="8" cy="18" r="1.5" />
          <circle cx="16" cy="18" r="1.5" />
        </svg>
      );
    case 'check':
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case 'clock':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...common}>
          <rect x="8" y="8" width="11" height="11" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
        </svg>
      );
    case 'external':
      return (
        <svg {...common}>
          <path d="M14 5h5v5" />
          <path d="m10 14 9-9" />
          <path d="M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4" />
        </svg>
      );
    case 'flame':
      return (
        <svg {...common}>
          <path d="M12 21a7 7 0 0 0 7-7c0-3.3-2.1-5.4-4.4-7.5-.3 2-1.4 3.1-2.6 4.1C10.8 8.4 10.3 6.7 10 4c-2.5 2.1-5 5.1-5 9.8A7 7 0 0 0 12 21Z" />
        </svg>
      );
    case 'home':
      return (
        <svg {...common}>
          <path d="m4 11 8-7 8 7" />
          <path d="M6.5 10.5V20h11v-9.5" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case 'info':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 11.5V16" />
          <path d="M12 8h.01" />
        </svg>
      );
    case 'key':
      return (
        <svg {...common}>
          <circle cx="7.5" cy="14.5" r="3.5" />
          <path d="m10 12 8-8" />
          <path d="m15 7 2 2" />
          <path d="m13 9 2 2" />
        </svg>
      );
    case 'map':
      return (
        <svg {...common}>
          <path d="m8 18-5 2V6l5-2 8 2 5-2v14l-5 2-8-2Z" />
          <path d="M8 4v14" />
          <path d="M16 6v14" />
        </svg>
      );
    case 'mapPin':
      return (
        <svg {...common}>
          <path d="M12 21s6-5.1 6-11a6 6 0 0 0-12 0c0 5.9 6 11 6 11Z" />
          <circle cx="12" cy="10" r="2" />
        </svg>
      );
    case 'phone':
      return (
        <svg {...common}>
          <path d="M8.2 5.2 9.6 8a2 2 0 0 1-.4 2.2l-.7.7a12 12 0 0 0 4.6 4.6l.7-.7a2 2 0 0 1 2.2-.4l2.8 1.4a1.5 1.5 0 0 1 .8 1.8l-.7 2.1a2 2 0 0 1-2.1 1.3C8.9 19.9 4.1 15.1 3 7.2a2 2 0 0 1 1.3-2.1l2.1-.7a1.5 1.5 0 0 1 1.8.8Z" />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path d="M12 3 19 6v5c0 4.5-2.8 8.1-7 10-4.2-1.9-7-5.5-7-10V6l7-3Z" />
          <path d="m9 12 2 2 4-5" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="m4.9 4.9 1.4 1.4" />
          <path d="m17.7 17.7 1.4 1.4" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="m4.9 19.1 1.4-1.4" />
          <path d="m17.7 6.3 1.4-1.4" />
        </svg>
      );
    case 'utensils':
      return (
        <svg {...common}>
          <path d="M7 3v8" />
          <path d="M4.5 3v4.5a2.5 2.5 0 0 0 5 0V3" />
          <path d="M7 11v10" />
          <path d="M17 3v18" />
          <path d="M14 7a3 5 0 0 1 3-4" />
        </svg>
      );
    case 'washer':
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <circle cx="12" cy="14" r="4" />
          <path d="M8 7h.01" />
          <path d="M11 7h5" />
        </svg>
      );
    case 'waves':
      return (
        <svg {...common}>
          <path d="M3 8c2 0 2-1.5 4-1.5S9 8 11 8s2-1.5 4-1.5S17 8 21 8" />
          <path d="M3 13c2 0 2-1.5 4-1.5S9 13 11 13s2-1.5 4-1.5S17 13 21 13" />
          <path d="M3 18c2 0 2-1.5 4-1.5S9 18 11 18s2-1.5 4-1.5S17 18 21 18" />
        </svg>
      );
    case 'wifi':
      return (
        <svg {...common}>
          <path d="M5 13a10 10 0 0 1 14 0" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0" />
          <path d="M12 20h.01" />
        </svg>
      );
  }
}

function stripLeadingEmoji(value: string) {
  return value.replace(/^[^\p{Letter}\p{Number}]+/u, '').trim();
}

function SectionTitle({
  id,
  eyebrow,
  title,
  icon,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  icon: IconName;
}) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="checkin-icon-bubble mt-0.5 h-10 w-10 shrink-0">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <div>
        {eyebrow && (
          <p className="checkin-label text-[0.68rem] font-semibold uppercase tracking-[0.18em]">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className="checkin-title font-serif text-2xl font-semibold italic">
          {title}
        </h2>
      </div>
    </div>
  );
}

export default function CheckInInfo({
  locale,
  nearbyRestaurants = [],
  nearbyServices = [],
}: CheckInInfoProps) {
  const effLocale: Locale = locale === 'el' ? 'el' : 'en';
  const t = getDictionary(effLocale);
  const apartment = getApartmentContent(effLocale);
  const apartmentLocation = getApartmentMapLocation(effLocale);
  const mapContentItems = useMemo<MapContentItem[]>(
    () => [
      ...nearbyRestaurants.map((item) => ({ item, categorySlug: 'moments' })),
      ...nearbyServices.map((item) => ({ item, categorySlug: 'phones' })),
    ],
    [nearbyRestaurants, nearbyServices]
  );
  const checkinStrings = ({ ...(t.checkinInfo ?? {}), ...(t.locationPanel ?? {}) }) as Record<string, string | undefined>;
  const isGreek = effLocale === 'el';

  const panelHighlights = (t.locationPanel?.highlights ?? []) as Array<{
    title: string;
    description: string;
  }>;
  const locationHighlights: LocationHighlight[] = panelHighlights.map(({ title, description }) => ({
    title,
    description,
  }));

  const ui = {
    guideLabel: t.house?.guideTitle ?? (isGreek ? 'Οδηγός διαμονής' : 'Guest stay guide'),
    heroTitle: isGreek ? 'Νιώστε σαν στο σπίτι σας στην Καλαμάτα' : 'Make yourself at home in Kalamata',
    quickActions: isGreek ? 'Γρήγορες ενέργειες' : 'Quick actions',
    copyWifi: isGreek ? 'Αντιγραφή Wi-Fi' : 'Copy Wi-Fi',
    openMaps: isGreek ? 'Άνοιγμα χάρτη' : 'Open Maps',
    viewRules: isGreek ? 'Κανόνες σπιτιού' : 'House Rules',
    guestEssentials: isGreek ? 'Βασικά για τη διαμονή' : 'Guest Essentials',
    goodToKnow: t.checkinInfo?.additionalTitle || (isGreek ? 'Χρήσιμες πληροφορίες' : 'Good to Know'),
    address: isGreek ? 'Διεύθυνση' : 'Address',
    schedule: t.checkinInfo?.checkInOutTitle || (isGreek ? 'Αφιξη & αναχωρηση' : 'Check-in & Check-out'),
    network: t.checkinInfo?.wifiNetwork || (isGreek ? 'Δίκτυο' : 'Network'),
    password: t.checkinInfo?.wifiPassword || (isGreek ? 'Κωδικός' : 'Password'),
    parking: t.checkinInfo?.parking || (isGreek ? 'Δωρεάν πάρκινγκ' : 'Free Parking'),
    keys: stripLeadingEmoji(t.checkinInfo?.keysInfo || (isGreek ? 'Κλειδιά:' : 'Keys:')).replace(/:$/, ''),
    emergency: t.checkinInfo?.emergencyTitle || (isGreek ? 'Επαφές ανάγκης' : 'Emergency Contacts'),
    host: t.checkinInfo?.hostContact || (isGreek ? 'Ο οικοδεσπότης σας' : 'Your Host'),
    save: isGreek ? 'Αποθήκευση' : 'Save',
    saving: t.checkin?.saving || (isGreek ? 'Αποθήκευση...' : 'Saving...'),
    cancel: isGreek ? 'Ακύρωση' : 'Cancel',
    edit: isGreek ? 'Επεξεργασία' : 'Edit',
    saved: isGreek ? 'Οι ώρες αποθηκεύτηκαν.' : 'Check-in times saved.',
    copied: t.checkinInfo?.copied || (isGreek ? 'Αντιγράφηκε' : 'Copied'),
    copy: t.checkinInfo?.copy || (isGreek ? 'Αντιγραφή' : 'Copy'),
    neighborhood: checkinStrings.locationTitle || (isGreek ? 'Εξερευνήστε τη γειτονιά' : 'Explore the Neighborhood'),
    nearby: t.locationPanel?.nearby || (isGreek ? 'Κοντά σας' : "What's Nearby?"),
    standardCheckIn: isGreek ? 'Κανονική ώρα άφιξης' : 'Standard check-in',
    requestDifferentArrival: isGreek ? 'Ζητήστε διαφορετική ώρα άφιξης' : 'Request different arrival time',
    preferredArrivalTime: isGreek ? 'Προτιμώμενη ώρα άφιξης' : 'Preferred arrival time',
    arrivalNote: isGreek ? 'Προσθέστε σημείωση' : 'Add a note',
    arrivalNotePlaceholder: isGreek ? 'Π.χ. φτάνουμε νωρίτερα λόγω πτήσης.' : 'E.g. we may arrive earlier because of our flight.',
    sendRequest: isGreek ? 'Αποστολή αιτήματος' : 'Send request',
    requestSent: isGreek ? 'Το αίτημά σας στάλθηκε. Θα επιβεβαιώσουμε τη διαθεσιμότητα το συντομότερο δυνατό.' : "Your request has been sent. We'll confirm availability as soon as possible.",
    requestError: isGreek ? 'Δεν ήταν δυνατή η αποστολή του αιτήματος. Παρακαλούμε δοκιμάστε ξανά.' : 'Unable to send the request. Please try again.',
    requestRequired: isGreek ? 'Επιλέξτε προτιμώμενη ώρα άφιξης.' : 'Choose a preferred arrival time.',
    latestRequest: isGreek ? 'Τελευταίο αίτημα' : 'Latest request',
    statusPending: isGreek ? 'Σε εκκρεμότητα' : 'Pending',
    statusApproved: isGreek ? 'Εγκρίθηκε' : 'Confirmed',
    statusRejected: isGreek ? 'Δεν είναι διαθέσιμο' : 'Unavailable',
    statusPendingCopy: isGreek ? 'Το αίτημά σας έχει ληφθεί και αναμένει επιβεβαίωση.' : 'Your request has been received and is awaiting confirmation.',
    statusApprovedCopy: isGreek ? 'Η ώρα άφιξης που ζητήσατε έχει επιβεβαιωθεί.' : 'Your requested arrival time has been confirmed.',
    statusRejectedCopy: isGreek ? 'Η ώρα άφιξης που ζητήσατε δεν μπόρεσε να επιβεβαιωθεί. Ισχύει η κανονική ώρα άφιξης.' : 'Your requested arrival time could not be confirmed. The standard check-in time still applies.',
  };

  const ruleItems = [
    t.checkinInfo?.rule1 || 'Quiet hours: 23:00 - 08:00',
    t.checkinInfo?.rule2 || 'No smoking inside the property',
    t.checkinInfo?.rule3 || 'Maximum capacity: 4 guests',
    t.checkinInfo?.rule4 || 'Please respect the neighborhood',
    t.checkinInfo?.rule5 || 'No parties or events are allowed.',
    t.checkinInfo?.rule6 || 'Guests use the terrace at their own risk.',
  ];

  const amenityGroups: Array<{ title: string; icon: IconName; items: string[] }> = [
    {
      title: isGreek ? 'Βασικά' : 'Essentials',
      icon: 'home',
      items: isGreek
        ? ['Δωρεάν ιδιωτικό πάρκινγκ', 'Δωρεάν Wi-Fi σε όλο το κατάλυμα', 'Οικογενειακά δωμάτια', 'Δωμάτια μη καπνιστών', 'Αποθήκευση αποσκευών']
        : ['Free private parking', 'Free Wi-Fi throughout the property', 'Family rooms', 'Non-smoking rooms', 'Luggage storage'],
    },
    {
      title: isGreek ? 'Άνεση' : 'Comfort',
      icon: 'air',
      items: isGreek
        ? ['Κλιματισμός', 'Θέρμανση', 'Τζάκι', 'Καθιστικό με καναπέ', 'Ηχομόνωση', 'Τηλεόραση επίπεδης οθόνης']
        : ['Air conditioning', 'Heating', 'Fireplace', 'Seating area with sofa', 'Soundproofing', 'Flat-screen TV'],
    },
    {
      title: isGreek ? 'Κουζίνα' : 'Kitchen',
      icon: 'utensils',
      items: isGreek
        ? ['Πλήρως εξοπλισμένη κουζίνα', 'Καφετιέρα/βραστήρας', 'Τραπεζαρία', 'Πλυντήριο ρούχων', 'Πλυντήριο πιάτων', 'Φούρνος μικροκυμάτων', 'Ψυγείο και φούρνος']
        : ['Fully equipped kitchen', 'Coffee/tea maker', 'Dining table', 'Washing machine', 'Dishwasher', 'Microwave', 'Refrigerator and oven'],
    },
    {
      title: isGreek ? 'Μπάνιο' : 'Bathroom',
      icon: 'bath',
      items: isGreek
        ? ['Ιδιωτικό μπάνιο', 'Μπανιέρα', 'Πετσέτες και λευκά είδη', 'Σεσουάρ', 'Δωρεάν προϊόντα περιποίησης']
        : ['Private bathroom', 'Bathtub', 'Towels and linens', 'Hair dryer', 'Free toiletries'],
    },
    {
      title: isGreek ? 'Εξωτερικοί χώροι & θέα' : 'Outdoor & Views',
      icon: 'sun',
      items: isGreek
        ? ['Μπαλκόνι', 'Βεράντα / ηλιόλουστη βεράντα', 'Εξωτερική τραπεζαρία', 'Θέα σε θάλασσα, βουνό και πόλη']
        : ['Balcony', 'Terrace / sun terrace', 'Outdoor dining area', 'Sea, mountain, and city views'],
    },
    {
      title: isGreek ? 'Ασφάλεια' : 'Safety',
      icon: 'shield',
      items: isGreek
        ? ['Ανιχνευτές καπνού', 'Πυροσβεστήρες', 'Χρηματοκιβώτιο', 'Πρόσβαση με κλειδί', 'Σίδερο']
        : ['Smoke detectors', 'Fire extinguishers', 'Safe', 'Key access', 'Iron'],
    },
  ];

  const tipItems: Array<{ text: string; icon: IconName }> = [
    { text: t.checkinInfo?.tip1 || 'The nearest beach is just 5 minutes walk away', icon: 'waves' },
    { text: t.checkinInfo?.tip2 || 'Supermarket "AB Vassilopoulos" is 300m away, open 8:00-21:00', icon: 'basket' },
    { text: t.checkinInfo?.tip3 || 'Check our restaurant recommendations in the main menu', icon: 'utensils' },
    { text: t.checkinInfo?.tip4 || 'Need a taxi? Call +30 2721 023456 or use the Taxi app', icon: 'car' },
  ];

  const goodToKnowItems: Array<{ label: string; detail: string; icon: IconName }> = [
    {
      label: stripLeadingEmoji(t.checkinInfo?.trashInfo || 'Trash:').replace(/:$/, ''),
      detail: t.checkinInfo?.trashDetail || 'Recycling bins are located near the main entrance',
      icon: 'basket',
    },
    {
      label: stripLeadingEmoji(t.checkinInfo?.waterInfo || 'Water:').replace(/:$/, ''),
      detail: t.checkinInfo?.waterDetail || 'Tap water is safe to drink',
      icon: 'waves',
    },
    {
      label: stripLeadingEmoji(t.checkinInfo?.tvInfo || 'Entertainment:').replace(/:$/, ''),
      detail: t.checkinInfo?.tvDetail || 'Smart TV with Netflix and YouTube available',
      icon: 'info',
    },
  ];

  const emergencyItems = [
    {
      label: ui.host,
      value: apartmentLocation.phone || '+30 695 581 0051',
      href: `tel:${(apartmentLocation.phone || '+30 695 581 0051').replace(/[^+0-9]/g, '')}`,
    },
    ...nearbyServices.slice(0, 2).map((item) => ({
      label: item.name,
      value: item.phone || item.phones?.[0] || item.summary || '',
      href: item.phone || item.phones?.[0] ? `tel:${(item.phone || item.phones?.[0] || '').replace(/[^+0-9]/g, '')}` : undefined,
    })),
  ].filter((item) => item.value);

  const [copiedTarget, setCopiedTarget] = useState<CopyTarget>(null);
  const [checkInTime, setCheckInTime] = useState('15:00');
  const [checkOutTime, setCheckOutTime] = useState('11:00');
  const [canEditTimes, setCanEditTimes] = useState(false);
  const [isEditingTimes, setIsEditingTimes] = useState(false);
  const [tempCheckInTime, setTempCheckInTime] = useState('15:00');
  const [tempCheckOutTime, setTempCheckOutTime] = useState('11:00');
  const [savingTimes, setSavingTimes] = useState(false);
  const [timesSaved, setTimesSaved] = useState(false);
  const [arrivalRequest, setArrivalRequest] = useState<ArrivalRequest | null>(null);
  const [isRequestingArrival, setIsRequestingArrival] = useState(false);
  const [requestedArrivalTime, setRequestedArrivalTime] = useState('15:00');
  const [arrivalRequestMessage, setArrivalRequestMessage] = useState('');
  const [arrivalRequestSubmitting, setArrivalRequestSubmitting] = useState(false);
  const [arrivalRequestSuccess, setArrivalRequestSuccess] = useState('');
  const [arrivalRequestError, setArrivalRequestError] = useState('');

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const res = await internalFetch('/api/check-in/preferences');
        if (res.ok) {
          const data = await res.json();
          if (data.data) {
            setCheckInTime(data.data.checkInTime || '15:00');
            setCheckOutTime(data.data.checkOutTime || '11:00');
            setTempCheckInTime(data.data.checkInTime || '15:00');
            setTempCheckOutTime(data.data.checkOutTime || '11:00');
            setCanEditTimes(Boolean(data.data.canEdit));
          }
        }
      } catch (error) {
        console.error('Failed to load check-in preferences:', error);
        setCanEditTimes(false);
      }
    };
    loadPreferences();
  }, []);

  useEffect(() => {
    const loadArrivalRequest = async () => {
      try {
        const res = await internalFetch('/api/check-in/arrival-request');
        if (res.ok) {
          const data = await res.json();
          setArrivalRequest(data.data?.request ?? null);
        }
      } catch (error) {
        console.error('Failed to load arrival request:', error);
      }
    };
    loadArrivalRequest();
  }, []);

  const copyToClipboard = (text: string, target: CopyTarget) => {
    if (!navigator.clipboard) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 2000);
    });
  };

  const handleEditTimes = () => {
    if (!canEditTimes) return;
    setTempCheckInTime(checkInTime);
    setTempCheckOutTime(checkOutTime);
    setIsEditingTimes(true);
  };

  const handleCancelEdit = () => {
    setIsEditingTimes(false);
    setTempCheckInTime(checkInTime);
    setTempCheckOutTime(checkOutTime);
  };

  const handleSaveTimes = async () => {
    setSavingTimes(true);
    setTimesSaved(false);
    try {
      const res = await internalFetch('/api/check-in/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkInTime: tempCheckInTime,
          checkOutTime: tempCheckOutTime,
        }),
      });

      if (res.ok) {
        setCheckInTime(tempCheckInTime);
        setCheckOutTime(tempCheckOutTime);
        setIsEditingTimes(false);
        setTimesSaved(true);
        setTimeout(() => setTimesSaved(false), 3000);
      } else {
        const error = await res.json();
        const unknownError = isGreek ? 'Άγνωστο σφάλμα' : 'Unknown error';
        alert(`${isGreek ? 'Αποτυχία αποθήκευσης' : 'Failed to save'}: ${error.error?.message || unknownError}`);
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      alert(isGreek ? 'Αποτυχία αποθήκευσης προτιμήσεων. Παρακαλώ δοκιμάστε ξανά.' : 'Failed to save preferences. Please try again.');
    } finally {
      setSavingTimes(false);
    }
  };

  const handleOpenArrivalRequest = () => {
    setRequestedArrivalTime(arrivalRequest?.requestedTime || checkInTime);
    setArrivalRequestMessage('');
    setArrivalRequestError('');
    setArrivalRequestSuccess('');
    setIsRequestingArrival(true);
  };

  const handleSubmitArrivalRequest = async () => {
    setArrivalRequestError('');
    setArrivalRequestSuccess('');
    if (!timeRegex.test(requestedArrivalTime)) {
      setArrivalRequestError(ui.requestRequired);
      return;
    }

    setArrivalRequestSubmitting(true);
    try {
      const res = await internalFetch('/api/check-in/arrival-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedTime: requestedArrivalTime,
          message: arrivalRequestMessage.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setArrivalRequestError(res.status < 500 && data?.error?.message ? data.error.message : ui.requestError);
        return;
      }

      setArrivalRequest(data.data?.request ?? null);
      setArrivalRequestSuccess(ui.requestSent);
      setIsRequestingArrival(false);
      setArrivalRequestMessage('');
    } catch (error) {
      console.error('Failed to submit arrival request:', error);
      setArrivalRequestError(ui.requestError);
    } finally {
      setArrivalRequestSubmitting(false);
    }
  };

  const requestStatusLabel = (status: ArrivalRequestStatus) => {
    if (status === 'approved') return ui.statusApproved;
    if (status === 'rejected') return ui.statusRejected;
    return ui.statusPending;
  };

  const requestStatusDescription = (status: ArrivalRequestStatus) => {
    if (status === 'approved') return ui.statusApprovedCopy;
    if (status === 'rejected') return ui.statusRejectedCopy;
    return ui.statusPendingCopy;
  };

  const wifiText = `${ui.network}: ${WIFI_NETWORK}\n${ui.password}: ${WIFI_PASSWORD}`;
  const panelClass = 'checkin-panel';
  const rowClass = 'checkin-row';
  const smallLabelClass = 'checkin-label text-[0.68rem] font-semibold uppercase tracking-[0.14em]';
  const titleClass = 'checkin-title';
  const valueClass = 'checkin-value';
  const bodyTextClass = 'checkin-copy';
  const mutedTextClass = 'checkin-muted-text';
  const iconClass = 'checkin-icon-token mt-0.5 h-5 w-5 shrink-0';
  const accentIconClass = 'checkin-accent-token mt-0.5 h-5 w-5 shrink-0';

  return (
    <div className="checkin-portal">
      <section
        className={`${panelClass} relative overflow-hidden p-[clamp(1.25rem,3vw,2.5rem)]`}
        aria-labelledby="checkin-welcome-title"
      >
        <div className="checkin-hero-bg absolute inset-0" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-end">
          <div className="max-w-3xl">
            <p className={smallLabelClass}>{ui.guideLabel}</p>
            <h1
              id="checkin-welcome-title"
              className={`${titleClass} mt-3 max-w-3xl font-serif text-[clamp(2.35rem,5vw,4.7rem)] font-semibold italic leading-[0.98]`}
            >
              {ui.heroTitle}
            </h1>
            <p className={`${bodyTextClass} mt-5 max-w-2xl text-base leading-7 sm:text-lg`}>
              {t.checkinInfo?.welcomeMessage || "We're delighted to have you here. Below you'll find everything you need for a comfortable stay."}
            </p>

            <div className="mt-7 flex flex-wrap gap-3" aria-label={ui.quickActions}>
              <button
                type="button"
                onClick={() => copyToClipboard(wifiText, 'wifi')}
                className="checkin-primary-action min-h-11 px-4 shadow-sm hover:-translate-y-0.5"
              >
                <Icon name={copiedTarget === 'wifi' ? 'check' : 'copy'} className="h-4 w-4" />
                {copiedTarget === 'wifi' ? ui.copied : ui.copyWifi}
              </button>
              {apartmentLocation.directionsUrl && (
                <a
                  href={apartmentLocation.directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="checkin-secondary-action checkin-outline-action min-h-11 px-4 hover:-translate-y-0.5"
                >
                  <Icon name="external" className="h-4 w-4" />
                  {ui.openMaps}
                </a>
              )}
              <a
                href="#house-rules"
                className="checkin-secondary-action checkin-outline-action min-h-11 px-4 hover:-translate-y-0.5"
              >
                <Icon name="shield" className="h-4 w-4" />
                {ui.viewRules}
              </a>
            </div>
          </div>

          <div className="checkin-card checkin-card--strong p-4">
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <div>
                <dt className={smallLabelClass}>{ui.address}</dt>
                <dd className={`${valueClass} mt-1 text-sm font-medium leading-6`}>
                  {apartmentLocation.address}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <dt className={smallLabelClass}>{t.checkinInfo?.checkInTime || 'Check-in'}</dt>
                  <dd className={`${valueClass} mt-1 font-serif text-2xl font-semibold italic`}>
                    {checkInTime}
                  </dd>
                </div>
                <div>
                  <dt className={smallLabelClass}>{t.checkinInfo?.checkOutTime || 'Check-out'}</dt>
                  <dd className={`${valueClass} mt-1 font-serif text-2xl font-semibold italic`}>
                    {checkOutTime}
                  </dd>
                </div>
              </div>
              <div>
                <dt className={smallLabelClass}>{t.checkinInfo?.wifiTitle || 'Internet Access'}</dt>
                <dd className={`${valueClass} mt-1 font-mono text-sm font-semibold`}>
                  {WIFI_NETWORK}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)] lg:items-start">
        <aside className="space-y-5 lg:order-2 lg:sticky lg:top-24">
          <section className={`${panelClass} p-5`} aria-labelledby="guest-essentials-title">
            <SectionTitle id="guest-essentials-title" title={ui.guestEssentials} icon="home" />
            <div className="space-y-0">
              <div className={rowClass}>
                <Icon name="clock" className={iconClass} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className={`${titleClass} text-sm font-semibold`}>
                      {ui.schedule}
                    </h3>
                    {!isEditingTimes && canEditTimes && (
                      <button
                        type="button"
                        onClick={handleEditTimes}
                        className="checkin-outline-action min-h-9 px-3 py-1 text-xs"
                        title={isGreek ? 'Επεξεργασία ωρών (μόνο οικοδεσπότης)' : 'Edit times (host only)'}
                      >
                        {ui.edit}
                      </button>
                    )}
                  </div>

                  {timesSaved && (
                    <p className="mt-2 rounded-md checkin-status-success px-3 py-2 text-sm" role="status">
                      {ui.saved}
                    </p>
                  )}

                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={`${mutedTextClass} text-xs font-medium`}>
                        {ui.standardCheckIn}
                      </span>
                      {isEditingTimes ? (
                        <input
                          type="time"
                          value={tempCheckInTime}
                          onChange={(e) => setTempCheckInTime(e.target.value)}
                          className="checkin-field mt-1 px-2 py-2 text-base"
                        />
                      ) : (
                        <span className={`${valueClass} mt-1 block font-serif text-2xl font-semibold italic`}>
                          {checkInTime}
                        </span>
                      )}
                    </label>
                    <label className="block">
                      <span className={`${mutedTextClass} text-xs font-medium`}>
                        {t.checkinInfo?.checkOutTime || 'Check-out'}
                      </span>
                      {isEditingTimes ? (
                        <input
                          type="time"
                          value={tempCheckOutTime}
                          onChange={(e) => setTempCheckOutTime(e.target.value)}
                          className="checkin-field mt-1 px-2 py-2 text-base"
                        />
                      ) : (
                        <span className={`${valueClass} mt-1 block font-serif text-2xl font-semibold italic`}>
                          {checkOutTime}
                        </span>
                      )}
                    </label>
                  </div>

                  {isEditingTimes && (
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleSaveTimes}
                        disabled={savingTimes}
                        className="checkin-primary-action"
                      >
                        {savingTimes ? ui.saving : ui.save}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelEdit}
                        disabled={savingTimes}
                        className="checkin-outline-action"
                      >
                        {ui.cancel}
                      </button>
                    </div>
                  )}

                  {!isEditingTimes && (
                    <div className="mt-4 space-y-3">
                      {arrivalRequest && (
                        <div className="checkin-card p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="checkin-label text-xs font-semibold uppercase tracking-[0.14em]">
                              {ui.latestRequest}
                            </p>
                            <span className={`checkin-status-pill checkin-status-${arrivalRequest.status}`}>
                              {requestStatusLabel(arrivalRequest.status)}
                            </span>
                          </div>
                          <p className={`${bodyTextClass} mt-2 text-sm leading-6`}>
                            {ui.preferredArrivalTime}: <strong className={`${valueClass} font-semibold`}>{arrivalRequest.requestedTime}</strong>
                          </p>
                          <p className={`${bodyTextClass} mt-2 text-sm leading-6`}>
                            {requestStatusDescription(arrivalRequest.status)}
                          </p>
                        </div>
                      )}

                      {!isRequestingArrival && (
                        <button
                          type="button"
                          onClick={handleOpenArrivalRequest}
                          className="checkin-outline-action w-full"
                        >
                          {ui.requestDifferentArrival}
                        </button>
                      )}

                      {isRequestingArrival && (
                        <div className="checkin-card checkin-card--strong p-3">
                          <label className="block">
                            <span className={`${mutedTextClass} text-xs font-semibold`}>
                              {ui.preferredArrivalTime}
                            </span>
                            <input
                              type="time"
                              value={requestedArrivalTime}
                              onChange={(event) => setRequestedArrivalTime(event.target.value)}
                              className="checkin-field mt-1 px-3 py-2 text-base"
                              aria-invalid={Boolean(arrivalRequestError)}
                            />
                          </label>
                          <label className="mt-3 block">
                            <span className={`${mutedTextClass} text-xs font-semibold`}>
                              {ui.arrivalNote}
                            </span>
                            <textarea
                              value={arrivalRequestMessage}
                              onChange={(event) => setArrivalRequestMessage(event.target.value)}
                              maxLength={500}
                              rows={3}
                              placeholder={ui.arrivalNotePlaceholder}
                              className="checkin-field checkin-textarea mt-1 px-3 py-2"
                            />
                          </label>
                          {arrivalRequestError && (
                            <p className="mt-2 text-sm checkin-status-error" role="alert">
                              {arrivalRequestError}
                            </p>
                          )}
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={handleSubmitArrivalRequest}
                              disabled={arrivalRequestSubmitting}
                              className="checkin-primary-action"
                            >
                              {arrivalRequestSubmitting ? ui.saving : ui.sendRequest}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsRequestingArrival(false);
                                setArrivalRequestError('');
                              }}
                              disabled={arrivalRequestSubmitting}
                              className="checkin-outline-action"
                            >
                              {ui.cancel}
                            </button>
                          </div>
                        </div>
                      )}

                      {arrivalRequestSuccess && (
                        <p className="rounded-lg checkin-status-success px-3 py-2 text-sm leading-6" role="status">
                          {arrivalRequestSuccess}
                        </p>
                      )}
                      {arrivalRequestError && !isRequestingArrival && (
                        <p className="rounded-lg checkin-status-error px-3 py-2 text-sm leading-6" role="alert">
                          {arrivalRequestError}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className={rowClass}>
                <Icon name="wifi" className={iconClass} />
                <div className="min-w-0 flex-1">
                  <h3 className={`${titleClass} text-sm font-semibold`}>
                    {t.checkinInfo?.wifiTitle || 'Internet Access'}
                  </h3>
                  <dl className="checkin-card checkin-divided mt-3">
                    {[
                      {
                        label: ui.network,
                        value: WIFI_NETWORK,
                        target: 'network' as const,
                        aria: isGreek ? 'Αντιγραφή ονόματος δικτύου Wi-Fi' : 'Copy Wi-Fi network name',
                      },
                      {
                        label: ui.password,
                        value: WIFI_PASSWORD,
                        target: 'password' as const,
                        aria: isGreek ? 'Αντιγραφή κωδικού Wi-Fi' : 'Copy Wi-Fi password',
                      },
                    ].map((item) => (
                      <div key={item.target} className="grid gap-2 p-3 sm:grid-cols-[5.75rem_minmax(0,1fr)] sm:items-center">
                        <dt className={`${mutedTextClass} text-xs font-medium`}>{item.label}</dt>
                        <dd className="flex min-w-0 flex-wrap items-center gap-2">
                          <span className={`${valueClass} min-w-0 flex-1 whitespace-nowrap font-mono text-[0.8125rem] font-semibold`}>
                            {item.value}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(item.value, item.target)}
                            className="checkin-copy-action"
                            aria-label={item.aria}
                          >
                            <Icon name={copiedTarget === item.target ? 'check' : 'copy'} className="h-3.5 w-3.5" />
                            {copiedTarget === item.target ? ui.copied : ui.copy}
                          </button>
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>

              <div className={rowClass}>
                <Icon name="key" className={iconClass} />
                <div>
                  <h3 className={`${titleClass} text-sm font-semibold`}>{ui.keys}</h3>
                  <p className={`${bodyTextClass} mt-1 text-sm leading-6`}>
                    {t.checkinInfo?.keysDetail || 'Please leave keys in the lockbox when checking out'}
                  </p>
                </div>
              </div>

              <div className={rowClass}>
                <Icon name="car" className={iconClass} />
                <div>
                  <h3 className={`${titleClass} text-sm font-semibold`}>{ui.parking}</h3>
                  <p className={`${bodyTextClass} mt-1 text-sm leading-6`}>
                    {apartment.highlights.find((item) => item.toLowerCase().includes('parking')) || ui.parking}
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className={`${panelClass} p-5`} aria-labelledby="emergency-title">
            <SectionTitle id="emergency-title" title={ui.emergency} icon="phone" />
            <div className="checkin-divided">
              {emergencyItems.map((item) => (
                <div key={`${item.label}-${item.value}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <h3 className={`${titleClass} truncate text-sm font-semibold`}>{item.label}</h3>
                    <p className={`${bodyTextClass} mt-0.5 truncate text-sm`}>{item.value}</p>
                  </div>
                  {item.href && (
                    <a
                      href={item.href}
                      className="checkin-icon-action checkin-copy-action h-10 w-10 justify-center px-0"
                      aria-label={`${ui.emergency}: ${item.label}`}
                    >
                      <Icon name="phone" className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section className={`${panelClass} p-5`} aria-labelledby="good-to-know-title">
            <SectionTitle id="good-to-know-title" title={ui.goodToKnow} icon="info" />
            <div className="space-y-4">
              {goodToKnowItems.map((item) => (
                <div key={item.label} className="flex gap-3">
                  <Icon name={item.icon} className={iconClass} />
                  <p className={`${bodyTextClass} text-sm leading-6`}>
                    <strong className={`${titleClass} font-semibold`}>{item.label}:</strong>{' '}
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <main className="space-y-6 lg:order-1">
          <section id="house-rules" className={`${panelClass} scroll-mt-24 p-5 sm:p-6`} aria-labelledby="house-rules-title">
            <SectionTitle id="house-rules-title" title={t.checkinInfo?.houseRulesTitle || 'House Rules'} icon="shield" />
            <ul className="grid gap-3 sm:grid-cols-2">
              {ruleItems.map((rule) => (
                <li key={rule} className="checkin-rule-item">
                  <span className="checkin-rule-icon mt-0.5 h-6 w-6">
                    <Icon name="check" className="h-3.5 w-3.5" />
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${panelClass} p-5 sm:p-6`} aria-labelledby="amenities-title">
            <SectionTitle id="amenities-title" title={t.checkinInfo?.amenitiesTitle || 'Key Amenities'} icon="sun" />
            <div className="grid gap-4 md:grid-cols-2">
              {amenityGroups.map((group) => (
                <div
                  key={group.title}
                  className="checkin-card checkin-card--interactive p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="checkin-amenity-icon h-9 w-9">
                      <Icon name={group.icon} className="h-[1.125rem] w-[1.125rem]" />
                    </span>
                    <h3 className={`${titleClass} text-sm font-semibold`}>{group.title}</h3>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {group.items.map((item) => (
                      <span key={item} className="checkin-chip">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={`${panelClass} p-5 sm:p-6`} aria-labelledby="tips-title">
            <SectionTitle id="tips-title" title={t.checkinInfo?.tipsTitle || 'Local Tips'} icon="mapPin" />
            <div className="checkin-divided">
              {tipItems.map((tip) => (
                <div key={tip.text} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                  <Icon name={tip.icon} className={accentIconClass} />
                  <p className={`${bodyTextClass} text-sm leading-6`}>{tip.text}</p>
                </div>
              ))}
            </div>
          </section>

          <section className={`${panelClass} p-5 sm:p-6`} aria-labelledby="neighborhood-title">
            <SectionTitle id="neighborhood-title" eyebrow={ui.nearby} title={ui.neighborhood} icon="map" />
            <p className={`${bodyTextClass} max-w-2xl text-sm leading-6`}>
              {checkinStrings.locationDescription || "Discover your apartment's prime location in Kalamata and explore Kalamata Moments, services, and sights within minutes."}
            </p>
            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
              <div className="checkin-map-shell">
                <DynamicApartmentLocationMap
                  locale={locale}
                  height={MAP_HEIGHT}
                  zoom={12}
                  className="min-h-[240px]"
                  contentItems={mapContentItems}
                />
              </div>
              {locationHighlights.length > 0 && (
                <div className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  {locationHighlights.map(({ title, description }) => (
                    <div
                      key={`${title}-${description}`}
                      className="checkin-card flex gap-3 p-3"
                    >
                      <Icon name="mapPin" className={accentIconClass} />
                      <div>
                        <h3 className={`${titleClass} text-sm font-semibold`}>{title}</h3>
                        <p className={`${bodyTextClass} mt-1 text-xs leading-5`}>{description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
