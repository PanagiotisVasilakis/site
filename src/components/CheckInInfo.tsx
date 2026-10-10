"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  getApartmentMapLocation,
  type CategoryMapItem,
  type MapContentItem,
} from '@/data/mapLocations';
import { getApartmentContent } from '@/data/apartmentData';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { normalizeLocale } from '@/i18n/config';
import { telHref } from '@/lib/contactLinks';
import internalFetch from '@/lib/internalFetchClient';
import { logger } from '@/lib/logger-client';
import { timePattern } from '@/lib/propertyTime';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import { MAP_DEFAULTS } from '@/lib/mapConstants';
import WifiAccessCard from '@/components/checkin/WifiAccessCard';
import { Icon as LineIcon, type IconName as LineIconName } from '@/components/icons/Icon';
import { useToast } from '@/components/Toast';

type LocationHighlight = { icon: LineIconName; title: string; description: string };

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

/** The 112 content entry: the emergency list's first row is the fixed tel:112 entry instead. */
const EMERGENCY_112_ID = 'emergency-112';

const MAP_HEIGHT = 'clamp(240px, 35vw, 420px)';
const DynamicApartmentLocationMap = dynamic(() => import('@/components/ApartmentLocationMap'), {
  ssr: false,
  loading: () => <MapLoadingSkeleton height={MAP_DEFAULTS.HEIGHT.COMPACT} />,
});

