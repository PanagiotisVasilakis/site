'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CALENDAR_STALE_ALERT_MINUTES, MAX_STAY_NIGHTS, PROPERTY_TIME_ZONE } from '@/data/stayPolicy';
import { addDays, parseIsoDate } from '@/lib/availability/calendarDate';
import { formatCents, parseEuroInputToCents } from '@/lib/availability/money';
import internalFetch from '@/lib/internalFetchClient';
import { Badge, Surface } from '@/components/ui';

// Rate periods are edited as first night + LAST night (inclusive); the API
// stores an exclusive end date (the check-out day), so the last night is sent
// as endDate - 1 day and shown back as endDate - 1 day.

type RatePeriod = {
  id: string;
  startDate: string;
  endDate: string;
  nightlyPriceCents: number;
  minimumNights: number;
};

type SyncState = {
  configured: boolean;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  lastFailureAt: string | null;
  lastErrorCode: string | null;
  lastHttpStatus: number | null;
  consecutiveFailures: number;
  nights: number;
  horizonStart: string | null;
  horizonEnd: string | null;
  nextAttemptAt: string;
  stale: boolean;
};

type FormState = { first: string; last: string; price: string; minimum: string };
type Feedback = { type: 'success' | 'error'; text: string };

// The API (ratePeriodInputSchema) enforces the same limits; these only give
// the admin a message before the request.
const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 1_000_000;

const emptyForm: FormState = { first: '', last: '', price: '', minimum: '1' };
const inputClass = 'admin-input px-4 py-2 rounded-tile';

const athensTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: PROPERTY_TIME_ZONE,
  dateStyle: 'medium',
  timeStyle: 'short',
});

const loadErrorText = (error: unknown) => (error instanceof Error ? error.message : 'Unable to load');

const formatInstant = (value: string | null) => (value ? athensTime.format(new Date(value)) : 'Never');

function lastNightOf(endDate: string): string {
  const end = parseIsoDate(endDate);
  return end ? addDays(end, -1) : endDate;
}

function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

type ApiBody = {
  success?: boolean;
  data?: unknown;
  error?: { message?: string; details?: { validationErrors?: Array<{ message?: string }>; code?: string; httpStatus?: number | null } };
};

async function readBody(response: Response): Promise<ApiBody | null> {
  return (await response.json().catch(() => null)) as ApiBody | null;
}

function errorMessage(body: ApiBody | null, fallback: string): string {
  const firstIssue = body?.error?.details?.validationErrors?.[0]?.message;
  const message = body?.error?.message || fallback;
  return firstIssue ? `${message}: ${firstIssue}` : message;
}

type Validated =
  | { ok: true; body: { startDate: string; endDate: string; nightlyPriceCents: number; minimumNights: number } }
  | { ok: false; message: string };

function validate(form: FormState): Validated {
  const first = parseIsoDate(form.first);
  if (!first) return { ok: false, message: 'Enter the first night.' };
  const last = parseIsoDate(form.last);
  if (!last) return { ok: false, message: 'Enter the last night.' };
  if (last < first) return { ok: false, message: 'The last night cannot be before the first night.' };
  const cents = parseEuroInputToCents(form.price);
  if (cents === null) return { ok: false, message: 'Enter a price such as 85, 85.50 or 85,50.' };
  if (cents < MIN_PRICE_CENTS || cents > MAX_PRICE_CENTS) {
    return {
      ok: false,
      message: `The price must be between ${formatCents(MIN_PRICE_CENTS, 'en')} and ${formatCents(MAX_PRICE_CENTS, 'en')}.`,
    };
  }
  const minimum = Number(form.minimum);
  if (!/^[0-9]+$/.test(form.minimum.trim()) || minimum < 1 || minimum > MAX_STAY_NIGHTS) {
    return { ok: false, message: `Minimum nights must be a whole number from 1 to ${MAX_STAY_NIGHTS}.` };
  }
  return {
    ok: true,
    body: { startDate: first, endDate: addDays(last, 1), nightlyPriceCents: cents, minimumNights: minimum },
  };
}

function syncOutcome(response: Response, body: ApiBody | null): Feedback {
  if (response.ok) {
    const nights = (body?.data as { nights?: number } | undefined)?.nights ?? 0;
    return { type: 'success', text: `Synced: ${nights} blocked nights.` };
  }
  if (response.status === 429) {
    const seconds = Number(response.headers.get('retry-after')) || 60;
    return { type: 'error', text: `A sync ran less than a minute ago. Try again in ${seconds} seconds.` };
  }
  if (response.status === 502) {
    const details = body?.error?.details;
    const reason = [details?.code ?? 'unknown', details?.httpStatus ? `HTTP ${details.httpStatus}` : null]
      .filter(Boolean)
      .join(', ');
    return { type: 'error', text: `The Airbnb calendar could not be read (${reason}). The last good calendar is kept.` };
  }
  return { type: 'error', text: errorMessage(body, 'Unable to sync the calendar') };
}

