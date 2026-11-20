"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  getApartmentMapLocation,
  type CategoryMapItem,
  type MapContentItem,
} from '@/data/mapLocations';
import { getApartmentContent } from '@/data/apartmentData';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import { EMERGENCY_112_HREF, EMERGENCY_112_ID, telHref } from '@/lib/contactLinks';
import internalFetch from '@/lib/internalFetchClient';
import { logger } from '@/lib/logger-client';
import { timePattern } from '@/lib/propertyTime';
import MapLoadingSkeleton from '@/components/MapLoadingSkeleton';
import WifiAccessCard from '@/components/checkin/WifiAccessCard';
import { Icon, type IconName } from '@/components/icons/Icon';
import { useToast } from '@/components/Toast';

type NearbyCategoryItem = CategoryMapItem;

type CopyTarget = 'wifi' | 'network' | 'password' | null;

type ArrivalRequestStatus = 'pending' | 'approved' | 'rejected';

type ArrivalRequest = {
  requestedTime: string;
  status: ArrivalRequestStatus;
};

const WIFI_FOLLOW_UP_MS = 60_000;
const MAP_HEIGHT = 'clamp(240px, 35vw, 420px)';
const MAP_LOADING_HEIGHT = '260px';
const DynamicApartmentLocationMap = dynamic(() => import('@/components/ApartmentLocationMap'), {
  ssr: false,
  loading: () => <MapLoadingSkeleton height={MAP_LOADING_HEIGHT} />,
});

function sessionRefreshUrl(locale: Locale) {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  return `/${locale}/portal/refresh?next=${encodeURIComponent(`/${locale}/check-in${hash}`)}`;
}

interface CheckInInfoProps {
  locale: Locale;
  nearbyRestaurants?: NearbyCategoryItem[];
  nearbyServices?: NearbyCategoryItem[];
  cartoBasemapsKey?: string;
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
  const t = getDictionary(locale);
  const toast = useToast();
  const apartmentLocation = getApartmentMapLocation(locale);
  const mapContentItems = useMemo<MapContentItem[]>(
    () => [
      ...nearbyRestaurants.map((item) => ({ item, categorySlug: 'moments' })),
      ...nearbyServices.map((item) => ({ item, categorySlug: 'phones' })),
    ],
    [nearbyRestaurants, nearbyServices]
  );
  const isGreek = locale === 'el';

  const panel = t.checkinInfo.panel;

  const ruleItems = [
    t.checkinInfo.rule1,
    t.checkinInfo.rule2,
    t.checkinInfo.rule3,
    t.checkinInfo.rule4,
    t.checkinInfo.rule5,
    t.checkinInfo.rule6,
  ];

  const amenityIcons: Record<string, IconName> = {
    essentials: 'home', comfort: 'snowflake', kitchen: 'fork', bathroom: 'bath', outdoor: 'sun', safety: 'rules',
  };
  const amenityGroups = getApartmentContent(locale).amenityGroups.map((group) => ({
    title: group.title,
    icon: amenityIcons[group.id] ?? 'home',
    items: group.items,
  }));

  const taxiPhone = nearbyServices.find((item) => item.id === 'taxi')?.phone;
  const tipItems: Array<{ text: string; icon: IconName }> = [
    { text: t.checkinInfo.tip1, icon: 'beach' },
    { text: t.checkinInfo.tip2, icon: 'basket' },
    { text: t.checkinInfo.tip3, icon: 'fork' },
    ...(taxiPhone ? [{ text: t.checkinInfo.tip4.replace('{taxiPhone}', taxiPhone), icon: 'car' as const }] : []),
  ];

  const goodToKnowItems: Array<{ label: string; detail: string; icon: IconName }> = [
    {
      label: t.checkinInfo.trashInfo,
      detail: t.checkinInfo.trashDetail,
      icon: 'basket',
    },
    {
      label: t.checkinInfo.waterInfo,
      detail: t.checkinInfo.waterDetail,
      icon: 'beach',
    },
    {
      label: t.checkinInfo.tvInfo,
      detail: t.checkinInfo.tvDetail,
      icon: 'info',
    },
  ];

