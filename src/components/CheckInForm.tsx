"use client";
import React, { useEffect, useMemo, useState } from 'react';
import internalFetch from '@/lib/internalFetchClient';
import { tracker } from '@/lib/tracker';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';
import ErrorSummary from '@/components/ErrorSummary';

type BookingContext = {
  user?: { phone?: string; origin?: 'GR' | 'ABROAD' };
  booking?: { id?: string; reference?: string; start_date?: string; end_date?: string; source?: string };
  completion?: { arrivalTime: string; specialRequests?: string; acceptedAt: number } | null;
};

export default function CheckInForm({ locale }: { locale: string }) {
  const t = getDictionary((locale as Locale) ?? 'en');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BookingContext | null>(null);
  const [arrivalTime, setArrivalTime] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const res = await internalFetch('/api/check-in', { method: 'GET' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error?.message || 'Failed to load');
        if (cancelled) return;
        const payload = json?.data as BookingContext;
        setData(payload);
        const comp = payload?.completion;
        if (comp?.arrivalTime) setArrivalTime(comp.arrivalTime);
        if (comp?.specialRequests) setSpecialRequests(comp.specialRequests);
        setAcceptTerms(!!comp);
  // Not in the required list, but harmless: we keep minimal
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load booking';
        setError(msg);
      } finally { setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // Client-side validation to match server rules
  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    const timeRe = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
    if (!arrivalTime || !timeRe.test(arrivalTime)) {
      errors.arrivalTime = t.checkin?.arrivalTimeInvalid || 'Please enter a valid time (HH:mm)';
    }
    if (specialRequests && specialRequests.length > 2000) {
      errors.specialRequests = t.checkin?.specialRequests ? `${t.checkin.specialRequests} must be 2000 characters or less` : 'Special requests must be 2000 characters or less';
    }
    if (!acceptTerms) {
      errors.acceptTerms = t.checkin?.acceptTerms || 'You must accept the terms to continue';
    }
    return { valid: Object.keys(errors).length === 0, errors };
  }, [arrivalTime, specialRequests, acceptTerms, t]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSuccess(false);
    if (!validation.valid) return;
    setSaving(true);
    try {
      tracker.formSubmitted('sign-in'); // closest semantic; denotes guest action
      const res = await internalFetch('/api/check-in/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ arrivalTime, specialRequests, acceptTerms }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error?.message || 'Failed to save');
  setSuccess(true);
  tracker.checkinCompleted();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to save check-in';
      setError(msg);
      // Analytics restricted; no failure event emitted here
    } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="text-sm text-[color:var(--fg-muted)]" role="status" aria-live="polite">{t.checkin?.loading || 'Loading booking…'}</div>;
  }
  if (error) {
    return (
      <div className="mb-3">
        <ErrorSummary summary={error} onRetry={() => { /* retry load */ location.reload(); }} supportHref={`/${locale}/contact`} />
      </div>
    );
  }

  const datesLine = data?.booking?.start_date && data?.booking?.end_date
    ? `${data.booking.start_date} → ${data.booking.end_date}`
    : '—';

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate aria-busy={saving}>
      {/* Booking summary */}
      <section aria-labelledby="ci-dates" className="mb-4 rounded-lg border border-[color:var(--border-soft)] p-3 bg-[color:var(--layer-surface)]">
        <h2 id="ci-dates" className="text-sm font-semibold mb-2">{t.checkin?.dates || 'Dates'}</h2>
        <div className="text-sm text-[color:var(--fg-muted)]">{datesLine}</div>
        {data?.booking?.reference && (
          <div className="text-xs text-[color:var(--fg-muted)] mt-1">{t.checkin?.reference || 'Reference'}: {data.booking.reference}</div>
        )}
      </section>

      {/* Arrival time */}
      <div>
  <label className="block text-sm mb-1">{t.checkin?.arrivalTime || 'Arrival time'} (HH:mm)</label>
        <input
          className={`w-full input ${validation.errors.arrivalTime ? 'border-red-400 bg-red-50' : ''}`}
          placeholder="14:30"
          value={arrivalTime}
          onChange={(e) => setArrivalTime(e.target.value)}
          required
          aria-invalid={!!validation.errors.arrivalTime}
        />
        {validation.errors.arrivalTime && (
          <p className="mt-1 text-xs text-red-600" role="alert">{validation.errors.arrivalTime}</p>
        )}
      </div>

      {/* Special requests */}
      <div>
  <label className="block text-sm mb-1">{t.checkin?.specialRequests || 'Special requests'}</label>
        <textarea
          className={`w-full input min-h-24 ${validation.errors.specialRequests ? 'border-red-400 bg-red-50' : ''}`}
          value={specialRequests}
          onChange={(e) => setSpecialRequests(e.target.value)}
        />
        {validation.errors.specialRequests && (
          <p className="mt-1 text-xs text-red-600" role="alert">{validation.errors.specialRequests}</p>
        )}
      </div>

      {/* Terms */}
      <div className="flex items-start gap-2">
        <input id="agree" type="checkbox" className="mt-1" checked={acceptTerms} onChange={e => setAcceptTerms(e.target.checked)} />
        <label htmlFor="agree" className="text-sm">
          {t.checkin?.acceptTerms || 'I confirm my details are correct and accept the terms'}.
        </label>
      </div>
      {validation.errors.acceptTerms && (
        <p className="mt-1 text-xs text-red-600" role="alert">{validation.errors.acceptTerms}</p>
      )}

      {/* Global error/success */}
      {error && (
        <div className="mb-2">
          <ErrorSummary summary={error} />
        </div>
      )}
      {success && <div className="text-sm text-green-600" role="status" aria-live="polite">{t.checkin?.submitted || 'Saved. Thank you!'}</div>}

      <button className="booking-button ready w-full" type="submit" disabled={saving || !validation.valid} aria-busy={saving}>
        {saving ? (t.checkin?.saving || 'Saving…') : (t.checkin?.submit || 'Complete Check-in')}
      </button>
    </form>
  );
}
