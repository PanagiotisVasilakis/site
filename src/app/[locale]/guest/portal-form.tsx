"use client";
import { useState } from 'react';
import tracker from '@/lib/tracker';
import ErrorSummary from '@/components/ErrorSummary';
import { mapApiErrorToUI } from '@/lib/userFacingErrors';
import { getDictionary, type Locale } from '@/i18n';
import internalFetch from '@/lib/internalFetchClient';

type Origin = 'GR' | 'ABROAD';

function makeValidators(dict: ReturnType<typeof getDictionary>) {
  return {
    validatePhone(v: string): string | null {
      if (!v.trim()) return dict.portal?.validation?.phoneRequired || 'Phone is required';
      const ok = /^\+?[1-9]\d{7,14}$/.test(v.trim());
      return ok ? null : (dict.portal?.validation?.phoneInvalid || 'Enter a valid phone with country code');
    },
    validateAfm(v: string): string | null {
      if (!v.trim()) return dict.portal?.validation?.afmRequired || 'AFM is required';
      return /^\d{9}$/.test(v.trim()) ? null : (dict.portal?.validation?.afmInvalid || 'AFM must be 9 digits');
    },
    validatePassport(v: string): string | null {
      if (!v.trim()) return dict.portal?.validation?.passportRequired || 'Passport number is required';
      return /^[A-Za-z0-9]{5,20}$/.test(v.trim()) ? null : (dict.portal?.validation?.passportInvalid || 'Use 5–20 letters or numbers');
    }
  };
}

