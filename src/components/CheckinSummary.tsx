"use client";
import { useEffect, useRef, useState } from 'react';
import { trackEvent } from '@/lib/analyticsClient';
import { getDictionary } from '@/i18n/dictionaries';
import { useParams } from 'next/navigation';
import internalFetch from '@/lib/internalFetchClient';

type Payload = {
  data?: {
    user?: { phone?: string; origin?: 'GR' | 'ABROAD' };
  booking?: { id?: string; reference?: string; source?: 'ONSITE' | 'EXTERNAL'; start_date?: string; end_date?: string };
    completion?: { arrivalTime: string; specialRequests?: string; acceptedAt: number } | null;
  };
  error?: { message?: string };
};

export default function CheckinSummary() {
  const { locale } = useParams() as { locale: 'en' | 'el' };
  const t = getDictionary(locale || 'en');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Payload['data'] | null>(null);
  const [arrivalTime, setArrivalTime] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ arrivalTime?: string; specialRequests?: string; acceptTerms?: string }>({});
  const errorSummaryRef = useRef<HTMLDivElement | null>(null);
  const arrivalTimeRef = useRef<HTMLInputElement | null>(null);
  const specialRequestsRef = useRef<HTMLTextAreaElement | null>(null);
  const acceptTermsRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
  const res = await internalFetch('/api/check-in', { method: 'GET', headers: { 'accept': 'application/json' } });
        const json: Payload = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || 'Unauthorized');
        if (alive) setPayload(json.data || null);
        const c = json?.data?.completion;
        if (c && alive) {
          setArrivalTime(c.arrivalTime || '');
          setSpecialRequests(c.specialRequests || '');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load';
        if (alive) setError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function onComplete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    // Basic HH:mm validation on client – show field error and focus summary/field
    if (!/^\d{2}:\d{2}$/.test(arrivalTime)) {
      const msg = t.checkin?.arrivalTimeInvalid || 'Please enter a valid time (HH:mm)';
      setFieldErrors({ arrivalTime: msg });
      setTimeout(() => {
        errorSummaryRef.current?.focus();
        arrivalTimeRef.current?.focus();
      }, 0);
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    try {
      const res = await internalFetch('/api/check-in/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({ arrivalTime, specialRequests, acceptTerms }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        // Try to surface field validation errors from server response
        const maybeErr = json?.error;
        const details = maybeErr?.details as { validationErrors?: Array<{ path?: string; message?: string; code?: string }> } | undefined;
        const nextFieldErrors: { arrivalTime?: string; specialRequests?: string; acceptTerms?: string } = {};
        if (details?.validationErrors && Array.isArray(details.validationErrors)) {
          for (const v of details.validationErrors) {
            const p = (v.path || '').toString();
            const msg = v.message || 'Invalid value';
            if (p === 'arrivalTime') nextFieldErrors.arrivalTime = msg === 'invalid_time' ? (t.checkin?.arrivalTimeInvalid || 'Please enter a valid time (HH:mm)') : msg;
            if (p === 'specialRequests') nextFieldErrors.specialRequests = msg;
            if (p === 'acceptTerms') nextFieldErrors.acceptTerms = msg || 'Please accept the terms';
          }
        }
        if (Object.keys(nextFieldErrors).length > 0) {
          setFieldErrors(nextFieldErrors);
          setTimeout(() => {
            errorSummaryRef.current?.focus();
            if (nextFieldErrors.arrivalTime) arrivalTimeRef.current?.focus();
            else if (nextFieldErrors.specialRequests) specialRequestsRef.current?.focus();
            else if (nextFieldErrors.acceptTerms) acceptTermsRef.current?.focus();
          }, 0);
        }
        throw new Error(maybeErr?.message || 'Failed to complete');
      }
      try { trackEvent('checkin_completed'); } catch {}
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to complete';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="skeleton h-24 w-full" aria-busy="true" aria-live="polite" />;
  if (error) return <div className="text-sm text-red-600" role="alert" aria-live="polite">{error}</div>;

  if (submitted) {
    return <div className="text-sm" role="status" aria-live="polite">{t.checkin?.submitted || 'Check-in completed. Thank you!'}</div>;
  }

  return (
    <form className="space-y-3" onSubmit={onComplete}>
      {Object.keys(fieldErrors).length > 0 && (
        <div
          ref={errorSummaryRef}
          tabIndex={-1}
          className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
          aria-live="polite"
        >
          <div className="font-medium mb-1">{locale === 'el' ? 'Παρακαλώ διορθώστε τα παρακάτω:' : 'Please fix the following:'}</div>
          <ul className="list-disc pl-5">
            {fieldErrors.arrivalTime && <li>{fieldErrors.arrivalTime}</li>}
            {fieldErrors.specialRequests && <li>{fieldErrors.specialRequests}</li>}
            {fieldErrors.acceptTerms && <li>{fieldErrors.acceptTerms}</li>}
          </ul>
        </div>
      )}
      <div className="text-sm text-[color:var(--fg-muted)]">
        <div><strong>{t.checkin?.summary || t.details}:</strong></div>
        <div>Booking ID: {payload?.booking?.id || '—'}</div>
        <div>Reference: {payload?.booking?.reference || '—'}</div>
        <div>Dates: {payload?.booking?.start_date ? new Date(payload.booking.start_date).toLocaleDateString(locale) : '—'} → {payload?.booking?.end_date ? new Date(payload.booking.end_date).toLocaleDateString(locale) : '—'}</div>
        <div>Source: {payload?.booking?.source || '—'}</div>
        <div>Phone: {payload?.user?.phone || '—'}</div>
      </div>

      <div className="space-y-2">
        <label className="block text-sm">
          {t.checkin?.arrivalTime || 'Arrival time'}
          <input
            type="time"
            className="input mt-1 w-full"
            value={arrivalTime}
            onChange={e => setArrivalTime(e.target.value)}
            ref={arrivalTimeRef}
            required
            aria-invalid={!!fieldErrors.arrivalTime}
            aria-describedby={[
              (!/^\d{2}:\d{2}$/.test(arrivalTime) && arrivalTime.length > 0) ? 'arrivalTimeFormatHint' : '',
              fieldErrors.arrivalTime ? 'arrivalTimeError' : '',
            ].filter(Boolean).join(' ') || undefined}
          />
          {!/^\d{2}:\d{2}$/.test(arrivalTime) && arrivalTime.length > 0 && (
            <div id="arrivalTimeFormatHint" className="mt-1 text-xs text-red-600" role="alert" aria-live="polite">{t.checkin?.arrivalTimeInvalid || 'Please enter a valid time (HH:mm)'}</div>
          )}
          {fieldErrors.arrivalTime && (
            <div id="arrivalTimeError" className="mt-1 text-xs text-red-600" role="alert" aria-live="polite">{fieldErrors.arrivalTime}</div>
          )}
        </label>
        <label className="block text-sm">
          {t.checkin?.specialRequests || 'Special requests'}
          <textarea
            className="input mt-1 w-full"
            rows={4}
            value={specialRequests}
            onChange={e => setSpecialRequests(e.target.value)}
            ref={specialRequestsRef}
            maxLength={2000}
            aria-invalid={!!fieldErrors.specialRequests}
            aria-describedby={fieldErrors.specialRequests ? 'specialRequestsError' : undefined}
          />
          {fieldErrors.specialRequests && (
            <div id="specialRequestsError" className="mt-1 text-xs text-red-600" role="alert" aria-live="polite">{fieldErrors.specialRequests}</div>
          )}
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={e => setAcceptTerms(e.target.checked)}
            ref={acceptTermsRef}
            required
            aria-invalid={!!fieldErrors.acceptTerms}
            aria-describedby={fieldErrors.acceptTerms ? 'acceptTermsError' : undefined}
          />
          <span>{t.checkin?.acceptTerms || 'I accept the terms'}</span>
        </label>
        {fieldErrors.acceptTerms && (
          <div id="acceptTermsError" className="mt-1 text-xs text-red-600" role="alert" aria-live="polite">{fieldErrors.acceptTerms}</div>
        )}
      </div>

      <button className="booking-button ready" disabled={submitting}>
        {submitting ? (t.checkin?.saving || 'Saving...') : (t.checkin?.submit || t.labels?.save || 'Save')}
      </button>
    </form>
  );
}