interface CheckInInfoProps {
  locale: string;
  nearbyRestaurants?: NearbyCategoryItem[];
  nearbyServices?: NearbyCategoryItem[];
  cartoBasemapsKey?: string;
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
    <div className="checkin-section-head">
      <span className="checkin-icon-bubble">
        <Icon name={icon} className="checkin-icon-bubble__svg" />
      </span>
      <div>
        {eyebrow && (
          <p className="checkin-label">
            {eyebrow}
          </p>
        )}
        <h2 id={id} className="checkin-section-title">
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
  cartoBasemapsKey,
}: CheckInInfoProps) {
  const effLocale: Locale = normalizeLocale(locale);
  const t = getDictionary(effLocale);
  const toast = useToast();
  const apartmentLocation = getApartmentMapLocation(effLocale);
  const mapContentItems = useMemo<MapContentItem[]>(
    () => [
      ...nearbyRestaurants.map((item) => ({ item, categorySlug: 'moments' })),
      ...nearbyServices.map((item) => ({ item, categorySlug: 'phones' })),
    ],
    [nearbyRestaurants, nearbyServices]
  );
  const isGreek = effLocale === 'el';

  const locationHighlights: LocationHighlight[] = t.locationPanel.highlights.map(({ icon, title, description }) => ({
    icon,
    title,
    description,
  }));

  const panel = t.checkinInfo.panel;
  const ui = {
    guideLabel: t.house.guideTitle,
    heroTitle: panel.heroTitle,
    quickActions: panel.quickActions,
    copyWifi: panel.copyWifi,
    openMaps: panel.openMaps,
    viewRules: panel.viewRules,
    guestEssentials: panel.guestEssentials,
    goodToKnow: t.checkinInfo.additionalTitle,
    address: panel.address,
    schedule: t.checkinInfo.checkInOutTitle,
    network: t.checkinInfo.wifiNetwork,
    password: t.checkinInfo.wifiPassword,
    unavailable: panel.unavailable,
    wifiAvailableFrom: panel.wifiAvailableFrom,
    parking: t.checkinInfo.parking,
    keys: stripLeadingEmoji(t.checkinInfo.keysInfo).replace(/:$/, ''),
    emergency: t.checkinInfo.emergencyTitle,
    host: t.checkinInfo.hostContact,
    save: panel.save,
    saving: t.checkin.saving,
    cancel: panel.cancel,
    edit: panel.edit,
    saved: panel.saved,
    copied: t.checkinInfo.copied,
    copy: t.checkinInfo.copy,
    neighborhood: t.locationPanel.locationTitle,
    nearby: t.locationPanel.nearby,
    standardCheckIn: panel.standardCheckIn,
    requestDifferentArrival: panel.requestDifferentArrival,
    preferredArrivalTime: panel.preferredArrivalTime,
    arrivalNote: panel.arrivalNote,
    arrivalNotePlaceholder: panel.arrivalNotePlaceholder,
    sendRequest: panel.sendRequest,
    requestSent: panel.requestSent,
    requestError: panel.requestError,
    requestClosed: panel.requestClosed,
    requestRequired: panel.requestRequired,
    requestAlreadyPending: panel.requestAlreadyPending,
    latestRequest: panel.latestRequest,
    statusPending: panel.statusPending,
    statusApproved: panel.statusApproved,
    statusRejected: panel.statusRejected,
    statusPendingCopy: panel.statusPendingCopy,
    statusApprovedCopy: panel.statusApprovedCopy,
    statusRejectedCopy: panel.statusRejectedCopy,
  };

  const ruleItems = [
    t.checkinInfo.rule1,
    t.checkinInfo.rule2,
    t.checkinInfo.rule3,
    t.checkinInfo.rule4,
    t.checkinInfo.rule5,
    t.checkinInfo.rule6,
  ];

  const amenityIcons: Record<string, IconName> = {
    essentials: 'home', comfort: 'air', kitchen: 'utensils', bathroom: 'bath', outdoor: 'sun', safety: 'shield',
  };
  const amenityGroups = getApartmentContent(effLocale).amenityGroups.map((group) => ({
    title: group.title,
    icon: amenityIcons[group.id] ?? 'home',
    items: group.items,
  }));

  const taxiPhone = nearbyServices.find((item) => item.id === 'taxi')?.phone;
  const tipItems: Array<{ text: string; icon: IconName }> = [
    { text: t.checkinInfo.tip1, icon: 'waves' },
    { text: t.checkinInfo.tip2, icon: 'basket' },
    { text: t.checkinInfo.tip3, icon: 'utensils' },
    ...(taxiPhone ? [{ text: t.checkinInfo.tip4.replace('{taxiPhone}', taxiPhone), icon: 'car' as const }] : []),
  ];

  const goodToKnowItems: Array<{ label: string; detail: string; icon: IconName }> = [
    {
      label: stripLeadingEmoji(t.checkinInfo.trashInfo).replace(/:$/, ''),
      detail: t.checkinInfo.trashDetail,
      icon: 'basket',
    },
    {
      label: stripLeadingEmoji(t.checkinInfo.waterInfo).replace(/:$/, ''),
      detail: t.checkinInfo.waterDetail,
      icon: 'waves',
    },
    {
      label: stripLeadingEmoji(t.checkinInfo.tvInfo).replace(/:$/, ''),
      detail: t.checkinInfo.tvDetail,
      icon: 'info',
    },
  ];

  // 112 first (identity §9.8), then the host and the phones tagged `emergency` (R3-L10).
  const emergencyItems = [
    {
      label: t.stay.checkin.emergency112,
      value: '112',
      href: 'tel:112',
    },
    {
      label: ui.host,
      value: apartmentLocation.phone,
      href: telHref(apartmentLocation.phone),
    },
    ...nearbyServices.filter((item) => item.tags?.includes('emergency') && item.id !== EMERGENCY_112_ID).map((item) => ({
      label: item.name,
      value: item.phone || item.phones?.[0] || item.summary || '',
      href: telHref(item.phone || item.phones?.[0]),
    })),
  ].filter((item) => item.value);

  const [copiedTarget, setCopiedTarget] = useState<CopyTarget>(null);
  const [wifiNetwork, setWifiNetwork] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiAvailableAt, setWifiAvailableAt] = useState<string | null>(null);
  const [checkInTime, setCheckInTime] = useState('15:00');
  const [checkOutTime, setCheckOutTime] = useState('11:00');
  const [canEditTimes, setCanEditTimes] = useState(false);
  const [isEditingTimes, setIsEditingTimes] = useState(false);
  const [tempCheckInTime, setTempCheckInTime] = useState('15:00');
  const [tempCheckOutTime, setTempCheckOutTime] = useState('11:00');
  const [savingTimes, setSavingTimes] = useState(false);
  const [timesSaved, setTimesSaved] = useState(false);
  const [timesSaveError, setTimesSaveError] = useState('');
  const [arrivalRequest, setArrivalRequest] = useState<ArrivalRequest | null>(null);
  const [isRequestingArrival, setIsRequestingArrival] = useState(false);
  const [requestedArrivalTime, setRequestedArrivalTime] = useState('15:00');
  const [arrivalRequestMessage, setArrivalRequestMessage] = useState('');
  const [arrivalRequestSubmitting, setArrivalRequestSubmitting] = useState(false);
  const [arrivalRequestSuccess, setArrivalRequestSuccess] = useState('');
  const [arrivalRequestError, setArrivalRequestError] = useState('');
  const sessionRefreshStarted = useRef(false);
  const wifiReloadMissed = useRef(false);

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
            setWifiNetwork(data.data.wifi?.network || '');
            setWifiPassword(data.data.wifi?.password || '');
            setWifiAvailableAt(typeof data.data.wifiAvailableAt === 'string' ? data.data.wifiAvailableAt : null);
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

  // R-391: the preferences are fetched once and the server adds the Wi-Fi details only after
  // wifiAvailableAt, so a page left open before then reloads one second after it (the server
  // guard also renews an expired session). Not while an arrival request is being typed, after
  // that time (the reload would get the same answer, in a loop) or beyond the 32-bit timer
  // limit (a browser fires such a timer at once). R-619: if the form was open while that time
  // was still ahead and is closed after it, the reload is owed once; wifiReloadMissed records
  // that, and a page loaded after the time starts with it false, so it never reloads.
  useEffect(() => {
    if (wifiNetwork || !wifiAvailableAt) return;
    const delay = new Date(wifiAvailableAt).getTime() - Date.now();
    if (isRequestingArrival) {
      if (delay > 0) wifiReloadMissed.current = true;
      return;
    }
    if (!(delay > 0) && !wifiReloadMissed.current) return;
    const reloadIn = Math.max(0, delay + 1_000);
    if (reloadIn > 2_147_483_647) return;
    const timer = window.setTimeout(() => window.location.reload(), reloadIn);
    return () => window.clearTimeout(timer);
  }, [wifiAvailableAt, wifiNetwork, isRequestingArrival]);

  const copyToClipboard = async (text: string, target: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      // identity §9.8: the Wi-Fi copy confirms with a toast as well as the button label.
      toast.push(t.stay.checkin.wifiCopied);
      setTimeout(() => setCopiedTarget(null), 2000);
    } catch (err) {
      logger.warn('Clipboard copy failed', err instanceof Error ? err : { error: String(err) });
      // R-363 (the R-303 pattern): tell the guest the copy failed and to select the details instead.
      toast.push(t.stay.checkin.wifiCopyFailed);
    }
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
    setTimesSaveError('');
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
        const unknownError = panel.unknownError;
        setTimesSaveError(`${panel.saveFailed}: ${error.error?.message || unknownError}`);
      }
    } catch (error) {
      console.error('Failed to save preferences:', error);
      setTimesSaveError(panel.saveFailedRetry);
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
    if (!timePattern.test(requestedArrivalTime)) {
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

      if (res.status === 401) {
        // The guest session expired while this page was open. The refresh page renews it
        // from the refresh cookie or sends the guest to sign in again; replace() keeps the
        // stale page out of the history, as the refresh page itself does.
        if (!sessionRefreshStarted.current) {
          sessionRefreshStarted.current = true;
          window.location.replace(`/${effLocale}/portal/refresh?next=${encodeURIComponent(`/${effLocale}/check-in`)}`);
        }
        return;
      }
      if (!res.ok) {
        // Server messages are English-only; always show the localized text.
        // 409: the check-in date has passed, so the route no longer accepts requests.
        setArrivalRequestError(res.status === 409 ? ui.requestClosed : ui.requestError);
        return;
      }

      setArrivalRequest(data.data?.request ?? null);
      setIsRequestingArrival(false);
      // The server keeps the earlier pending request and discards this one.
      if (data.data?.notification?.reason === 'request_already_pending') {
        setArrivalRequestError(ui.requestAlreadyPending);
        return;
      }
      setArrivalRequestSuccess(ui.requestSent);
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

  const wifiText = `${ui.network}: ${wifiNetwork}\n${ui.password}: ${wifiPassword}`;
  // Before the disclosure window the server returns when the details appear
  // (24 h before check-in); shown in the guest's own time zone.
  const wifiRevealAt = wifiAvailableAt ? new Date(wifiAvailableAt) : null;
  const wifiNotice = !wifiNetwork && wifiRevealAt && wifiRevealAt.getTime() > Date.now()
    ? `${ui.wifiAvailableFrom} ${new Intl.DateTimeFormat(isGreek ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(wifiRevealAt)}`
    : null;
  // identity §9.8 (calm, cards on tokens; styles in components/stay.css). The section ids are the stay hub's
  // anchors: #wifi, #check-out, #house-rules (plus #arrival and #emergency).
  const rowClass = 'checkin-row';
  const titleClass = 'checkin-title';
  const valueClass = 'checkin-value';
  const bodyTextClass = 'checkin-copy';
  const mutedTextClass = 'checkin-muted-text';
  const iconClass = 'checkin-icon-token';
  const accentIconClass = 'checkin-accent-token';

  return (
    <div className="checkin-portal">
      <header className="checkin-head" aria-labelledby="checkin-welcome-title">
        <p className="checkin-label">{ui.guideLabel}</p>
        <h1 id="checkin-welcome-title" className="checkin-head__title">
          {t.ui.yourStay}
        </h1>
        <p className="checkin-head__lead">
          {t.checkinInfo.welcomeMessage}
        </p>
        <div className="checkin-actions" aria-label={ui.quickActions}>
          <button
            type="button"
            onClick={() => copyToClipboard(wifiText, 'wifi')}
            disabled={!wifiNetwork || !wifiPassword}
            className="ui-btn ui-btn--primary ui-btn--sm"
          >
            <Icon name={copiedTarget === 'wifi' ? 'check' : 'copy'} className="checkin-action-icon" />
            {copiedTarget === 'wifi' ? ui.copied : ui.copyWifi}
          </button>
          {apartmentLocation.directionsUrl && (
            <a
              href={apartmentLocation.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn ui-btn--secondary ui-btn--sm"
            >
              <Icon name="external" className="checkin-action-icon" />
              {ui.openMaps}
            </a>
          )}
          <a href="#house-rules" className="ui-btn ui-btn--secondary ui-btn--sm">
            <Icon name="shield" className="checkin-action-icon" />
            {ui.viewRules}
          </a>
        </div>
      </header>

      <div className="checkin-grid">
        <section id="arrival" className="checkin-panel" aria-labelledby="arrival-title">
          <SectionTitle id="arrival-title" title={ui.guestEssentials} icon="home" />
          <dl className="checkin-summary">
            <div className="checkin-summary__item checkin-summary__item--wide">
              <dt className="checkin-label">{ui.address}</dt>
              <dd className={valueClass}>{apartmentLocation.address}</dd>
            </div>
            <div className="checkin-summary__item">
              <dt className="checkin-label">{t.checkinInfo.checkInTime}</dt>
              <dd className="checkin-time">{checkInTime}</dd>
            </div>
            <div className="checkin-summary__item">
              <dt className="checkin-label">{t.checkinInfo.checkOutTime}</dt>
              <dd className="checkin-time">{checkOutTime}</dd>
            </div>
            <div className="checkin-summary__item checkin-summary__item--wide">
              <dt className="checkin-label">{t.checkinInfo.wifiTitle}</dt>
              <dd className="checkin-mono">{wifiNetwork || wifiNotice || ui.unavailable}</dd>
            </div>
          </dl>

          <div className={rowClass}>
            <Icon name="clock" className={iconClass} />
            <div className="checkin-row__body">
              <div className="checkin-row__head">
                <h3 className={titleClass}>
                  {ui.schedule}
                </h3>
                {!isEditingTimes && canEditTimes && (
                  <button
                    type="button"
                    onClick={handleEditTimes}
                    className="ui-btn ui-btn--secondary ui-btn--sm"
                    title={panel.editTimesHostOnly}
                  >
                    {ui.edit}
                  </button>
                )}
              </div>

              {timesSaved && (
                <p className="ui-callout ui-callout--success checkin-note" role="status">
                  {ui.saved}
                </p>
              )}
              {timesSaveError && (
                <p role="alert" className="ui-callout ui-callout--danger checkin-note">
                  {timesSaveError}
                </p>
              )}

              <div className="checkin-times">
                <label className="checkin-times__field">
                  <span className={mutedTextClass}>
                    {ui.standardCheckIn}
                  </span>
                  {isEditingTimes ? (
                    <input
                      type="time"
                      value={tempCheckInTime}
                      onChange={(e) => setTempCheckInTime(e.target.value)}
                      className="ui-field__input"
                    />
                  ) : (
                    <span className="checkin-time">
                      {checkInTime}
                    </span>
                  )}
                </label>
                <label className="checkin-times__field">
                  <span className={mutedTextClass}>
                    {t.checkinInfo.checkOutTime}
                  </span>
                  {isEditingTimes ? (
                    <input
                      type="time"
                      value={tempCheckOutTime}
                      onChange={(e) => setTempCheckOutTime(e.target.value)}
                      className="ui-field__input"
                    />
                  ) : (
                    <span className="checkin-time">
                      {checkOutTime}
                    </span>
                  )}
                </label>
              </div>

              {isEditingTimes && (
                <div className="checkin-button-pair">
                  <button
                    type="button"
                    onClick={handleSaveTimes}
                    disabled={savingTimes}
                    className="ui-btn ui-btn--primary ui-btn--sm"
                  >
                    {savingTimes ? ui.saving : ui.save}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={savingTimes}
                    className="ui-btn ui-btn--secondary ui-btn--sm"
                  >
                    {ui.cancel}
                  </button>
                </div>
              )}

              {!isEditingTimes && (
                <div className="checkin-stack">
                  {arrivalRequest && (
                    <div className="checkin-card">
                      <div className="checkin-row__head">
                        <p className="checkin-label">
                          {ui.latestRequest}
                        </p>
                        <span className={`checkin-status-pill checkin-status-${arrivalRequest.status}`}>
                          {requestStatusLabel(arrivalRequest.status)}
                        </span>
                      </div>
                      <p className={bodyTextClass}>
                        {ui.preferredArrivalTime}: <strong className={valueClass}>{arrivalRequest.requestedTime}</strong>
                      </p>
                      <p className={bodyTextClass}>
                        {requestStatusDescription(arrivalRequest.status)}
                      </p>
                    </div>
                  )}

                  {!isRequestingArrival && arrivalRequest?.status !== 'pending' && (
                    <button
                      type="button"
                      onClick={handleOpenArrivalRequest}
                      className="ui-btn ui-btn--secondary ui-btn--sm ui-btn--block"
                    >
                      {ui.requestDifferentArrival}
                    </button>
                  )}

                  {isRequestingArrival && (
                    <div className="checkin-card checkin-card--strong">
                      <label className="ui-field">
                        <span className="ui-field__label">
                          {ui.preferredArrivalTime}
                        </span>
                        <input
                          type="time"
                          value={requestedArrivalTime}
                          onChange={(event) => setRequestedArrivalTime(event.target.value)}
                          className="ui-field__input"
                          aria-invalid={Boolean(arrivalRequestError)}
                        />
                      </label>
                      <label className="ui-field">
                        <span className="ui-field__label">
                          {ui.arrivalNote}
                        </span>
                        <textarea
                          value={arrivalRequestMessage}
                          onChange={(event) => setArrivalRequestMessage(event.target.value)}
                          maxLength={500}
                          rows={3}
                          placeholder={ui.arrivalNotePlaceholder}
                          className="ui-field__input checkin-textarea"
                        />
                      </label>
                      {arrivalRequestError && (
                        <p className="ui-callout ui-callout--danger checkin-note" role="alert">
                          {arrivalRequestError}
                        </p>
                      )}
                      <div className="checkin-button-pair">
                        <button
                          type="button"
                          onClick={handleSubmitArrivalRequest}
                          disabled={arrivalRequestSubmitting}
                          className="ui-btn ui-btn--primary ui-btn--sm"
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
                          className="ui-btn ui-btn--secondary ui-btn--sm"
                        >
                          {ui.cancel}
                        </button>
                      </div>
                    </div>
                  )}

                  {arrivalRequestSuccess && (
                    <p className="ui-callout ui-callout--success checkin-note" role="status">
                      {arrivalRequestSuccess}
                    </p>
                  )}
                  {arrivalRequestError && !isRequestingArrival && (
                    <p className="ui-callout ui-callout--danger checkin-note" role="alert">
                      {arrivalRequestError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className={rowClass}>
            <Icon name="car" className={iconClass} />
            <div className="checkin-row__body">
              <h3 className={titleClass}>{ui.parking}</h3>
              <p className={bodyTextClass}>
                {t.checkinInfo.parkingDetail}
              </p>
            </div>
          </div>
        </section>

        <section id="wifi" className="checkin-panel" aria-labelledby="wifi-title">
          <SectionTitle id="wifi-title" title={t.checkinInfo.wifiTitle} icon="wifi" />
          <WifiAccessCard
            networkLabel={ui.network}
            passwordLabel={ui.password}
            network={wifiNetwork}
            password={wifiPassword}
            unavailableLabel={ui.unavailable}
            notice={wifiNotice}
            copyLabel={ui.copy}
            copiedLabel={ui.copied}
            copiedTarget={copiedTarget === 'network' || copiedTarget === 'password' ? copiedTarget : null}
            onCopy={copyToClipboard}
            networkCopyLabel={panel.networkCopyLabel}
            passwordCopyLabel={panel.passwordCopyLabel}
          />
        </section>

        <section id="house-rules" className="checkin-panel" aria-labelledby="house-rules-title">
          <SectionTitle id="house-rules-title" title={t.checkinInfo.houseRulesTitle} icon="shield" />
          <ul className="checkin-rules">
            {ruleItems.map((rule) => (
              <li key={rule} className="checkin-rule-item">
                <span className="checkin-rule-icon">
                  <Icon name="check" className="checkin-rule-icon__svg" />
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </section>

        <section id="check-out" className="checkin-panel" aria-labelledby="check-out-title">
          <SectionTitle id="check-out-title" title={t.stay.hub.checkoutTitle} icon="clock" />
          <p className="checkin-time checkin-time--large">{checkOutTime}</p>
          <p className={bodyTextClass}>{t.stay.checkin.checkoutBy.replace('{time}', checkOutTime)}</p>
          <div className={rowClass}>
            <Icon name="key" className={iconClass} />
            <div className="checkin-row__body">
              <h3 className={titleClass}>{ui.keys}</h3>
              <p className={bodyTextClass}>
                {t.checkinInfo.keysDetail}
              </p>
            </div>
          </div>
        </section>

        <section id="emergency" className="checkin-panel" aria-labelledby="emergency-title">
          <SectionTitle id="emergency-title" title={ui.emergency} icon="phone" />
          <div className="checkin-divided">
            {emergencyItems.map((item) => (
              <div key={`${item.label}-${item.value}`} className="checkin-contact">
                <div className="checkin-contact__text">
                  <h3 className={titleClass}>{item.label}</h3>
                  <p className={bodyTextClass}>{item.value}</p>
                </div>
                {item.href && (
                  <a
                    href={item.href}
                    className="ui-icon-btn checkin-call shell-link"
                    aria-label={`${ui.emergency}: ${item.label}`}
                  >
                    <Icon name="phone" className="checkin-action-icon" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="checkin-panel" aria-labelledby="good-to-know-title">
          <SectionTitle id="good-to-know-title" title={ui.goodToKnow} icon="info" />
          <div className="checkin-stack">
            {goodToKnowItems.map((item) => (
              <div key={item.label} className="checkin-line">
                <Icon name={item.icon} className={iconClass} />
                <p className={bodyTextClass}>
                  <strong className={titleClass}>{item.label}:</strong>{' '}
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="checkin-panel checkin-panel--wide" aria-labelledby="amenities-title">
          <SectionTitle id="amenities-title" title={t.checkinInfo.amenitiesTitle} icon="sun" />
          <div className="checkin-amenities">
            {amenityGroups.map((group) => (
              <div key={group.title} className="checkin-card">
                <div className="checkin-row__head checkin-row__head--start">
                  <span className="checkin-amenity-icon">
                    <Icon name={group.icon} className="checkin-amenity-icon__svg" />
                  </span>
                  <h3 className={titleClass}>{group.title}</h3>
                </div>
                <div className="checkin-chips">
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

        <section className="checkin-panel" aria-labelledby="tips-title">
          <SectionTitle id="tips-title" title={t.checkinInfo.tipsTitle} icon="mapPin" />
          <div className="checkin-divided">
            {tipItems.map((tip) => (
              <div key={tip.text} className="checkin-line">
                <Icon name={tip.icon} className={accentIconClass} />
                <p className={bodyTextClass}>{tip.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="checkin-panel checkin-panel--guide" aria-labelledby="checkin-guide-title">
          <SectionTitle id="checkin-guide-title" title={t.shell.navGuide} icon="map" />
          <p className={bodyTextClass}>{t.stay.checkin.guideText}</p>
          <a href={`/${effLocale}/moments`} className="ui-btn ui-btn--link-arrow checkin-guide-link">
            {t.stay.checkin.guideCta}
          </a>
        </section>

        <section className="checkin-panel checkin-panel--wide" aria-labelledby="neighborhood-title">
          <SectionTitle id="neighborhood-title" eyebrow={ui.nearby} title={ui.neighborhood} icon="map" />
          <p className={bodyTextClass}>
            {t.locationPanel.locationDescription}
          </p>
          <div className="checkin-map-layout">
            <div className="checkin-map-shell">
              <DynamicApartmentLocationMap
                locale={locale}
                height={MAP_HEIGHT}
                zoom={12}
                className="checkin-map"
                contentItems={mapContentItems}
                cartoBasemapsKey={cartoBasemapsKey}
              />
            </div>
            {locationHighlights.length > 0 && (
              <div className="checkin-highlights">
                {locationHighlights.map(({ icon, title, description }) => (
                  <div
                    key={`${title}-${description}`}
                    className="checkin-card checkin-line"
                  >
                    <LineIcon name={icon} className={accentIconClass} />
                    <div>
                      <h3 className={titleClass}>{title}</h3>
                      <p className={`${bodyTextClass} checkin-copy--small`}>{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
