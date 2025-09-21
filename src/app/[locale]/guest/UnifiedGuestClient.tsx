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

  function resetErrors() { setSubmitError(null); }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); resetErrors(); setLoading(true);
    try {
      const payload: any = { origin, phone, remember, bookingRef: bookingRef || undefined, lastName: lastName || undefined };
      if (mode === 'signup') payload.mode = 'signup';
      if (origin === 'GR') payload.afm = afm; else if (origin === 'ABROAD') payload.passport = passport;
      // Optional fields for signup (still posted but ignored by API)
      if (mode === 'signup') { payload.email = email || undefined; payload.consent = consent || undefined; }
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
      <div className="rounded-2xl shadow-lg border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] p-5">
        {/* Tabs */}
        <div role="tablist" aria-label="Authentication mode" className="flex rounded-full bg-[color:var(--layer-bg-subtle)] p-1 mb-4">
          {(['signin','signup'] as Mode[]).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              aria-controls={`panel-${m}`}
              id={`tab-${m}`}
              className={`flex-1 h-9 rounded-full text-sm font-medium transition ${mode === m ? 'bg-white shadow' : 'opacity-70 hover:opacity-100'}`}
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
                  style={{ color: 'var(--fg-default)' }}>
                {mode === 'signin' ? (dict.portal?.signInTitle || 'Guest Sign‑in') : (dict.portal?.signUpTitle || 'Guest Sign‑up')}
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
                {/* Step 1 Origin */}
                <div>
                  <label className="block text-sm mb-1">{dict.portal?.originQuestion || 'Where are you coming from?'}</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="origin" value="GR" checked={origin==='GR'} onChange={()=>{ setOrigin('GR'); tracker.originSelected('GR', mode==='signup'?'signup':undefined as any); }} /> {dict.portal?.originGR || 'Greece'}</label>
                    <label className="flex items-center gap-2 text-sm"><input type="radio" name="origin" value="ABROAD" checked={origin==='ABROAD'} onChange={()=>{ setOrigin('ABROAD'); tracker.originSelected('ABROAD', mode==='signup'?'signup':undefined as any); }} /> {dict.portal?.originAbroad || 'Abroad'}</label>
                  </div>
                </div>

                {/* Step 2 Details */}
                <div>
                  <label className="block text-sm mb-1">{dict.portal?.phoneLabel || 'Phone (E.164)'}</label>
                  <input className="w-full input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+30..." required />
                </div>
                {origin === 'GR' && (
                  <div>
                    <label className="block text-sm mb-1">{dict.portal?.afmLabel || 'AFM (9 digits)'}</label>
                    <input className="w-full input" value={afm} onChange={e=>setAfm(e.target.value)} inputMode="numeric" pattern="\\d{9}" required />
                  </div>
                )}
                {origin === 'ABROAD' && (
                  <div>
                    <label className="block text-sm mb-1">{dict.portal?.passportLabel || 'Passport'}</label>
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

                {/* Optional booking links */}
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

                <div>
                  <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} /> {(dict.portal as any)?.rememberMe || 'Remember me on this device'}</label>
                </div>

                <button className="booking-button ready w-full" type="submit" disabled={loading || !origin} aria-busy={loading}>
                  {loading ? 'Working…' : (dict.portal?.continueBtn || 'Continue')}
                </button>
              </form>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