  // 112 first (identity §9.8), then the host and the phones tagged `emergency` (R3-L10).
  const emergencyItems = [
    {
      label: t.stay.checkin.emergency112,
      value: '112',
      href: EMERGENCY_112_HREF,
    },
    {
      label: t.checkinInfo.hostContact,
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
  const [wifiPending, setWifiPending] = useState<boolean | null>(null);
  const [checkInTime, setCheckInTime] = useState('15:00');
  const [checkOutTime, setCheckOutTime] = useState('11:00');
  const [arrivalRequest, setArrivalRequest] = useState<ArrivalRequest | null>(null);
  const [isRequestingArrival, setIsRequestingArrival] = useState(false);
  const [requestedArrivalTime, setRequestedArrivalTime] = useState('15:00');
  const [arrivalRequestMessage, setArrivalRequestMessage] = useState('');
  const [arrivalRequestSubmitting, setArrivalRequestSubmitting] = useState(false);
  const [arrivalRequestSuccess, setArrivalRequestSuccess] = useState('');
  const [arrivalRequestError, setArrivalRequestError] = useState('');
  const sessionRefreshStarted = useRef(false);
  const wifiRevealAwaited = useRef(false);
  const copiedTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (copiedTimerRef.current !== null) {
      window.clearTimeout(copiedTimerRef.current);
      copiedTimerRef.current = null;
    }
  }, []);

  const redirectToSessionRefresh = useCallback(() => {
    if (!sessionRefreshStarted.current) {
      sessionRefreshStarted.current = true;
      window.location.replace(sessionRefreshUrl(locale));
    }
  }, [locale]);

