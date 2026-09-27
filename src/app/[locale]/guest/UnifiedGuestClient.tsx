'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import ErrorSummary from '@/components/ErrorSummary';
import { isGuestFormValid, type GuestMode, type GuestOrigin } from '@/components/guest/guestValidation';
import { normalizeLocale } from '@/i18n/config';
import { getDictionary } from '@/i18n/dictionaries';
import { GUEST_TERMS_TEXT } from '@/lib/guestTermsText';
import internalFetch from '@/lib/internalFetchClient';
import { emitGuestSessionChanged } from '@/lib/sessionSignals';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';

export default function UnifiedGuestClient() {
  const params = useParams() as { locale?: string };
  const locale = normalizeLocale(params.locale);
  const dictionary = getDictionary(locale).portal;
  const router = useRouter();
  const search = useSearchParams();
  const searchKey = search.toString();
  const initialMode: GuestMode = search.get('mode') === 'signup' ? 'signup' : 'signin';
  // `?flash=` carries a message code, never text: only known codes are shown.
  const flashCode = search.get('flash');
  const flashMessage = flashCode === 'session_required' ? dictionary?.errors?.sessionRequired : undefined;
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
    flashMessage ? { summary: flashMessage } : null,
  );

  const valid = useMemo(() => isGuestFormValid(mode, {
    origin,
    claimToken,
    phone,
    password,
    acceptTerms,
  }), [acceptTerms, claimToken, mode, origin, password, phone]);

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
  }, [initialMode, searchKey]);

  // Show a flash message once, then drop it from the URL so a mode change or a
  // reload does not bring it back.
  useEffect(() => {
    if (!flashCode) return;
    setSubmitError(flashMessage ? { summary: flashMessage } : null);
    const nextSearch = new URLSearchParams(searchKey);
    nextSearch.delete('flash');
    const query = nextSearch.toString();
    router.replace(`/${locale}/guest${query ? `?${query}` : ''}`, { scroll: false });
  }, [flashCode, flashMessage, locale, router, searchKey]);

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
        // The server does not reveal whether the password or the booking dates
        // failed (no password oracle), so the message names both causes.
        const signInFailed = mode === 'signin' && response.status === 401 ? dictionary?.errors?.signInFailed : undefined;
        setSubmitError({ summary: signInFailed ?? mapped.summary, details: signInFailed ? undefined : mapped.details });
        return;
      }

      emitGuestSessionChanged(mode === 'signup' ? 'claim' : 'signin');
      if (mode === 'signup') setClaimToken('');
      router.push(json?.data?.redirect || `/${locale}/check-in`);
    } catch {
      setSubmitError({
        summary: dictionary.errors.networkError,
        details: [dictionary.errors.networkErrorDetail],
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
            {mode === 'signin' ? dictionary.signInTitle : dictionary.signUpTitle}
          </h1>
          <p className="mt-1 text-sm text-subtle">
            {mode === 'signin'
              ? dictionary.modeHintSignin
              : dictionary.modeHintSignup}
          </p>
        </header>

        <div role="tablist" aria-label={dictionary.a11y.authMode} className="mb-5 flex rounded-full border border-soft p-1">
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
              {value === 'signin' ? dictionary.signInTitle : dictionary.signUpTitle}
            </button>
          ))}
        </div>

        <div id={`panel-${mode}`} role="tabpanel" aria-labelledby={`tab-${mode}`} tabIndex={-1}>
          {submitError && (
            <div className="mb-4">
              <ErrorSummary
                summary={submitError.summary}
                details={submitError.details}
                onRetry={() => setSubmitError(null)}
                locale={locale}
                supportHref={`/${locale}#contact`}
              />
            </div>
          )}

          <form onSubmit={submit} noValidate className="space-y-4">
            {mode === 'signup' && (
              <>
                <div>
                  <label htmlFor="claim-token" className="mb-1 block text-sm font-medium">
                    {dictionary.claimTokenLabel} *
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
                    {dictionary.claimTokenHint}
                  </p>
                </div>

                <div>
                  <label htmlFor="origin" className="mb-1 block text-sm font-medium">
                    {dictionary.originQuestion} *
                  </label>
                  <select id="origin" className={inputClass} value={origin} onChange={(event) => setOrigin(event.target.value as GuestOrigin)} required>
                    <option value="">{dictionary.originPlaceholder}</option>
                    <option value="GR">{dictionary.originGR}</option>
                    <option value="ABROAD">{dictionary.originAbroad}</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <label htmlFor="guest-phone" className="mb-1 block text-sm font-medium">
                {dictionary.phoneLabel} *
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
                {dictionary.passwordLabel} *
              </label>
              <div className="flex gap-2">
                <input
                  id="guest-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder={dictionary.passwordPlaceholder}
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
                  aria-label={showPassword ? dictionary.a11y.hidePassword : dictionary.a11y.showPassword}
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
                <span>{GUEST_TERMS_TEXT[locale]}</span>
              </label>
            )}

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              <span>{dictionary.rememberMe}</span>
            </label>

            <button type="submit" disabled={!valid || loading} className="btn btn-primary min-h-11 w-full disabled:cursor-not-allowed disabled:opacity-50">
              {loading ? dictionary.working : dictionary.continueBtn}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