export default function GuestPortalForm({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { validatePhone, validateAfm, validatePassport } = makeValidators(dict);
  const [step, setStep] = useState<1 | 2>(1);
  const [origin, setOrigin] = useState<Origin>('GR');
  const [phone, setPhone] = useState('');
  const [afm, setAfm] = useState('');
  const [passport, setPassport] = useState('');
  const [errors, setErrors] = useState<{ phone?: string; afm?: string; passport?: string }>({});
  const [submitError, setSubmitError] = useState<{ summary: string; details?: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function goNext() {
    if (step === 1) {
      setStep(2);
  try { tracker.originSelected(origin); } catch {}
      // Clear field-specific errors on step transition
      setErrors({});
      return;
    }
  // Step 2 validation
    const nextErrors: { phone?: string; afm?: string; passport?: string } = {};
    const phoneErr = validatePhone(phone);
    if (phoneErr) nextErrors.phone = phoneErr;
    if (origin === 'GR') {
      const afmErr = validateAfm(afm);
      if (afmErr) nextErrors.afm = afmErr;
    } else {
      const passErr = validatePassport(passport);
      if (passErr) nextErrors.passport = passErr;
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) {
  try { tracker.formSubmitted('sign-in'); } catch {}
      // Simulate the initial portal/start call to show error UX patterns
      setSubmitting(true);
      setSubmitError(null);
  try {
        // This is a placeholder; wire real request once endpoint is integrated with form
    const res = await internalFetch('/api/portal/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ origin, phone }) });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const mapped = mapApiErrorToUI(data);
          setSubmitError({ summary: mapped.summary, details: mapped.details });
          return;
        }
          // Demo shows schema fetch UX
      } catch (err) {
        const mapped = mapApiErrorToUI(err);
        setSubmitError({ summary: mapped.summary, details: mapped.details });
      } finally {
        setSubmitting(false);
      }
    }
  }

  function goBack() {
    if (step === 2) {
      setStep(1);
      setErrors({});
    }
  }

  // When origin toggles on step 2, reset the other field and errors for clarity
  function onOriginChange(next: Origin) {
    setOrigin(next);
  try { tracker.originSelected(next); } catch {}
    if (step === 2) {
      setErrors({});
      if (next === 'GR') setPassport('');
      else setAfm('');
    }
  }

  return (
    <div className="panel backdrop-blur glass-panel p-4">
      {submitError ? (
        <div className="mb-3">
          <ErrorSummary
            summary={submitError.summary}
            details={submitError.details}
            onRetry={() => { setSubmitError(null); goNext(); }}
            // Use locale-aware support path if you have one; fallback provided
            supportHref={`/${locale}/contact`}
          />
        </div>
      ) : null}
      {/* Stepper header */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-brand-600 text-white' : 'bg-[color:var(--layer-bg-subtle)] text-[color:var(--fg-muted)]'}`}>1</div>
  <span className={`${step === 1 ? 'text-[color:var(--fg-default)]' : 'text-[color:var(--fg-muted)]'}`}>Origin</span>
        <span className="text-[color:var(--fg-muted)]">→</span>
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-brand-600 text-white' : 'bg-[color:var(--layer-bg-subtle)] text-[color:var(--fg-muted)]'}`}>2</div>
  <span className={`${step === 2 ? 'text-[color:var(--fg-default)]' : 'text-[color:var(--fg-muted)]'}`}>Details</span>
      </div>

      {/* Step 1: Origin */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="text-sm text-[color:var(--fg-muted)]">{dict.portal?.originQuestion}</div>
          <fieldset>
            <legend className="text-sm font-medium text-[color:var(--fg-default)] mb-1">Origin</legend>
            <div className="flex gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="origin" value="GR" checked={origin === 'GR'} onChange={() => onOriginChange('GR')} />
                {dict.portal?.originGR || 'Greece'}
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="origin" value="ABROAD" checked={origin === 'ABROAD'} onChange={() => onOriginChange('ABROAD')} />
                {dict.portal?.originAbroad || 'Abroad'}
              </label>
            </div>
          </fieldset>
        </div>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="text-sm block mb-1">{dict.portal?.phoneLabel || 'Phone (E.164)'}</label>
            <input
              className={`input w-full ${errors.phone ? 'input-error' : ''}`}
              placeholder={locale === 'el' ? '+30 69XXXXXXXX' : '+1 415XXXXXXX'}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'err-phone' : 'hint-phone'}
              inputMode="tel"
            />
            <div id="hint-phone" className="text-xs text-[color:var(--fg-muted)] mt-1">{dict.portal?.hints?.phone || 'Include country code.'}</div>
            {errors.phone && (
              <div id="err-phone" role="alert" className="text-xs text-red-600 mt-1">{errors.phone}</div>
            )}
          </div>

          {origin === 'GR' ? (
            <div>
              <label className="text-sm block mb-1">{dict.portal?.afmLabel || 'AFM (Greek Tax ID)'}</label>
              <input
                className={`input w-full ${errors.afm ? 'input-error' : ''}`}
                placeholder="123456789"
                value={afm}
                onChange={(e) => setAfm(e.target.value)}
                aria-invalid={!!errors.afm}
                aria-describedby={errors.afm ? 'err-afm' : 'hint-afm'}
                inputMode="numeric"
              />
              <div id="hint-afm" className="text-xs text-[color:var(--fg-muted)] mt-1">{dict.portal?.hints?.afm || '9 digits.'}</div>
              {errors.afm && (
                <div id="err-afm" role="alert" className="text-xs text-red-600 mt-1">{errors.afm}</div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-sm block mb-1">{dict.portal?.passportLabel || 'Passport Number'}</label>
              <input
                className={`input w-full ${errors.passport ? 'input-error' : ''}`}
                placeholder="AB1234567"
                value={passport}
                onChange={(e) => setPassport(e.target.value)}
                aria-invalid={!!errors.passport}
                aria-describedby={errors.passport ? 'err-passport' : 'hint-passport'}
              />
              <div id="hint-passport" className="text-xs text-[color:var(--fg-muted)] mt-1">{dict.portal?.hints?.passport || 'Use letters and numbers only.'}</div>
              {errors.passport && (
                <div id="err-passport" role="alert" className="text-xs text-red-600 mt-1">{errors.passport}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" className="btn-outline" onClick={goBack} disabled={step === 1 || submitting}>{dict.ui?.back || 'Back'}</button>
        <button type="button" className="btn-primary" onClick={goNext} disabled={submitting} aria-busy={submitting}>
          {step === 1 ? (dict.portal?.continueBtn || 'Continue') : (submitting ? 'Working…' : (dict.portal?.continueBtn || 'Continue'))}
        </button>
      </div>

      <div className="text-xs text-[color:var(--fg-muted)] mt-3">Locale: {locale}</div>
    </div>
  );
}