  const loadCheckInPreferences = useCallback(async (
    isActive: () => boolean,
    { applySchedule }: { applySchedule: boolean },
  ): Promise<boolean> => {
    const res = await internalFetch('/api/check-in/preferences');
    if (!isActive()) return false;
    if (res.status === 401) {
      redirectToSessionRefresh();
      return false;
    }
    if (!res.ok) return false;
    const data = await res.json();
    if (!isActive()) return false;
    if (data.data) {
      if (applySchedule) {
        setCheckInTime(data.data.checkInTime || '15:00');
        setCheckOutTime(data.data.checkOutTime || '11:00');
      }
      setWifiNetwork(data.data.wifi?.network || '');
      setWifiPassword(data.data.wifi?.password || '');
      setWifiAvailableAt(typeof data.data.wifiAvailableAt === 'string' ? data.data.wifiAvailableAt : null);
      setWifiPending(typeof data.data.wifiPending === 'boolean' ? data.data.wifiPending : null);
    }
    return true;
  }, [redirectToSessionRefresh]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await loadCheckInPreferences(() => active, { applySchedule: true });
      } catch (error) {
        logger.error('Failed to load check-in preferences', error instanceof Error ? error : { error: String(error) });
      }
    };
    void run();
    return () => { active = false; };
  }, [loadCheckInPreferences]);

  useEffect(() => {
    let active = true;
    const loadArrivalRequest = async () => {
      try {
        const res = await internalFetch('/api/check-in/arrival-request');
        if (!active) return;
        if (res.status === 401) {
          redirectToSessionRefresh();
          return;
        }
        if (res.ok) {
          const data = await res.json();
          if (!active) return;
          setArrivalRequest(data.data?.request ?? null);
        }
      } catch (error) {
        logger.error('Failed to load arrival request', error instanceof Error ? error : { error: String(error) });
      }
    };
    loadArrivalRequest();
    return () => { active = false; };
  }, [redirectToSessionRefresh]);

  // The server adds the Wi-Fi details only after wifiAvailableAt, so a page opened earlier asks again one second
  // after it, once more 60 seconds after that on-time request succeeds (a phone clock ahead of the server), and
  // when the tab returns (a sleeping phone may skip one long timer); only the Wi-Fi fields change, so open forms
  // stay. A page loaded after that time sends nothing: after the stay the server still answers without the
  // details. No timer is set beyond the 32-bit limit (a browser fires such a timer at once).
  useEffect(() => {
    if (wifiNetwork || !wifiAvailableAt) return;
    const revealAt = new Date(wifiAvailableAt).getTime();
    const delay = revealAt - Date.now();
    if (wifiPending === true || (wifiPending === null && delay > 0)) {
      wifiRevealAwaited.current = true;
    }
    if (!wifiRevealAwaited.current) return;

    let active = true;
    let requestInFlight = false;
    let onlineRetryLeft = 1;
    let waitingForOnline = false;
    let followUp: number | undefined;

    const refetchWifi = async (): Promise<boolean> => {
      if (requestInFlight || sessionRefreshStarted.current) return false;
      requestInFlight = true;
      let failed = false;
      try {
        const ok = await loadCheckInPreferences(() => active, { applySchedule: false });
        if (!active) return false;
        if (!ok && !sessionRefreshStarted.current) {
          failed = true;
        }
        return ok;
      } catch (error) {
        if (!active) return false;
        logger.error('Failed to refresh the Wi-Fi details', error instanceof Error ? error : { error: String(error) });
        failed = true;
        return false;
      } finally {
        requestInFlight = false;
        if (failed && onlineRetryLeft > 0) {
          onlineRetryLeft -= 1;
          waitingForOnline = true;
        }
      }
    };

    // A phone clock ahead of the server fires the timer early while the server still withholds the details: ask once more.
    const refetchOnTime = async () => {
      if (await refetchWifi() && active) followUp = window.setTimeout(() => { void refetchWifi(); }, WIFI_FOLLOW_UP_MS);
    };

    const refetchAfterReturn = () => {
      if (Date.now() >= revealAt) refetchWifi();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refetchAfterReturn();
    };
    const onOnline = () => {
      if (!waitingForOnline) return;
      waitingForOnline = false;
      refetchWifi();
    };

    const timer = delay > 0 && delay + 1_000 <= 2_147_483_647
      ? window.setTimeout(() => { void refetchOnTime(); }, delay + 1_000)
      : undefined;
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', refetchAfterReturn);
    window.addEventListener('online', onOnline);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearTimeout(followUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', refetchAfterReturn);
      window.removeEventListener('online', onOnline);
    };
  }, [wifiAvailableAt, wifiNetwork, wifiPending, loadCheckInPreferences]);

  const copyToClipboard = async (text: string, target: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      // identity §9.8: the Wi-Fi copy confirms with a toast as well as the button label.
      toast.push(t.stay.checkin.wifiCopied);
      if (copiedTimerRef.current !== null) {
        window.clearTimeout(copiedTimerRef.current);
      }
      copiedTimerRef.current = window.setTimeout(() => {
        copiedTimerRef.current = null;
        setCopiedTarget(null);
      }, 2000);
    } catch (err) {
      logger.warn('Clipboard copy failed', err instanceof Error ? err : { error: String(err) });
      // Tell the guest the copy failed and to select the details instead.
      toast.push(t.stay.checkin.wifiCopyFailed);
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
      setArrivalRequestError(panel.requestRequired);
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
        redirectToSessionRefresh();
        return;
      }
      if (!res.ok) {
        // Server messages are English-only; always show the localized text.
        // 409: the check-in date has passed, so the route no longer accepts requests.
        setArrivalRequestError(res.status === 409 ? panel.requestClosed : panel.requestError);
        return;
      }

      setArrivalRequest(data.data?.request ?? null);
      setIsRequestingArrival(false);
      // The server keeps the earlier pending request and discards this one.
      if (data.data?.notification?.reason === 'request_already_pending') {
        setArrivalRequestError(panel.requestAlreadyPending);
        return;
      }
      setArrivalRequestSuccess(panel.requestSent);
      setArrivalRequestMessage('');
    } catch (error) {
      logger.error('Failed to submit arrival request', error instanceof Error ? error : { error: String(error) });
      setArrivalRequestError(panel.requestError);
    } finally {
      setArrivalRequestSubmitting(false);
    }
  };

  const requestStatusText = (status: ArrivalRequestStatus) => {
    if (status === 'approved') return { label: panel.statusApproved, description: panel.statusApprovedCopy };
    if (status === 'rejected') return { label: panel.statusRejected, description: panel.statusRejectedCopy };
    return { label: panel.statusPending, description: panel.statusPendingCopy };
  };

  const wifiText = `${t.checkinInfo.wifiNetwork}: ${wifiNetwork}\n${t.checkinInfo.wifiPassword}: ${wifiPassword}`;
  // Before the disclosure window the server returns when the details appear
  // (24 h before check-in); shown in the guest's own time zone.
  const wifiRevealAt = wifiAvailableAt ? new Date(wifiAvailableAt) : null;
  const wifiNotice = !wifiNetwork && wifiRevealAt && wifiRevealAt.getTime() > Date.now()
    ? `${panel.wifiAvailableFrom} ${new Intl.DateTimeFormat(isGreek ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(wifiRevealAt)}`
    : null;
  // identity §9.8 (calm, cards on tokens; styles in components/stay.css). The section ids are the stay hub's
  // anchors: #wifi, #check-out, #house-rules (plus #arrival and #emergency).
  return (
    <div className="checkin-portal">
      <header className="checkin-head" aria-labelledby="checkin-welcome-title">
        <p className="checkin-label">{t.house.guideTitle}</p>
        <h1 id="checkin-welcome-title" className="checkin-head__title">
          {t.ui.yourStay}
        </h1>
        <p className="checkin-head__lead">
          {t.checkinInfo.welcomeMessage}
        </p>
        <div className="checkin-actions" aria-label={panel.quickActions}>
          <button
            type="button"
            onClick={() => copyToClipboard(wifiText, 'wifi')}
            disabled={!wifiNetwork || !wifiPassword}
            className="ui-btn ui-btn--primary ui-btn--sm"
          >
            <Icon name={copiedTarget === 'wifi' ? 'check' : 'copy'} className="checkin-action-icon" />
            {copiedTarget === 'wifi' ? t.checkinInfo.copied : panel.copyWifi}
          </button>
          {apartmentLocation.directionsUrl && (
            <a
              href={apartmentLocation.directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ui-btn ui-btn--secondary ui-btn--sm"
            >
              <Icon name="arrow-up-right" className="checkin-action-icon" />
              {panel.openMaps}
            </a>
          )}
          <a href="#house-rules" className="ui-btn ui-btn--secondary ui-btn--sm">
            <Icon name="rules" className="checkin-action-icon" />
            {panel.viewRules}
          </a>
        </div>
      </header>

      <div className="checkin-grid">
        <section id="arrival" className="checkin-panel" aria-labelledby="arrival-title">
          <SectionTitle id="arrival-title" title={panel.guestEssentials} icon="home" />
          <dl className="checkin-summary">
            <div className="checkin-summary__item checkin-summary__item--wide">
              <dt className="checkin-label">{panel.address}</dt>
              <dd className="checkin-value">{apartmentLocation.address}</dd>
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
              <dd className="checkin-mono">{wifiNetwork || wifiNotice || panel.unavailable}</dd>
            </div>
          </dl>

          <div className="checkin-row">
            <Icon name="clock" className="checkin-icon-token" />
            <div className="checkin-row__body">
              <div className="checkin-row__head">
                <h3 className="checkin-title">
                  {t.checkinInfo.checkInOutTitle}
                </h3>
              </div>

              <div className="checkin-times">
                <div className="checkin-times__field">
                  <span className="checkin-muted-text">
                    {panel.standardCheckIn}
                  </span>
                  <span className="checkin-time">
                    {checkInTime}
                  </span>
                </div>
                <div className="checkin-times__field">
                  <span className="checkin-muted-text">
                    {t.checkinInfo.checkOutTime}
                  </span>
                  <span className="checkin-time">
                    {checkOutTime}
                  </span>
                </div>
              </div>

              <div className="checkin-stack">
                {arrivalRequest && (
                  <div className="checkin-card">
                    <div className="checkin-row__head">
                      <p className="checkin-label">
                        {panel.latestRequest}
                      </p>
                      <span className={`checkin-status-pill checkin-status-${arrivalRequest.status}`}>
                        {requestStatusText(arrivalRequest.status).label}
                      </span>
                    </div>
                    <p className="checkin-copy">
                      {panel.preferredArrivalTime}: <strong className="checkin-value">{arrivalRequest.requestedTime}</strong>
                    </p>
                    <p className="checkin-copy">
                      {requestStatusText(arrivalRequest.status).description}
                    </p>
                  </div>
                )}

                {!isRequestingArrival && arrivalRequest?.status !== 'pending' && (
                  <button
                    type="button"
                    onClick={handleOpenArrivalRequest}
                    className="ui-btn ui-btn--secondary ui-btn--sm ui-btn--block"
                  >
                    {panel.requestDifferentArrival}
                  </button>
                )}

                {isRequestingArrival && (
                  <div className="checkin-card checkin-card--strong">
                    <label className="ui-field">
                      <span className="ui-field__label">
                        {panel.preferredArrivalTime}
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
                        {panel.arrivalNote}
                      </span>
                      <textarea
                        value={arrivalRequestMessage}
                        onChange={(event) => setArrivalRequestMessage(event.target.value)}
                        maxLength={500}
                        rows={3}
                        placeholder={panel.arrivalNotePlaceholder}
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
                        {arrivalRequestSubmitting ? t.checkin.saving : panel.sendRequest}
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
                        {panel.cancel}
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
            </div>
          </div>

          <div className="checkin-row">
            <Icon name="car" className="checkin-icon-token" />
            <div className="checkin-row__body">
              <h3 className="checkin-title">{t.checkinInfo.parking}</h3>
              <p className="checkin-copy">
                {t.checkinInfo.parkingDetail}
              </p>
            </div>
          </div>
        </section>

        <section id="wifi" className="checkin-panel" aria-labelledby="wifi-title">
          <SectionTitle id="wifi-title" title={t.checkinInfo.wifiTitle} icon="wifi" />
          <WifiAccessCard
            networkLabel={t.checkinInfo.wifiNetwork}
            passwordLabel={t.checkinInfo.wifiPassword}
            network={wifiNetwork}
            password={wifiPassword}
            unavailableLabel={panel.unavailable}
            notice={wifiNotice}
            copyLabel={t.checkinInfo.copy}
            copiedLabel={t.checkinInfo.copied}
            copiedTarget={copiedTarget === 'network' || copiedTarget === 'password' ? copiedTarget : null}
            onCopy={copyToClipboard}
            networkCopyLabel={panel.networkCopyLabel}
            passwordCopyLabel={panel.passwordCopyLabel}
          />
        </section>

        <section id="house-rules" className="checkin-panel" aria-labelledby="house-rules-title">
          <SectionTitle id="house-rules-title" title={t.checkinInfo.houseRulesTitle} icon="rules" />
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
          <p className="checkin-copy">{t.stay.checkin.checkoutBy.replace('{time}', checkOutTime)}</p>
          <div className="checkin-row">
            <Icon name="key" className="checkin-icon-token" />
            <div className="checkin-row__body">
              <h3 className="checkin-title">{t.checkinInfo.keysInfo}</h3>
              <p className="checkin-copy">
                {t.checkinInfo.keysDetail}
              </p>
            </div>
          </div>
        </section>

        <section id="emergency" className="checkin-panel" aria-labelledby="emergency-title">
          <SectionTitle id="emergency-title" title={t.checkinInfo.emergencyTitle} icon="phone" />
          <div className="checkin-divided">
            {emergencyItems.map((item) => (
              <div key={`${item.label}-${item.value}`} className="checkin-contact">
                <div className="checkin-contact__text">
                  <h3 className="checkin-title">{item.label}</h3>
                  <p className="checkin-copy">{item.value}</p>
                </div>
                {item.href && (
                  <a
                    href={item.href}
                    className="ui-icon-btn checkin-call shell-link"
                    aria-label={`${t.checkinInfo.emergencyTitle}: ${item.label}`}
                  >
                    <Icon name="phone" className="checkin-action-icon" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="checkin-panel" aria-labelledby="good-to-know-title">
          <SectionTitle id="good-to-know-title" title={t.checkinInfo.additionalTitle} icon="info" />
          <div className="checkin-stack">
            {goodToKnowItems.map((item) => (
              <div key={item.label} className="checkin-line">
                <Icon name={item.icon} className="checkin-icon-token" />
                <p className="checkin-copy">
                  <strong className="checkin-title">{item.label}:</strong>{' '}
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
                  <h3 className="checkin-title">{group.title}</h3>
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
          <SectionTitle id="tips-title" title={t.checkinInfo.tipsTitle} icon="map-pin" />
          <div className="checkin-divided">
            {tipItems.map((tip) => (
              <div key={tip.text} className="checkin-line">
                <Icon name={tip.icon} className="checkin-accent-token" />
                <p className="checkin-copy">{tip.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="checkin-panel checkin-panel--guide" aria-labelledby="checkin-guide-title">
          <SectionTitle id="checkin-guide-title" title={t.shell.navGuide} icon="map" />
          <p className="checkin-copy">{t.stay.checkin.guideText}</p>
          <a href={`/${locale}/moments`} className="ui-btn ui-btn--link-arrow checkin-guide-link">
            {t.stay.checkin.guideCta}
          </a>
        </section>

        <section className="checkin-panel checkin-panel--wide" aria-labelledby="neighborhood-title">
          <SectionTitle id="neighborhood-title" eyebrow={t.locationPanel.nearby} title={t.locationPanel.locationTitle} icon="map" />
          <p className="checkin-copy">
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
            {t.locationPanel.highlights.length > 0 && (
              <div className="checkin-highlights">
                {t.locationPanel.highlights.map(({ icon, title, description }) => (
                  <div
                    key={`${title}-${description}`}
                    className="checkin-card checkin-line"
                  >
                    <Icon name={icon} className="checkin-accent-token" />
                    <div>
                      <h3 className="checkin-title">{title}</h3>
                      <p className="checkin-copy checkin-copy--small">{description}</p>
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
