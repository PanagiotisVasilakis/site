"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import internalFetch from '@/lib/internalFetchClient';
import tracker from '@/lib/tracker';
import ErrorSummary from '@/components/ErrorSummary';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import StartBookingCTA from './start-booking-cta';
import { DEFAULT_ABROAD_DIAL, phoneCountriesPrioritized } from '@/lib/phoneCountries';

type Mode = 'signin' | 'signup';
type Origin = 'GR' | 'ABROAD' | '';

export default function UnifiedGuestClient() {
  const params = useParams() as { locale: string };
  const locale = (params?.locale as Locale) || 'en';
  const dict = getDictionary(locale);
  const router = useRouter();
  const search = useSearchParams();
  const prefersReduced = useReducedMotion();

  const initialMode: Mode = (search?.get('mode') === 'signup' ? 'signup' : 'signin');
  const [mode, setMode] = useState<Mode>(initialMode);
  const [origin, setOrigin] = useState<Origin>('');
  const [phone, setPhone] = useState('');
  const [phoneDial, setPhoneDial] = useState<string>('+30');
  const [afm, setAfm] = useState('');
  const [passport, setPassport] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [remember, setRemember] = useState(true);
  const [bookingRef, setBookingRef] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<{ summary: string; details?: string[] } | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const phoneOptions = phoneCountriesPrioritized;

  // Seed analytics and URL mode parameter
  useEffect(() => {
    tracker.portalOpened('unified');
    router.replace(`/${locale}/guest?mode=${initialMode}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update URL and analytics when mode changes
  useEffect(() => {
    router.replace(`/${locale}/guest?mode=${mode}`, { scroll: false });
    try { tracker.authModeChanged(mode); } catch {}
    // focus heading for accessibility
    const h = headingRef.current; if (h) h.focus();
  }, [mode, locale, router]);

  const variants = useMemo(() => ({
    initial: { opacity: 0, y: prefersReduced ? 0 : 8 },
    animate: { opacity: 1, y: 0, transition: { duration: prefersReduced ? 0 : 0.22, ease: 'easeOut' } },
    exit: { opacity: 0, y: prefersReduced ? 0 : -6, transition: { duration: prefersReduced ? 0 : 0.18, ease: 'easeIn' } },
  }), [prefersReduced]);

  const ctaContainer = useMemo(() => ({
    initial: {},
    animate: { transition: { staggerChildren: prefersReduced ? 0 : 0.06 } },
  }), [prefersReduced]);
  const ctaItem = useMemo(() => ({
    initial: { opacity: 0, y: prefersReduced ? 0 : 6 },
    animate: { opacity: 1, y: 0, transition: { duration: prefersReduced ? 0 : 0.2, ease: 'easeOut' } },
  }), [prefersReduced]);

  function resetErrors() { setSubmitError(null); }

  function selectOrigin(o: 'GR' | 'ABROAD') {
    setOrigin(o);
    try { tracker.originSelected(o, mode === 'signup' ? 'signup' : undefined); } catch {}
    // After selecting origin, move focus to the first input for a smooth flow
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => { phoneInputRef.current?.focus(); });
    }
    // Suggest a default dial code based on origin
  setPhoneDial(o === 'GR' ? '+30' : DEFAULT_ABROAD_DIAL);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); resetErrors(); setLoading(true);
    try {
      const digits = phone.replace(/\D/g, '');
      const dialDigits = phoneDial.replace('+', '');
      const e164 = digits.startsWith(dialDigits) ? `+${digits}` : `${phoneDial}${digits}`;
      type Base = { origin: 'GR' | 'ABROAD'; phone: string; remember?: boolean; bookingRef?: string; lastName?: string; mode?: 'signup' };
      type Payload = (Base & { origin: 'GR'; afm: string }) | (Base & { origin: 'ABROAD'; passport: string });
      const base: Base = {
        origin: origin === 'GR' ? 'GR' : 'ABROAD',
        phone: e164,
        remember,
        bookingRef: bookingRef || undefined,
        lastName: lastName || undefined,
        ...(mode === 'signup' ? { mode: 'signup' as const } : {}),
      };
      const payload: Payload = base.origin === 'GR' ? { ...base, origin: 'GR', afm } : { ...base, origin: 'ABROAD', passport };
  // Optional signup fields are client-only; API ignores them, so we don't include them
  tracker.formSubmitted(mode === 'signup' ? 'sign-up' : 'sign-in');
      const res = await internalFetch(`/api/portal/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const mapped = mapApiErrorToUI(json);
        setSubmitError({ summary: mapped.summary, details: mapped.details });
        return;
      }
      router.push(`/${locale}/check-in`);
    } catch (err) {
      const mapped = mapApiErrorToUI(err);
      setSubmitError({ summary: mapped.summary, details: mapped.details });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="card p-6 text-[color:var(--fg-default)]">
        {/* Tabs */}
        <div role="tablist" aria-label="Authentication mode" className="flex rounded-full p-1 mb-4"
             style={{ background: 'var(--layer-bg-subtle)', border: '1px solid var(--border-soft)' }}>
          {(['signin','signup'] as Mode[]).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              aria-controls={`panel-${m}`}
              id={`tab-${m}`}
              className={`flex-1 h-9 rounded-full text-sm font-medium transition ${mode === m ? 'shadow' : ''}`}
              style={mode === m ? { background: 'var(--layer-surface)', color: 'var(--fg-default)' } : { color: 'var(--fg-muted)' }}
              onClick={() => setMode(m)}
            >
              {m === 'signin' ? (dict.portal?.signInTitle || 'Sign in') : (dict.portal?.signUpTitle || 'Sign up')}
            </button>
          ))}
        </div>

        {/* Forms */}
        <div className="relative min-h-[320px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={mode} variants={variants} initial="initial" animate="animate" exit="exit" aria-live="polite">
              <h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold mb-3" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`}
                  style={{ color: 'var(--text-accent)' }}>
                {mode === 'signin' ? (dict.portal?.signInTitle || 'Sign in') : (dict.portal?.signUpTitle || 'Sign up')}
              </h1>

              {submitError ? (
                <div className="mb-3">
                  <ErrorSummary
                    summary={submitError.summary}
                    details={submitError.details}
                    onRetry={() => { setSubmitError(null); }}
                    supportHref={`/${locale}/contact`}
                  />
                </div>
              ) : null}

              <form onSubmit={onSubmit} className="space-y-3" aria-busy={loading} noValidate>
                {/* Step 1 Origin (elegant selection) */}
                <div>
                  <label className="block text-sm mb-2">{dict.portal?.originQuestion || 'Where are you coming from?'}</label>
                  <div role="radiogroup" aria-label="Origin selection" className="grid grid-cols-2 gap-3">
                    {/* Greece option */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={origin === 'GR'}
                      tabIndex={0}
                      onClick={() => selectOrigin('GR')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOrigin('GR'); } }}
                      className="rounded-xl p-4 transition focus:outline-none"
                      style={origin === 'GR'
                        ? { background: 'var(--layer-surface)', border: '1px solid var(--brand-400)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand-400) 20%, transparent)' }
                        : { background: 'var(--layer-surface)', border: '1px solid var(--border-soft)' }
                      }
                    >
                      <div className="text-2xl mb-1" aria-hidden>🇬🇷</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-accent)' }}>{dict.portal?.originGR || 'Greece'}</div>
                    </button>
                    {/* Abroad option */}
                    <button
                      type="button"
                      role="radio"
                      aria-checked={origin === 'ABROAD'}
                      tabIndex={0}
                      onClick={() => selectOrigin('ABROAD')}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOrigin('ABROAD'); } }}
                      className="rounded-xl p-4 transition focus:outline-none"
                      style={origin === 'ABROAD'
                        ? { background: 'var(--layer-surface)', border: '1px solid var(--brand-400)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand-400) 20%, transparent)' }
                        : { background: 'var(--layer-surface)', border: '1px solid var(--border-soft)' }
                      }
                    >
                      <div className="text-2xl mb-1" aria-hidden>🌍</div>
                      <div className="text-sm font-medium" style={{ color: 'var(--text-accent)' }}>{dict.portal?.originAbroad || 'Abroad'}</div>
                    </button>
                  </div>
                </div>

                {origin ? (
                  <>
                    {/* Step 2 Details */}
                    <div>
                      <label className="block text-sm mb-1">{dict.portal?.phoneLabel || 'Phone Number'}</label>
                      <div className="grid grid-cols-[auto,1fr] gap-2 items-center">
                        <select
                          aria-label="Country code"
                          className="input"
                          value={phoneDial}
                          onChange={(e) => setPhoneDial(e.target.value)}
                        >
                          {phoneOptions.map(opt => (
                            <option key={opt.cc} value={opt.dial}>{`${opt.flag} ${opt.dial} ${opt.name}`}</option>
                          ))}
                        </select>
                        <input
                          ref={phoneInputRef}
                          className="w-full input"
                          value={phone}
                          onChange={e=>setPhone(e.target.value)}
                          placeholder={`${phoneDial} …`}
                          inputMode="tel"
                          required
                        />
                      </div>
                    </div>
                    {origin === 'GR' && (
                      <div>
                        <label className="block text-sm mb-1">{dict.portal?.afmLabel || 'AFM (9 digits)'}</label>
                        <input className="w-full input" value={afm} onChange={e=>setAfm(e.target.value)} inputMode="numeric" pattern="\\d{9}" required />
                      </div>
                    )}
                    {origin === 'ABROAD' && (
                      <div>
                        <label className="block text-sm mb-1">{dict.portal?.passportLabel || 'Passport Number'}</label>
                        <input className="w-full input" value={passport} onChange={e=>setPassport(e.target.value)} required />
                      </div>
                    )}

                {/* Optional signup-only fields */}
                {mode === 'signup' && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-sm mb-1">Email (optional)</label>
                      <input className="w-full input" type="email" value={email} onChange={e=>setEmail(e.target.value)} />
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} /> I agree to receive updates (optional)</label>
                  </div>
                )}

                    {/* Optional booking links – only for sign up */}
                    {mode === 'signup' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm mb-1">{dict.portal?.bookingRefLabel || 'Booking reference (optional)'}</label>
                          <input className="w-full input" value={bookingRef} onChange={e=>setBookingRef(e.target.value)} />
                        </div>
                        <div>
                          <label className="block text-sm mb-1">{dict.portal?.lastNameLabel || 'Last name (optional)'}</label>
                          <input className="w-full input" value={lastName} onChange={e=>setLastName(e.target.value)} />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} /> {dict.portal?.rememberMe || 'Remember me on this device'}</label>
                    </div>

                    <button className="booking-button ready w-full" type="submit" disabled={loading || !origin} aria-busy={loading}>
                      {loading ? 'Working…' : (dict.portal?.continueBtn || 'Continue')}
                    </button>
                  </>
                ) : null}
              </form>

              {/* Alternative path: no booking yet → go to home/booking */}
              <motion.div
                className="mt-4"
                variants={ctaContainer}
                initial="initial"
                animate="animate"
                aria-live="polite"
              >
                <motion.div variants={ctaItem} className="flex items-center gap-2 my-3">
                  <span className="flex-1 h-px bg-[color:var(--border-soft)]" />
                  <span className="text-xs" style={{ color: 'var(--text-accent-subtle)' }}>{dict.portal?.or || 'or'}</span>
                  <span className="flex-1 h-px bg-[color:var(--border-soft)]" />
                </motion.div>
                <motion.div variants={ctaItem}>
                  <StartBookingCTA locale={locale} />
                </motion.div>
                {/* Home button removed intentionally; StartBookingCTA covers navigation */}
              </motion.div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
