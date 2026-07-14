"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import internalFetch from '@/lib/internalFetchClient';
import { tracker } from '@/lib/tracker';
import { emitGuestSessionChanged } from '@/lib/sessionSignals';
import ErrorSummary from '@/components/ErrorSummary';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { DEFAULT_ABROAD_DIAL, phoneCountriesPrioritized } from '@/lib/phoneCountries';
import {
  isGuestFormValid,
  validateAfm,
  validatePassport,
  type GuestMode as Mode,
  type GuestOrigin as Origin,
} from '@/components/guest/guestValidation';

export default function UnifiedGuestClient() {
  const params = useParams() as { locale: string };
  const locale = (params?.locale as Locale) || 'en';
  const dict = getDictionary(locale);
  const pe = dict.portal?.errors;
  const problemWith = (field: string) => (pe?.problemWith ?? '❌ Problem with: {field}').replace('{field}', field);
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
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [bookingRef, setBookingRef] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<{ summary: string; details?: string[] } | null>(null);
  const formIsValid = isGuestFormValid(mode, {
    origin,
    phone,
    lastName,
    password,
    afm,
    passport,
  });
  
  // Custom dropdown state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Optional section collapse state
  const [isOptionalExpanded, setIsOptionalExpanded] = useState(false);

  // Input handlers with validation
  const handleAfmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, ''); // Remove non-digits
    if (value.length <= 9) {
      setAfm(value);
    }
  };

  const handlePassportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^A-Za-z0-9]/g, ''); // Remove non-alphanumeric
    if (value.length <= 20) {
      setPassport(value.toUpperCase());
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const applyPhoneDial = (dialCode: string) => {
    if (dialCode !== phoneDial) {
      setPhone('');
    }
    setPhoneDial(dialCode);
  };

  const handleCountrySelect = (dialCode: string) => {
    applyPhoneDial(dialCode);
    setIsDropdownOpen(false);
  };

  const panelRef = useRef<HTMLDivElement | null>(null);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const phoneOptions = phoneCountriesPrioritized;

  const variants = useMemo(() => ({
    initial: { opacity: 0, y: prefersReduced ? 0 : 8 },
    animate: { opacity: 1, y: 0, transition: { duration: prefersReduced ? 0 : 0.18 } },
    exit: { opacity: 0, y: prefersReduced ? 0 : -8, transition: { duration: prefersReduced ? 0 : 0.12 } },
  }), [prefersReduced]);

  const modeHint = mode === 'signin'
    ? (dict.portal?.modeHintSignin ?? 'Access your booking and check-in details.')
    : (dict.portal?.modeHintSignup ?? 'Create your guest account to continue.');

  // Seed analytics once; the mode effect below owns URL synchronization.
  useEffect(() => {
    tracker.portalOpened('unified');
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
    applyPhoneDial(o === 'GR' ? '+30' : DEFAULT_ABROAD_DIAL);
    try { tracker.originSelected(o); } catch {}
    setTimeout(() => phoneInputRef.current?.focus(), 0);
  };

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    
    // For sign-up, origin is required
    if (mode === 'signup' && !origin) return;

    // Frontend validation with specific field guidance
    // Skip full name validation for sign-in mode
    if (mode === 'signup' && (!lastName || lastName.trim().length === 0)) {
      setSubmitError({
        summary: problemWith(pe?.fieldLastName ?? 'Last name'),
        details: [
          pe?.empty ?? 'This field is empty',
          pe?.lastNameEmptyHint ?? 'Please enter your surname as it appears on your booking'
        ]
      });
      return;
    }

    if (!phone || phone.trim().length === 0) {
      setSubmitError({
        summary: problemWith(pe?.fieldPhone ?? 'Phone Number'),
        details: [
          pe?.empty ?? 'This field is empty',
          pe?.phoneEmpty1 ?? 'Please enter your phone number with country code',
          pe?.phoneEmpty2 ?? 'Example: +30 695 581 0051 or 6955810051'
        ]
      });
      return;
    }

    if (phone.trim().length < 8) {
      setSubmitError({
        summary: problemWith(pe?.fieldPhone ?? 'Phone Number'),
        details: [
          (pe?.phoneShort ?? 'You entered: {value} (only {count} digits)').replace('{value}', phone).replace('{count}', String(phone.trim().length)),
          pe?.phoneShort1 ?? 'Phone numbers must be at least 8 digits',
          pe?.phoneShort2 ?? 'Please enter your complete phone number'
        ]
      });
      return;
    }

    // Sign-up mode: validate origin and identity documents
    if (mode === 'signup' && origin === 'GR') {
      if (!afm || afm.trim().length === 0) {
        setSubmitError({
          summary: problemWith(pe?.fieldAfm ?? 'AFM (9 digits)'),
          details: [
            pe?.empty ?? 'This field is empty',
            pe?.afmEmpty1 ?? 'Please enter your 9-digit AFM (Αριθμός Φορολογικού Μητρώου)',
            pe?.afmEmpty2 ?? 'Your Greek tax identification number'
          ]
        });
        return;
      }
      if (!validateAfm(afm)) {
        setSubmitError({
          summary: problemWith(pe?.fieldAfm ?? 'AFM (9 digits)'),
          details: [
            (pe?.afmEntered ?? 'You entered: {value} ({count} digits)').replace('{value}', afm).replace('{count}', String(afm.length)),
            pe?.afmMust9 ?? 'AFM must be exactly 9 digits (0-9)',
            pe?.afmExample ?? 'Example: 123456789',
            pe?.afmAll9 ?? 'Please enter all 9 digits of your Greek tax number'
          ]
        });
        return;
      }
    }

    if (mode === 'signup' && origin === 'ABROAD') {
      if (!passport || passport.trim().length === 0) {
        setSubmitError({
          summary: problemWith(pe?.fieldPassport ?? 'Passport Number'),
          details: [
            pe?.empty ?? 'This field is empty',
            pe?.passportEmpty1 ?? 'Please enter your passport number',
            pe?.passportEmpty2 ?? 'Found on the information page of your passport'
          ]
        });
        return;
      }
      if (!validatePassport(passport)) {
        setSubmitError({
          summary: problemWith(pe?.fieldPassport ?? 'Passport Number'),
          details: [
            (pe?.passportEntered ?? 'You entered: {value} ({count} characters)').replace('{value}', passport).replace('{count}', String(passport.length)),
            pe?.passportMust ?? 'Passport must be 5-20 letters and numbers only',
            pe?.passportExample ?? 'Example: AB1234567',
            pe?.passportCheck ?? 'Please check your passport and enter the number correctly'
          ]
        });
        return;
      }
    }

    if (mode === 'signup' && bookingRef && bookingRef.trim().length > 0 && bookingRef.trim().length < 3) {
      setSubmitError({
        summary: problemWith(pe?.fieldBookingRef ?? 'Booking Reference'),
        details: [
          (pe?.bookingRefEntered ?? 'You entered: {value} (only {count} characters)').replace('{value}', bookingRef.trim()).replace('{count}', String(bookingRef.trim().length)),
          pe?.bookingRefMin ?? 'Booking reference must be at least 3 characters',
          pe?.bookingRefEmptyHint ?? "Or leave it empty if you don't have one"
        ]
      });
      return;
    }

    setLoading(true);
    setSubmitError(null);
    try {
      const raw = `${phoneDial}${phone}`.replace(/\s|\(|\)|-|\./g, '');
      const phoneE164 = raw.startsWith('+') ? raw : `+${raw}`;

      const base: Record<string, unknown> = {
        mode,
        phone: phoneE164,
        password,
        remember,
      };
      
      // Sign-up mode: include all additional fields
      if (mode === 'signup') {
        base.origin = origin === 'GR' ? 'GR' : 'ABROAD';
        if (origin === 'GR') base.afm = afm;
        if (origin === 'ABROAD') base.passport = passport;
        base.lastName = lastName;
        if (bookingRef) base.bookingRef = bookingRef;
      }

      const res = await internalFetch('/api/portal/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(base),
      });

      if (!res.ok) {
        let summary = pe?.somethingWentWrong ?? 'Something went wrong';
        let details: string[] | undefined = undefined;
        const errPrefix = pe?.errorPrefix ?? 'Error: ';
        try {
          const errJson = await res.json();
          const mapped = mapApiErrorToUI(errJson, locale === 'el' ? 'el' : 'en');
          
          // Make error messages more specific based on field errors
          if (mapped.fields) {
            const fieldErrors: string[] = [];
            
            if (mapped.fields.afm) {
              summary = problemWith(pe?.fieldAfm ?? 'AFM (9 digits)');
              fieldErrors.push(errPrefix + mapped.fields.afm);
              fieldErrors.push(pe?.afmMust9 ?? 'AFM must be exactly 9 digits (0-9)');
              fieldErrors.push(pe?.afmCheck ?? 'Please check your Greek tax identification number');
            }
            
            if (mapped.fields.passport) {
              summary = problemWith(pe?.fieldPassport ?? 'Passport Number');
              fieldErrors.push(errPrefix + mapped.fields.passport);
              fieldErrors.push(pe?.passportMust2 ?? 'Passport must be 5-20 letters and numbers');
              fieldErrors.push(pe?.passportCheck2 ?? 'Please check your passport and enter correctly');
            }
            
            if (mapped.fields.phone) {
              summary = problemWith(pe?.fieldPhone ?? 'Phone Number');
              fieldErrors.push(errPrefix + mapped.fields.phone);
              fieldErrors.push(pe?.phoneFormatIncorrect ?? 'Phone number format is incorrect');
              fieldErrors.push(pe?.phoneIncludeCode ?? 'Include country code: +30 695 581 0051');
            }
            
            if (mapped.fields.password) {
              summary = problemWith(pe?.fieldPassword ?? 'Password');
              fieldErrors.push(errPrefix + mapped.fields.password);
              if (mode === 'signin') {
                fieldErrors.push(pe?.passwordIncorrect ?? 'The password you entered is incorrect');
                fieldErrors.push(pe?.passwordTryReset ?? 'Please try again or reset your password');
              } else {
                fieldErrors.push(pe?.passwordMin8 ?? 'Password must be at least 8 characters long');
                fieldErrors.push(pe?.passwordStronger ?? 'Please enter a stronger password');
              }
            }
            
            if (mapped.fields.lastName) {
              summary = problemWith(pe?.fieldLastName ?? 'Last name');
              fieldErrors.push(errPrefix + mapped.fields.lastName);
              fieldErrors.push(pe?.lastNameEmptyHint ?? 'Please enter your surname as shown on your booking');
            }
            
            if (mapped.fields.bookingRef) {
              summary = problemWith(pe?.fieldBookingRef ?? 'Booking Reference');
              fieldErrors.push(errPrefix + mapped.fields.bookingRef);
              fieldErrors.push(pe?.bookingRefCheck ?? 'Check your booking confirmation email');
            }
            
            if (fieldErrors.length > 0) {
              details = fieldErrors;
            } else {
              summary = mapped.summary;
              details = mapped.details;
            }
          } else {
            // No field-specific errors, check if it's an authentication error
            if (mapped.summary.toLowerCase().includes('invalid') ||
                mapped.summary.toLowerCase().includes('unauthorized') ||
                mapped.summary.toLowerCase().includes('incorrect')) {
              // Sign-in authentication failure
              if (mode === 'signin') {
                summary = pe?.signinFailed ?? '❌ Sign-in failed';
                details = [
                  pe?.signinIncorrect ?? 'The phone number or password you entered is incorrect',
                  '',
                  pe?.phoneCheckCorrect ?? '📱 Phone Number: Check that you entered the correct number',
                  pe?.passwordUseRight ?? "🔒 Password: Make sure you're using the right password",
                  '',
                  pe?.tipSamePassword ?? 'Tip: If you just signed up, use the same password you created',
                  pe?.forgotPassword ?? 'If you forgot your password, please contact support'
                ];
              } else {
                summary = pe?.couldNotVerify ?? '❌ Could not verify your information';
                details = [
                  pe?.checkAllFields ?? 'Please check that all these fields are correct:',
                  '',
                  pe?.verifyLastName ?? '📝 Last name: Must match your booking',
                  pe?.verifyPhone ?? '📱 Phone Number: Include +30 or just the 10 digits',
                  origin === 'GR' 
                    ? (pe?.verifyAfm ?? '🆔 AFM: All 9 digits of your tax number')
                    : (pe?.verifyPassport ?? '🛂 Passport: Your passport number'),
                  '',
                  pe?.ifCorrectContact ?? 'If everything looks correct, contact support'
                ];
              }
            } else if (mapped.summary.toLowerCase().includes('not found') || 
                mapped.summary.toLowerCase().includes('no matching')) {
              summary = pe?.couldNotVerify ?? '❌ Could not verify your information';
              if (mode === 'signup') {
                // For sign-up, suggest contacting support if data doesn't match
                details = [
                  pe?.checkAllFields ?? 'Please check that all these fields are correct:',
                  '',
                  pe?.verifyLastName ?? '📝 Last name: Must match your booking',
                  pe?.verifyPhone ?? '📱 Phone Number: Include +30 or just the 10 digits',
                  origin === 'GR' 
                    ? (pe?.verifyAfm ?? '🆔 AFM: All 9 digits of your tax number')
                    : (pe?.verifyPassport ?? '🛂 Passport: Your passport number'),
                  '',
                  pe?.ifCorrectContact ?? 'If everything looks correct, contact support'
                ];
              } else {
                // For sign-in, just ask them to double-check their info
                details = [
                  pe?.doubleCheckFields ?? 'Please double-check that all fields are correct:',
                  '',
                  pe?.verifyPhone ?? '📱 Phone Number: Include +30 or just the 10 digits',
                  pe?.verifyPassword8 ?? '🔒 Password: Must be at least 8 characters',
                  '',
                  pe?.useSignupInstead ?? "If you haven't signed up yet, please use Sign Up instead"
                ];
              }
            } else {
              summary = mapped.summary;
              details = mapped.details;
            }
          }
        } catch {}
        setSubmitError({ summary, details });
      } else {
  try { tracker.formSubmitted(mode === 'signup' ? 'sign-up' : 'sign-in'); } catch {}
        const data = await res.json().catch(() => ({} as Record<string, unknown>));
        const redirect = data?.data?.redirect || `/${locale}/check-in`;
        emitGuestSessionChanged('signin');
        router.push(redirect);
      }
    } catch {
      setSubmitError({ summary: pe?.networkError ?? 'Network error', details: [pe?.networkErrorDetail ?? 'Please check your connection and try again.'] });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-4">
      <div className="main-glass-container surface-card p-5">
        <>
            <div className="mb-4 text-center">
              <h1 className="text-2xl font-serif italic font-bold">
                {mode === 'signin' ? (dict.portal?.signInTitle || 'Sign in') : (dict.portal?.signUpTitle || 'Sign up')}
              </h1>
              <p className="mt-1 text-sm text-subtle">
                {modeHint}
              </p>
            </div>

            <motion.div
              role="tablist"
              aria-label={dict.portal?.a11y?.authMode ?? 'Authentication mode'}
              className="flex rounded-full p-1 layer-surface border border-[color:var(--border-soft)] shadow-sm"
              layout
              animate={{ marginBottom: origin ? 'clamp(8px, 3.8vh, 32px)' : 'clamp(18px, 9.2vh, 96px)' }}
              transition={{ duration: prefersReduced ? 0 : 0.35, ease: 'easeOut' }}
            >
              {(['signin', 'signup'] as Mode[]).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} aria-controls={`panel-${m}`} id={`tab-${m}`} className={`flex-1 h-11 md:h-9 rounded-full text-sm font-medium transition ${mode === m ? 'shadow' : ''}`} style={mode === m ? { background: 'var(--layer-surface)', color: 'var(--fg-default)' } : { color: 'var(--fg-muted)' }} onClick={() => setMode(m)}>
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
                        <ErrorSummary summary={submitError.summary} details={submitError.details} onRetry={() => { setSubmitError(null); }} supportHref={`/${locale}#contact`} locale={locale} />
                      </div>
                    ) : null}

                    <form onSubmit={onSubmit} className="space-y-3" aria-busy={loading} noValidate>
                      {/* Sign-up mode: show origin selection */}
                      {mode === 'signup' && (
                        <motion.div layout>
                          <div>
                            <label className="block text-lg md:text-xl font-semibold mb-4 text-body">{dict.portal?.originQuestion || 'Where are you coming from?'}</label>
                            <div role="radiogroup" aria-label={dict.portal?.a11y?.originSelection ?? 'Origin selection'} className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                              <button type="button" role="radio" aria-checked={origin === 'GR'} tabIndex={0} onClick={() => selectOrigin('GR')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOrigin('GR'); } }} className={`guest-origin-option surface-card p-5 md:p-6 h-32 md:h-36 w-full flex flex-col items-center justify-center transition focus:outline-none ${origin === 'GR' ? 'is-selected' : ''}`}>
                                <div className="text-4xl md:text-5xl mb-2" aria-hidden>🇬🇷</div>
                                <div className="guest-origin-option-label text-base md:text-lg font-semibold">{dict.portal?.originGR || 'Greece'}</div>
                              </button>
                              <button type="button" role="radio" aria-checked={origin === 'ABROAD'} tabIndex={0} onClick={() => selectOrigin('ABROAD')} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOrigin('ABROAD'); } }} className={`guest-origin-option surface-card p-5 md:p-6 h-32 md:h-36 w-full flex flex-col items-center justify-center transition focus:outline-none ${origin === 'ABROAD' ? 'is-selected' : ''}`}>
                                <div className="text-4xl md:text-5xl mb-2" aria-hidden>🌍</div>
                                <div className="guest-origin-option-label text-base md:text-lg font-semibold">{dict.portal?.originAbroad || 'World'}</div>
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Sign-in mode: always show fields; Sign-up mode: show after origin selected */}
                      {(mode === 'signin' || origin) ? (
                        <div className="text-[color:var(--fg-default)]">
                          <div>
                            <label className="block text-sm mb-1 text-body">{dict.portal?.phoneLabel || 'Phone Number'} *</label>
                            <div className="relative flex items-center border border-soft rounded-lg">
                              <div className="relative" ref={dropdownRef}>
                                {/* Custom Dropdown Button */}
                                <button
                                  type="button"
                                  aria-label={dict.portal?.a11y?.selectCountryCode ?? 'Select country code'}
                                  className="flex items-center py-3 pl-3 pr-6 rounded-l-lg transition-all duration-300 ease-in-out cursor-pointer text-sm relative border-none outline-none"
                                  style={{ 
                                    color: 'var(--fg-default)',
                                    backgroundColor: 'var(--layer-surface)',
                                    minWidth: '80px',
                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.1)',
                                  }}
                                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                  aria-expanded={isDropdownOpen}
                                  aria-haspopup="listbox"
                                >
                                  <span className="font-medium">{phoneDial}</span>
                                </button>
                                
                                {/* Custom Dropdown Arrow */}
                                <div 
                                  className={`absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none text-xs transition-all duration-200 ease-in-out ${isDropdownOpen ? 'rotate-180' : ''}`}
                                  style={{ 
                                    color: 'var(--fg-muted)',
                                    filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))',
                                  }}
                                >
                                  <svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M1 1.5L6 6.5L11 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>

                                {/* Custom Dropdown Menu */}
                                <AnimatePresence>
                                  {isDropdownOpen && (
                                    <motion.div
                                      initial={{ opacity: 0, y: -8, scale: 0.96 }}
                                      animate={{ opacity: 1, y: 0, scale: 1 }}
                                      exit={{ opacity: 0, y: -8, scale: 0.96 }}
                                      transition={{ 
                                        duration: 0.2, 
                                        ease: [0.16, 1, 0.3, 1] 
                                      }}
                                      className="absolute top-full left-0 w-64 mt-2 bg-white rounded-xl shadow-xl border max-h-64 overflow-y-auto"
                                      style={{ 
                                        backgroundColor: 'var(--layer-surface)',
                                        borderColor: 'var(--border-soft)',
                                        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.08)',
                                        backdropFilter: 'blur(12px)',
                                        zIndex: 9999,
                                      }}
                                      role="listbox"
                                      aria-label={dict.portal?.a11y?.countryCodes ?? 'Country codes'}
                                    >
                                      {phoneOptions.map((opt, index) => (
                                        <motion.button
                                          key={opt.cc}
                                          type="button"
                                          initial={{ opacity: 0, x: -10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ delay: index * 0.02, duration: 0.15 }}
                                          className="w-full text-left px-4 py-3 hover:bg-opacity-50 transition-all duration-150 ease-out border-b last:border-b-0 first:rounded-t-xl last:rounded-b-xl group relative overflow-hidden"
                                          style={{
                                            color: 'var(--fg-default)',
                                            borderBottomColor: 'var(--border-soft)',
                                            fontSize: '14px',
                                            fontWeight: '500',
                                          }}
                                          onMouseEnter={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.03)';
                                            if (document.documentElement.getAttribute('data-theme') === 'dark') {
                                              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                                            }
                                          }}
                                          onMouseLeave={(e) => {
                                            e.currentTarget.style.backgroundColor = 'transparent';
                                          }}
                                          onClick={() => handleCountrySelect(opt.dial)}
                                          role="option"
                                          aria-selected={phoneDial === opt.dial}
                                        >
                                          <div className="flex items-center gap-3">
                                            <span className="text-lg">{opt.flag}</span>
                                            <span className="font-medium" style={{ color: 'var(--brand-600)' }}>{opt.dial}</span>
                                            <span className="text-sm opacity-75">{opt.name}</span>
                                          </div>
                                        </motion.button>
                                      ))}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                              <div className="bg-border-soft w-px"></div>
                              <input 
                                ref={phoneInputRef} 
                                className="flex-1 border-none outline-none py-3 pl-3 pr-3 rounded-r-lg input" 
                                style={{ 
                                  color: 'var(--fg-default)',
                                  '--placeholder-color': 'var(--fg-muted)',
                                  backgroundColor: 'var(--layer-surface)',
                                  border: 'none',
                                } as React.CSSProperties & { '--placeholder-color'?: string }}
                                value={phone} 
                                onChange={e=>setPhone(e.target.value)} 
                                placeholder="123 456 7890" 
                                inputMode="tel" 
                                required 
                              />
                            </div>
                          </div>
                          
                          {/* Password Field - always shown */}
                          <div>
                            <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>
                              {locale === 'el' ? 'Κωδικός Πρόσβασης' : 'Password'} *
                            </label>
                            <div className="relative">
                              <input 
                                type={showPassword ? 'text' : 'password'}
                                className="w-full input pr-10" 
                                style={{ 
                                  color: 'var(--fg-default)',
                                  '--placeholder-color': 'var(--fg-muted)',
                                } as React.CSSProperties}
                                value={password} 
                                onChange={e => setPassword(e.target.value)}
                                placeholder={locale === 'el' ? 'Τουλάχιστον 8 χαρακτήρες' : 'At least 8 characters'}
                                minLength={8}
                                required 
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-1 top-1/2 transform -translate-y-1/2 text-sm opacity-60 hover:opacity-100 transition-opacity min-h-11 min-w-11 flex items-center justify-center"
                                style={{ color: 'var(--fg-muted)' }}
                                aria-label={showPassword ? (dict.portal?.a11y?.hidePassword ?? 'Hide password') : (dict.portal?.a11y?.showPassword ?? 'Show password')}
                              >
                                {showPassword ? '👁️' : '👁️‍🗨️'}
                              </button>
                            </div>
                            {password && password.length < 8 && (
                              <p className="text-danger text-xs mt-1">
                                {locale === 'el' ? 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες' : 'Password must be at least 8 characters'}
                              </p>
                            )}
                          </div>

                                          {mode === 'signup' && origin === 'GR' && (
                            <div>
                              <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>{dict.portal?.afmLabel || 'AFM (9 digits)'} *</label>
                              <input 
                                className="w-full input" 
                                style={{ 
                                  color: 'var(--fg-default)',
                                  '--placeholder-color': 'var(--fg-muted)',
                                } as React.CSSProperties}
                                value={afm} 
                                onChange={handleAfmChange}
                                placeholder="123456789"
                                inputMode="numeric" 
                                pattern="\\d{9}" 
                                maxLength={9}
                                title={dict.portal?.validation?.afmInvalid ?? 'AFM must be exactly 9 digits'}
                                required 
                              />
                              {afm && !validateAfm(afm) && (
                                <p className="text-danger text-xs mt-1">
                                  {dict.portal?.validation?.afmInvalid ?? 'AFM must be exactly 9 digits'}
                                </p>
                              )}
                            </div>
                          )}
                          {mode === 'signup' && origin === 'ABROAD' && (
                            <div>
                              <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>{dict.portal?.passportLabel || 'Passport Number (5-20 characters)'} *</label>
                              <input 
                                className="w-full input" 
                                style={{ 
                                  color: 'var(--fg-default)',
                                  '--placeholder-color': 'var(--fg-muted)',
                                } as React.CSSProperties}
                                value={passport} 
                                onChange={handlePassportChange}
                                placeholder="A12345678"
                                maxLength={20}
                                title={dict.portal?.validation?.passportInvalid ?? 'Passport number must be 5-20 alphanumeric characters'}
                                required 
                              />
                              {passport && !validatePassport(passport) && (
                                <p className="text-danger text-xs mt-1">
                                  {dict.portal?.validation?.passportInvalid ?? 'Passport number must be 5-20 alphanumeric characters'}
                                </p>
                              )}
                            </div>
                          )}

                          {mode === 'signup' && (
                            <div>
                              <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>
                                {locale === 'el' ? 'Επώνυμο' : 'Last name'} *
                              </label>
                              <input 
                                className="w-full input" 
                                style={{ 
                                  color: 'var(--fg-default)',
                                  '--placeholder-color': 'var(--fg-muted)',
                                } as React.CSSProperties}
                                value={lastName} 
                                onChange={e=>setLastName(e.target.value)} 
                                placeholder={locale === 'el' ? 'Παπαδόπουλος' : 'Doe'}
                                required 
                              />
                            </div>
                          )}

                          {/* Collapsible Optional Information Section */}
                          {mode === 'signup' && (
                            <motion.div 
                              className="mt-6"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.2, duration: 0.3 }}
                            >
                              {/* Toggle Button */}
                              <button
                                type="button"
                                onClick={() => setIsOptionalExpanded(!isOptionalExpanded)}
                                className="w-full flex items-center justify-between px-3 py-2 rounded-lg border hover:bg-opacity-50 transition-all duration-200 ease-out"
                                style={{ 
                                  borderColor: 'var(--border-soft)', 
                                  backgroundColor: 'color-mix(in srgb, var(--layer-surface) 30%, transparent)',
                                  color: 'var(--fg-default)'
                                }}
                                aria-expanded={isOptionalExpanded}
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium opacity-75">
                                    {locale === 'el' ? 'Πρόσθετες Πληροφορίες (Προαιρετικό)' : 'Additional Information (Optional)'}
                                  </span>
                                  <span className="text-xs opacity-50">
                                    {isOptionalExpanded ? '' : (locale === 'el' ? '• Αριθμός κράτησης' : '• Booking reference')}
                                  </span>
                                </div>
                                
                                <motion.div
                                  animate={{ rotate: isOptionalExpanded ? 180 : 0 }}
                                  transition={{ duration: 0.2, ease: "easeInOut" }}
                                  className="text-xs opacity-60"
                                >
                                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </motion.div>
                              </button>

                              {/* Collapsible Content */}
                              <AnimatePresence>
                                {isOptionalExpanded && (
                                  <motion.div
                                    initial={{ opacity: 0, height: 0, y: -10 }}
                                    animate={{ opacity: 1, height: "auto", y: 0 }}
                                    exit={{ opacity: 0, height: 0, y: -10 }}
                                    transition={{ 
                                      duration: 0.3, 
                                      ease: [0.4, 0, 0.2, 1],
                                      opacity: { duration: 0.2 }
                                    }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-3 p-4 rounded-lg border" style={{ 
                                      borderColor: 'var(--border-soft)', 
                                      backgroundColor: 'color-mix(in srgb, var(--layer-surface) 50%, transparent)' 
                                    }}>
                                      <div className="space-y-4">
                                        <motion.div
                                          initial={{ opacity: 0, x: -10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          transition={{ delay: 0.1, duration: 0.2 }}
                                        >
                                          <label className="block text-sm mb-1" style={{ color: 'var(--fg-default)' }}>{dict.portal?.bookingRefLabel || 'Booking reference (optional)'}</label>
                                          <input 
                                            className="w-full input" 
                                            style={{ 
                                              color: 'var(--fg-default)',
                                              '--placeholder-color': 'var(--fg-muted)',
                                            } as React.CSSProperties}
                                            value={bookingRef} 
                                            onChange={e=>setBookingRef(e.target.value)} 
                                            placeholder="ABC123"
                                          />
                                        </motion.div>
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          )}

                          <div className="mt-6">
                            <label className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--fg-default)' }}><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} /> {dict.portal?.rememberMe || 'Remember me on this device'}</label>
                          </div>

                          <button className="btn-primary w-full mt-6" type="submit" disabled={loading || !formIsValid} aria-busy={loading}>
                            {loading ? (dict.portal?.working ?? 'Working…') : (dict.portal?.continueBtn || 'Continue')}
                          </button>
                        </div>
                      ) : null}
                    </form>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>
        </>
      </div>
    </div>
  );
}
