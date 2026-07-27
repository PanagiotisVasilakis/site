'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import ErrorSummary from '@/components/ErrorSummary';
import { isGuestFormValid, type GuestMode, type GuestOrigin } from '@/components/guest/guestValidation';
import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import internalFetch from '@/lib/internalFetchClient';
import { emitGuestSessionChanged } from '@/lib/sessionSignals';
import { tracker } from '@/lib/tracker';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';

export default function UnifiedGuestClient() {
  const params = useParams() as { locale?: string };
  const locale = (params.locale === 'el' ? 'el' : 'en') as Locale;
  const dictionary = getDictionary(locale).portal;
  const router = useRouter();
  const search = useSearchParams();
  const searchKey = search.toString();
  const initialMode: GuestMode = search.get('mode') === 'signup' ? 'signup' : 'signin';
  const initialFlash = search.get('flash')?.trim().slice(0, 300) || '';
  const syncingFromUrlRef = useRef(false);

  const [mode, setMode] = useState<GuestMode>(initialMode);
  const [origin, setOrigin] = useState<GuestOrigin>('');
  const [claimToken, setClaimToken] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<{ summary: string; details?: string[] } | null>(
    initialFlash ? { summary: initialFlash } : null,
  );

  const valid = useMemo(() => isGuestFormValid(mode, {
    origin,
    claimToken,
    phone,
    password,
    acceptTerms,
  }), [acceptTerms, claimToken, mode, origin, password, phone]);

  useEffect(() => {
    tracker.portalOpened('unified');
  }, []);

  useEffect(() => {
    const current = new URL(window.location.href);
    const before = current.toString();
    current.searchParams.delete('claim');
    current.searchParams.delete('claimToken');
    if (/^#.*claim(?:Token)?=/iu.test(current.hash)) current.hash = '';
    if (current.toString() !== before) {
      window.history.replaceState(
        window.history.state,
        '',
        `${current.pathname}${current.search}${current.hash}`,
      );
    }
  }, []);

  useEffect(() => {
    syncingFromUrlRef.current = true;
    setMode(initialMode);
    setSubmitError(initialFlash ? { summary: initialFlash } : null);
  }, [initialFlash, initialMode, searchKey]);

  useEffect(() => {
    if (syncingFromUrlRef.current) {
      syncingFromUrlRef.current = false;
      return;
    }
    const nextSearch = new URLSearchParams(searchKey);
    nextSearch.delete('claim');
    nextSearch.delete('claimToken');
    if (nextSearch.get('mode') === mode) return;
    nextSearch.set('mode', mode);
    router.replace(`/${locale}/guest?${nextSearch.toString()}`, { scroll: false });
    tracker.authModeChanged(mode);
  }, [locale, mode, router, searchKey]);

  function changeMode(nextMode: GuestMode) {
    setMode(nextMode);
    setSubmitError(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    setSubmitError(null);

    const endpoint = mode === 'signup' ? '/api/portal/claims' : '/api/portal/sessions';
    const body = mode === 'signup'
      ? { origin, phone: phone.trim(), password, remember, acceptTerms }
      : { phone: phone.trim(), password, remember };

    try {
      if (mode === 'signup') {
        const exchangeResponse = await internalFetch('/api/portal/claim-exchange', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ claimToken: claimToken.trim() }),
        });
        const exchangeJson = await exchangeResponse.json().catch(() => null);
        if (!exchangeResponse.ok) {
          const mapped = mapApiErrorToUI(exchangeJson, locale);
          setSubmitError({ summary: mapped.summary, details: mapped.details });
          return;
        }
      }
      const response = await internalFetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const mapped = mapApiErrorToUI(json, locale);
        setSubmitError({ summary: mapped.summary, details: mapped.details });
        return;
      }

      tracker.formSubmitted(mode === 'signup' ? 'sign-up' : 'sign-in');
      emitGuestSessionChanged(mode === 'signup' ? 'claim' : 'signin');
      if (mode === 'signup') setClaimToken('');
      router.push(json?.data?.redirect || `/${locale}/check-in`);
    } catch {
      setSubmitError({
        summary: dictionary?.errors?.networkError || 'Network error',
        details: [dictionary?.errors?.networkErrorDetail || 'Please check your connection and try again.'],
      });
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-soft bg-[var(--layer-surface)] px-3 py-3 text-[color:var(--fg-default)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--focus-ring)]';

  return (
    <div className="mx-auto max-w-md p-4">
      <section className="main-glass-container surface-card p-5" aria-labelledby="guest-auth-title">
        <header className="mb-5 text-center">
          <h1 id="guest-auth-title" className="text-2xl font-bold">
            {mode === 'signin' ? dictionary?.signInTitle || 'Sign in' : dictionary?.signUpTitle || 'Activate booking access'}
          </h1>
          <p className="mt-1 text-sm text-subtle">
            {mode === 'signin'
              ? dictionary?.modeHintSignin || 'Access your booking and check-in details.'
              : dictionary?.modeHintSignup || 'Use the one-time claim token provided by your host.'}
          </p>
        </header>

        <div role="tablist" aria-label={dictionary?.a11y?.authMode || 'Authentication mode'} className="mb-5 flex rounded-full border border-soft p-1">
          {(['signin', 'signup'] as const).map((value) => (
            <button
              key={value}
              type="button"
              id={`tab-${value}`}
              role="tab"
              aria-selected={mode === value}
              aria-controls={`panel-${value}`}
              className={`h-11 flex-1 rounded-full text-sm font-medium ${mode === value ? 'surface-card shadow' : 'text-subtle'}`}
              onClick={() => changeMode(value)}
            >
              {value === 'signin' ? dictionary?.signInTitle || 'Sign in' : dictionary?.signUpTitle || 'Activate access'}
            </button>
          ))}
        </div>

        <div id={`panel-${mode}`} role="tabpanel" aria-labelledby={`tab-${mode}`} tabIndex={-1}>
          {submitError && (
            <div className="mb-4">
              <ErrorSummary summary={submitError.summary} details={submitError.details} onRetry={() => setSubmitError(null)} />
            </div>
          )}

          <form onSubmit={submit} noValidate className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label htmlFor="claim-token" className="mb-1 block text-sm font-medium">
                    {locale === 'el' ? 'Κωδικός ενεργοποίησης κράτησης' : 'Booking claim token'} *
                  </label>
                  <input
                    id="claim-token"
                    name="claimToken"
                    className={inputClass}
                    value={claimToken}
                    onChange={(event) => setClaimToken(event.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    minLength={32}
                    maxLength={256}
                    required
                  />
                  <p className="mt-1 text-xs text-subtle">
                    {locale === 'el' ? 'Χρησιμοποιήστε τον εφάπαξ κωδικό που σας έδωσε ο οικοδεσπότης.' : 'Use the one-time token provided by your host.'}
                  </p>
                </div>

                <div>
                  <label htmlFor="origin" className="mb-1 block text-sm font-medium">
                    {dictionary?.originQuestion || 'Where are you traveling from?'} *
                  </label>
                  <select id="origin" className={inputClass} value={origin} onChange={(event) => setOrigin(event.target.value as GuestOrigin)} required>
                    <option value="">{locale === 'el' ? 'Επιλέξτε χώρα προέλευσης' : 'Select country of origin'}</option>
                    <option value="GR">{dictionary?.originGR || 'Greece'}</option>
                    <option value="ABROAD">{dictionary?.originAbroad || 'Outside Greece'}</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label htmlFor="guest-phone" className="mb-1 block text-sm font-medium">
                {dictionary?.phoneLabel || 'Phone number'} *
              </label>
              <input
                id="guest-phone"
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+30 690 000 0000"
                className={inputClass}
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                minLength={8}
                maxLength={32}
                required
              />
            </div>

            <div>
              <label htmlFor="guest-password" className="mb-1 block text-sm font-medium">
                {dictionary?.passwordLabel || 'Password'} *
              </label>
              <div className="flex gap-2">
                <input
                  id="guest-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder={dictionary?.passwordPlaceholder || 'At least 8 characters'}
                  className={inputClass}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  className="rounded-lg border border-soft px-3 text-sm"
                  aria-label={showPassword ? dictionary?.a11y?.hidePassword || 'Hide password' : dictionary?.a11y?.showPassword || 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? '−' : 'Aa'}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={acceptTerms} onChange={(event) => setAcceptTerms(event.target.checked)} required />
                <span>
                  {locale === 'el'
                    ? 'Επιβεβαιώνω ότι τα στοιχεία μου είναι σωστά και αποδέχομαι τους όρους χρήσης και την επεξεργασία δεδομένων για την παροχή της διαμονής.'
                    : 'I confirm my details are correct and accept the portal terms and data processing needed to provide my stay.'}
                </span>
              </label>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>{dictionary?.rememberMe || 'Remember me on this device'}</span>
            </label>

            <button type="submit" disabled={!valid || loading} className="btn btn-primary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? dictionary?.working || 'Working…' : dictionary?.continueBtn || 'Continue'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
