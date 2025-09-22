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
  const [entry, setEntry] = useState<'initial' | 'has'>('initial');
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

  const panelRef = useRef<HTMLDivElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const phoneOptions = phoneCountriesPrioritized;

  const variants = useMemo(() => ({
    initial: { opacity: 0, y: prefersReduced ? 0 : 8 },
    animate: { opacity: 1, y: 0, transition: { duration: prefersReduced ? 0 : 0.18 } },
    exit: { opacity: 0, y: prefersReduced ? 0 : -8, transition: { duration: prefersReduced ? 0 : 0.12 } },
  }), [prefersReduced]);

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
  }, [mode, locale, router]);

  // Focus panel when mode changes
  useEffect(() => {
    panelRef.current?.focus();
  }, [mode]);

  const selectOrigin = (o: Origin) => {
    if (!o) return;
    setOrigin(o);
    setPhoneDial(o === 'GR' ? '+30' : DEFAULT_ABROAD_DIAL);
    try { tracker.originSelected(o); } catch {}
    setTimeout(() => phoneInputRef.current?.focus(), 0);
  };

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (!origin) return;
    setLoading(true);
    setSubmitError(null);
    try {
      const raw = `${phoneDial}${phone}`.replace(/\s|\(|\)|-|\./g, '');
      const phoneE164 = raw.startsWith('+') ? raw : `+${raw}`;

      const base: Record<string, unknown> = {
        origin: origin === 'GR' ? 'GR' : 'ABROAD',
        phone: phoneE164,
        remember,
      };
      if (origin === 'GR') base.afm = afm;
      if (origin === 'ABROAD') base.passport = passport;
      if (mode === 'signup') {
        if (bookingRef) base.bookingRef = bookingRef;
        if (lastName) base.lastName = lastName;
        if (email) base.email = email;
        base.consent = consent;
      }

      const res = await internalFetch('/api/portal/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(base),
      });

      if (!res.ok) {
        let summary = 'Something went wrong';
        let details: string[] | undefined = undefined;
        try {
          const errJson = await res.json();
          const mapped = mapApiErrorToUI(errJson);
          summary = mapped.summary;
          details = mapped.details;
        } catch {}
        setSubmitError({ summary, details });
      } else {
  try { tracker.formSubmitted(mode === 'signup' ? 'sign-up' : 'sign-in'); } catch {}
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        const redirect = data?.data?.redirect || `/${locale}/check-in`;
        router.push(redirect);
      }
    } catch {
      setSubmitError({ summary: 'Network error', details: ['Please check your connection and try again.'] });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    // Go back to entry gate and reset transient state
    setEntry('initial');
    setOrigin('');
    setPhone('');
    setAfm('');
    setPassport('');
    setEmail('');
    setConsent(false);
    setRemember(true);
    setBookingRef('');
    setLastName('');
    setSubmitError(null);
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-md p-4">
  <div className="main-glass-container card p-5">
        {entry === 'initial' ? (
          <div className="min-h-[220px] flex items-center justify-center">
            <div className="w-full max-w-sm mx-auto flex flex-col gap-3 text-center">
              <button type="button" className="btn-primary w-full" onClick={() => setEntry('has')}>
                {dict.portal?.alreadyBooked || 'Booking & Check-in Details'}
              </button>
              <StartBookingCTA locale={locale} />
            </div>
          </div>
        ) : (
          <>
            {/* Back arrow */}
            <div className="mb-3">
              <button
                type="button"
                onClick={handleBack}
                aria-label={dict.ui?.back || 'Back'}
                title={dict.ui?.back || 'Back'}
                className="btn-outline"
              >
                <span aria-hidden>←</span>
                <span className="ml-1">{dict.ui?.back || 'Back'}</span>
              </button>
            </div>
            <motion.div
              role="tablist"
              aria-label="Authentication mode"
              className="flex rounded-full p-1 layer-surface border border-[color:var(--border-soft)] shadow-sm"
              layout
              animate={{ marginBottom: origin ? 'clamp(8px, 3.8vh, 32px)' : 'clamp(18px, 9.2vh, 96px)' }}
              transition={{ duration: prefersReduced ? 0 : 0.35, ease: 'easeOut' }}
            >
              {(['signin', 'signup'] as Mode[]).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} aria-controls={`panel-${m}`} id={`tab-${m}`} className={`flex-1 h-9 rounded-full text-sm font-medium transition ${mode === m ? 'shadow' : ''}`} style={mode === m ? { background: 'var(--layer-surface)', color: 'var(--fg-default)' } : { color: 'var(--fg-muted)' }} onClick={() => setMode(m)}>
                  {m === 'signin' ? (dict.portal?.signInTitle || 'Sign in') : (dict.portal?.signUpTitle || 'Sign up')}
                </button>
              ))}
            </motion.div>

            <motion.div
              className="relative"
              layout
              animate={{ minHeight: origin ? 'clamp(360px, 52vh, 560px)' : 'clamp(220px, 34vh, 340px)' }}
              transition={{ duration: prefersReduced ? 0 : 0.3, ease: 'easeOut' }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={mode} variants={variants} initial="initial" animate="animate" exit="exit" aria-live="polite">
                  <div ref={panelRef} role="tabpanel" id={`panel-${mode}`} aria-labelledby={`tab-${mode}`} tabIndex={-1}>
                    {submitError ? (
                      <div className="mb-3">
                        <ErrorSummary summary={submitError.summary} details={submitError.details} onRetry={() => { setSubmitError(null); }} supportHref={`/${locale}/contact`} />
                      </div>
                    ) : null}

                    <form onSubmit={onSubmit} className="space-y-3" aria-busy={loading} noValidate>
                      <motion.div layout>
                        <div>
                          <label className="block text-lg md:text-xl font-semibold mb-4" style={{ color: 'var(--fg-default)' }}>{dict.portal?.originQuestion || 'Where are you coming from?'}</label>
                          <div role="radiogroup" aria-label="Origin selection" className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                            <button type="button" role="radio" aria-checked={origin === 'GR'} tabIndex={0} onClick={() => selectOrigin('GR')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOrigin('GR'); } }} className="card p-5 md:p-6 h-32 md:h-36 w-full flex flex-col items-center justify-center transition focus:outline-none" style={origin === 'GR' ? { border: '1px solid var(--brand-400)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand-400) 20%, transparent)' } : {}}>
                              <div className="text-4xl md:text-5xl mb-2" aria-hidden>🇬🇷</div>
                              <div className="text-base md:text-lg font-semibold" style={{ color: origin === 'GR' ? 'var(--fg-default)' : 'var(--fg-muted)' }}>{dict.portal?.originGR || 'Greece'}</div>
                            </button>
                            <button type="button" role="radio" aria-checked={origin === 'ABROAD'} tabIndex={0} onClick={() => selectOrigin('ABROAD')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOrigin('ABROAD'); } }} className="card p-5 md:p-6 h-32 md:h-36 w-full flex flex-col items-center justify-center transition focus:outline-none" style={origin === 'ABROAD' ? { border: '1px solid var(--brand-400)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--brand-400) 20%, transparent)' } : {}}>
                              <div className="text-4xl md:text-5xl mb-2" aria-hidden>🌍</div>
                              <div className="text-base md:text-lg font-semibold" style={{ color: origin === 'ABROAD' ? 'var(--fg-default)' : 'var(--fg-muted)' }}>{dict.portal?.originAbroad || 'World'}</div>
                            </button>
                          </div>
                        </div>
                      </motion.div>

                      {origin ? (
                        <div className="text-[color:var(--fg-default)]">
                          <div>
                            <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>{dict.portal?.phoneLabel || 'Phone Number'}</label>
                            <div className="grid grid-cols-[auto,1fr] gap-2 items-center">
                              <select
                                aria-label="Country code"
                                className="input"
                                style={{ color: 'var(--fg-default) !important' }}
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
                                style={{ 
                                  color: 'var(--fg-default) !important',
                                  '--placeholder-color': 'var(--fg-muted)',
                                } as React.CSSProperties & { '--placeholder-color'?: string }}
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
                              <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>{dict.portal?.afmLabel || 'AFM (9 digits)'}</label>
                              <input 
                                className="w-full input" 
                                style={{ 
                                  color: 'var(--fg-default) !important',
                                  '--placeholder-color': 'var(--fg-muted)',
                                } as React.CSSProperties}
                                value={afm} 
                                onChange={e=>setAfm(e.target.value)} 
                                placeholder="123456789"
                                inputMode="numeric" 
                                pattern="\\d{9}" 
                                required 
                              />
                            </div>
                          )}
                          {origin === 'ABROAD' && (
                            <div>
                              <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>{dict.portal?.passportLabel || 'Passport Number'}</label>
                              <input 
                                className="w-full input" 
                                style={{ 
                                  color: 'var(--fg-default) !important',
                                  '--placeholder-color': 'var(--fg-muted)',
                                } as React.CSSProperties}
                                value={passport} 
                                onChange={e=>setPassport(e.target.value)} 
                                placeholder="A12345678"
                                required 
                              />
                            </div>
                          )}

                          {mode === 'signup' && (
                            <div className="grid grid-cols-1 gap-3">
                              <div>
                                <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>Email (optional)</label>
                                <input 
                                  className="w-full input" 
                                  style={{ 
                                    color: 'var(--fg-default) !important',
                                    '--placeholder-color': 'var(--fg-muted)',
                                  } as React.CSSProperties}
                                  type="email" 
                                  value={email} 
                                  onChange={e=>setEmail(e.target.value)} 
                                  placeholder="guest@example.com"
                                />
                              </div>
                              <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--fg-default)' }}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} /> I agree to receive updates (optional)</label>
                            </div>
                          )}

                          {mode === 'signup' && (
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>{dict.portal?.bookingRefLabel || 'Booking reference (optional)'}</label>
                                <input 
                                  className="w-full input" 
                                  style={{ 
                                    color: 'var(--fg-default) !important',
                                    '--placeholder-color': 'var(--fg-muted)',
                                  } as React.CSSProperties}
                                  value={bookingRef} 
                                  onChange={e=>setBookingRef(e.target.value)} 
                                  placeholder="ABC123"
                                />
                              </div>
                              <div>
                                <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>{dict.portal?.lastNameLabel || 'Last name (optional)'}</label>
                                <input 
                                  className="w-full input" 
                                  style={{ 
                                    color: 'var(--fg-default) !important',
                                    '--placeholder-color': 'var(--fg-muted)',
                                  } as React.CSSProperties}
                                  value={lastName} 
                                  onChange={e=>setLastName(e.target.value)} 
                                  placeholder="Smith"
                                />
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--fg-default)' }}><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} /> {dict.portal?.rememberMe || 'Remember me on this device'}</label>
                          </div>

                          <button className="btn-primary w-full" type="submit" disabled={loading || !origin} aria-busy={loading}>
                            {loading ? 'Working…' : (dict.portal?.continueBtn || 'Continue')}
                          </button>
                        </div>
                      ) : null}
                    </form>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