export default function AdminAvailabilityClient() {
  const [periods, setPeriods] = useState<RatePeriod[] | null>(null);
  const [sync, setSync] = useState<SyncState | null>(null);
  const [periodsLoadError, setPeriodsLoadError] = useState('');
  const [syncLoadError, setSyncLoadError] = useState('');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [syncPending, setSyncPending] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<Feedback | null>(null);

  // Each load reports its own failure and clears it on success, so a failed
  // reload never hides the outcome of the save, delete or sync before it.
  const loadPeriods = useCallback(async () => {
    try {
      const response = await internalFetch('/api/admin/rate-periods');
      const body = await readBody(response);
      if (!response.ok || !body?.success) throw new Error(errorMessage(body, 'Unable to load rate periods'));
      const loaded = (body.data as { ratePeriods?: RatePeriod[] }).ratePeriods ?? [];
      setPeriods([...loaded].sort((left, right) => left.startDate.localeCompare(right.startDate)));
      setPeriodsLoadError('');
    } catch (error) {
      setPeriodsLoadError(loadErrorText(error));
    }
  }, []);

  const loadSync = useCallback(async () => {
    try {
      const response = await internalFetch('/api/admin/availability-sync');
      const body = await readBody(response);
      if (!response.ok || !body?.success) throw new Error(errorMessage(body, 'Unable to load the calendar sync state'));
      setSync(body.data as SyncState);
      setSyncLoadError('');
    } catch (error) {
      setSyncLoadError(loadErrorText(error));
    }
  }, []);

  useEffect(() => {
    void loadPeriods();
    void loadSync();
  }, [loadPeriods, loadSync]);

  function edit(period: RatePeriod) {
    setEditingId(period.id);
    setFeedback(null);
    setForm({
      first: period.startDate,
      last: lastNightOf(period.endDate),
      price: centsToInput(period.nightlyPriceCents),
      minimum: String(period.minimumNights),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setFeedback(null);
    setForm(emptyForm);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    const validated = validate(form);
    if (!validated.ok) {
      setFeedback({ type: 'error', text: validated.message });
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const response = await internalFetch(editingId ? `/api/admin/rate-periods/${editingId}` : '/api/admin/rate-periods', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validated.body),
      });
      const body = await readBody(response);
      if (!response.ok || !body?.success) {
        setFeedback({ type: 'error', text: errorMessage(body, 'Unable to save the rate period') });
        return;
      }
      setEditingId(null);
      setForm(emptyForm);
      setFeedback({ type: 'success', text: 'Rate period saved.' });
      await loadPeriods();
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Unable to save the rate period' });
    } finally {
      setPending(false);
    }
  }

  async function remove(period: RatePeriod) {
    const range = `${period.startDate} to ${lastNightOf(period.endDate)}`;
    const price = formatCents(period.nightlyPriceCents, 'en');
    if (!window.confirm(`Delete the rate period ${range} (${price} per night)?`)) return;
    setPending(true);
    setFeedback(null);
    try {
      const response = await internalFetch(`/api/admin/rate-periods/${period.id}`, { method: 'DELETE' });
      const body = await readBody(response);
      if (!response.ok || !body?.success) {
        setFeedback({ type: 'error', text: errorMessage(body, 'Unable to delete the rate period') });
        return;
      }
      if (editingId === period.id) {
        setEditingId(null);
        setForm(emptyForm);
      }
      setFeedback({ type: 'success', text: 'Rate period deleted.' });
      await loadPeriods();
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Unable to delete the rate period' });
    } finally {
      setPending(false);
    }
  }

  async function syncNow() {
    setSyncPending(true);
    setSyncFeedback(null);
    try {
      const response = await internalFetch('/api/admin/availability-sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      });
      setSyncFeedback(syncOutcome(response, await readBody(response)));
      await loadSync();
    } catch (error) {
      setSyncFeedback({ type: 'error', text: error instanceof Error ? error.message : 'Unable to sync the calendar' });
    } finally {
      setSyncPending(false);
    }
  }

  const setField = (field: keyof FormState) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Surface padding="lg" radius="lg" shadow="lg">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] admin-eyebrow">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold italic admin-title">Availability &amp; prices</h1>
        <p className="mt-3 text-sm admin-muted">
          Seasonal nightly prices and the Airbnb calendar that marks the booked nights. Dates are nights at the property.
        </p>
        <Link href="/admin" className="admin-action-outline shell-link mt-5 inline-flex">Back to operations</Link>
      </Surface>

      {periodsLoadError && <div className="feedback-error mt-5 rounded-tile p-3" role="alert">{periodsLoadError}</div>}
      {syncLoadError && <div className="feedback-error mt-5 rounded-tile p-3" role="alert">{syncLoadError}</div>}

      <section className="admin-card mt-6 rounded-tile border p-5" aria-labelledby="calendar-sync-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="calendar-sync-title" className="font-display text-2xl font-semibold italic admin-title">
            Airbnb calendar sync
          </h2>
          {sync && (
            <Badge variant={sync.configured ? 'approved' : 'pending'}>
              {sync.configured ? 'Configured' : 'Not configured'}
            </Badge>
          )}
        </div>
        {!sync ? <p className="mt-3 text-sm admin-muted">Loading sync state…</p> : (
          <>
            {!sync.configured && (
              <p className="mt-3 text-sm admin-muted">Set AIRBNB_ICAL_URL in the production environment</p>
            )}
            {sync.stale && (
              <p className="feedback-error mt-3 rounded-tile p-3 text-sm">
                The calendar has not synced successfully in the last {CALENDAR_STALE_ALERT_MINUTES / 60} hours.
              </p>
            )}
            <p className="mt-3 text-sm admin-muted">Times are in Athens time (Europe/Athens).</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold">Last success</dt><dd>{formatInstant(sync.lastSuccessAt)}</dd></div>
              <div><dt className="font-semibold">Last attempt</dt><dd>{formatInstant(sync.lastAttemptAt)}</dd></div>
              <div><dt className="font-semibold">Last failure</dt><dd>{formatInstant(sync.lastFailureAt)}</dd></div>
              <div>
                <dt className="font-semibold">Last error</dt>
                <dd>
                  {sync.lastErrorCode
                    ? `${sync.lastErrorCode}${sync.lastHttpStatus ? ` (HTTP ${sync.lastHttpStatus})` : ''}`
                    : 'None'}
                </dd>
              </div>
              <div><dt className="font-semibold">Blocked nights</dt><dd>{sync.nights}</dd></div>
              <div>
                <dt className="font-semibold">Calendar range</dt>
                <dd>{sync.horizonStart && sync.horizonEnd ? `${sync.horizonStart} to ${lastNightOf(sync.horizonEnd)}` : 'Not synced yet'}</dd>
              </div>
            </dl>
          </>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" className="admin-action-primary" onClick={() => void syncNow()} disabled={syncPending}>
            {syncPending ? 'Syncing…' : 'Sync now'}
          </button>
          {syncFeedback && (
            <p
              className={`rounded-tile px-4 py-2 text-sm ${syncFeedback.type === 'success' ? 'feedback-success' : 'feedback-error'}`}
              role="status"
            >
              {syncFeedback.text}
            </p>
          )}
        </div>
      </section>

      <section className="admin-card mt-6 rounded-tile border p-5" aria-labelledby="rate-periods-title">
        <h2 id="rate-periods-title" className="font-display text-2xl font-semibold italic admin-title">Rate periods</h2>
        <p className="mt-1 text-sm admin-muted">Nights outside every period show as price on request.</p>
        {!periods ? <p className="mt-3 text-sm admin-muted">Loading rate periods…</p> : periods.length === 0 ? (
          <p className="mt-3 text-sm admin-muted">No rate periods yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm" aria-labelledby="rate-periods-title">
              <thead>
                <tr className="admin-rule border-b">
                  <th scope="col" className="py-2 pr-4">First night</th>
                  <th scope="col" className="py-2 pr-4">Last night</th>
                  <th scope="col" className="py-2 pr-4">Price per night</th>
                  <th scope="col" className="py-2 pr-4">Minimum nights</th>
                  <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => {
                  const range = `${period.startDate} to ${lastNightOf(period.endDate)}`;
                  return (
                    <tr key={period.id} className="admin-rule border-b">
                      <td className="py-2 pr-4">{period.startDate}</td>
                      <td className="py-2 pr-4">{lastNightOf(period.endDate)}</td>
                      <td className="py-2 pr-4">{formatCents(period.nightlyPriceCents, 'en')}</td>
                      <td className="py-2 pr-4">{period.minimumNights}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" className="admin-action-outline" aria-label={`Edit ${range}`}
                            onClick={() => edit(period)} disabled={pending}>Edit</button>
                          <button type="button" className="admin-action-danger" aria-label={`Delete ${range}`}
                            onClick={() => void remove(period)} disabled={pending}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={save} noValidate className="mt-6">
          <fieldset disabled={pending} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-5">
            <legend className="mb-2 font-semibold">{editingId ? 'Edit rate period' : 'New rate period'}</legend>
            <label className="flex flex-col gap-1 text-sm admin-muted">
              First night
              <input type="date" value={form.first} onChange={setField('first')} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm admin-muted">
              Last night
              <input type="date" value={form.last} min={form.first || undefined} onChange={setField('last')} className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm admin-muted">
              Price per night (€)
              <input type="text" inputMode="decimal" value={form.price} onChange={setField('price')} placeholder="85,50" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1 text-sm admin-muted">
              Minimum nights
              <input type="number" min={1} max={MAX_STAY_NIGHTS} step={1} value={form.minimum} onChange={setField('minimum')} className={inputClass} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="admin-action-primary">{editingId ? 'Save changes' : 'Add rate period'}</button>
              {editingId && <button type="button" className="admin-action-outline" onClick={cancelEdit}>Cancel</button>}
            </div>
          </fieldset>
        </form>
        {feedback && (
          <div
            className={`mt-4 rounded-tile px-4 py-3 text-sm ${feedback.type === 'success' ? 'feedback-success' : 'feedback-error'}`}
            role={feedback.type === 'success' ? 'status' : 'alert'}
          >
            {feedback.text}
          </div>
        )}
      </section>
    </div>
  );
}
