'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Surface } from '@/components/ui/Surface';
import { adminRequest } from '@/app/admin/adminApi';

type Flags = { portalEnabled: boolean; checkinEnabled: boolean };
type CheckInTimes = { checkInTime: string; checkOutTime: string };

export default function AdminSettingsClient() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [times, setTimes] = useState<CheckInTimes | null>(null);
  const [timesSaved, setTimesSaved] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const result = await adminRequest<Flags>('Unable to load settings', '/api/admin/flags');
    if (!result.ok) throw new Error(result.message);
    setFlags(result.data);
  }, []);

  useEffect(() => { load().catch((loadError) => setError(loadError.message)); }, [load]);

  const checkinEnabled = flags?.checkinEnabled;
  const loadTimes = useCallback(async () => {
    const result = await adminRequest<CheckInTimes>('Unable to load check-in times', '/api/check-in/preferences');
    if (!result.ok) throw new Error(result.message);
    // Keep only the two times: the response also carries Wi-Fi details, which this page does not show.
    setTimes({ checkInTime: result.data.checkInTime, checkOutTime: result.data.checkOutTime });
  }, []);

  useEffect(() => {
    if (checkinEnabled) loadTimes().catch((loadError) => setError(loadError.message));
  }, [checkinEnabled, loadTimes]);

  async function save(next: Partial<Flags>) {
    setSaving(true);
    setError('');
    try {
      const result = await adminRequest<Flags>('Unable to save settings', '/api/admin/flags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!result.ok) throw new Error(result.message);
      setFlags(result.data);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function saveTimes(next: CheckInTimes) {
    setSaving(true);
    setError('');
    setTimesSaved(false);
    try {
      const result = await adminRequest('Unable to save check-in times', '/api/check-in/preferences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!result.ok) throw new Error(result.message);
      setTimesSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save check-in times');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Surface padding="lg" radius="lg" shadow="lg">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] admin-eyebrow">Admin</p>
        <h1 className="mt-2 font-display text-4xl font-semibold italic admin-title">Operational settings</h1>
        <p className="mt-3 text-sm admin-muted">These shared settings are stored in the database and apply to every app instance.</p>
        <Link href="/admin" className="admin-action-outline shell-link mt-5 inline-flex">Back to operations</Link>
      </Surface>

      {error && <div className="feedback-error mt-5 rounded-tile p-3" role="alert">{error}</div>}
      <section className="admin-card mt-6 rounded-tile border p-5" aria-busy={!flags || saving}>
        {!flags ? <p>Loading settings…</p> : (
          <fieldset disabled={saving} className="space-y-4">
            <legend className="font-display text-2xl font-semibold italic admin-title">Guest features</legend>
            {([
              ['portalEnabled', 'Guest portal', 'Allow guests with verified reservations to sign in.'],
              ['checkinEnabled', 'Check-in workflow', 'Expose verified guest check-in tools and arrival requests.'],
            ] as const).map(([key, label, description]) => {
              // Check-in needs guest sign-in, so it is only available with the portal on.
              const blocked = key === 'checkinEnabled' && !flags.portalEnabled;
              return (
                <label key={key} className="admin-rule flex items-start justify-between gap-4 rounded border p-4">
                  <span>
                    <strong className="block">{label}</strong>
                    <span className="text-sm admin-muted">{description}</span>
                    {blocked && <span className="mt-1 block text-sm admin-muted">Requires the guest portal.</span>}
                  </span>
                  <input
                    type="checkbox"
                    checked={flags[key]}
                    disabled={blocked}
                    onChange={(event) => void save({ [key]: event.target.checked })}
                    className="h-5 w-5"
                  />
                </label>
              );
            })}
          </fieldset>
        )}
      </section>

      <section className="admin-card mt-6 rounded-tile border p-5" aria-busy={saving || (checkinEnabled === true && !times)}>
        <fieldset disabled={saving} className="space-y-4">
          <legend className="font-display text-2xl font-semibold italic admin-title">Check-in times</legend>
          <p className="text-sm admin-muted">Shown to guests on the check-in page; the Wi-Fi details are revealed 24 hours before check-in time and until check-out time on the departure day.</p>
          {flags && !flags.checkinEnabled && <p className="text-sm admin-muted">Requires the check-in workflow.</p>}
          {checkinEnabled && !times && <p>Loading check-in times…</p>}
          {checkinEnabled && times && (
            <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveTimes(times); }}>
              {([
                ['checkInTime', 'Check-in'],
                ['checkOutTime', 'Check-out'],
              ] as const).map(([key, label]) => (
                <label key={key} className="admin-rule flex items-center justify-between gap-4 rounded border p-4">
                  <strong>{label}</strong>
                  <input
                    type="time"
                    required
                    value={times[key]}
                    onChange={(event) => {
                      setTimesSaved(false);
                      setTimes({ ...times, [key]: event.target.value });
                    }}
                    className="admin-input px-4 py-2 rounded-tile"
                  />
                </label>
              ))}
              <button type="submit" className="admin-action-primary">Save</button>
              {timesSaved && <p role="status" className="text-sm admin-muted">Saved.</p>}
            </form>
          )}
        </fieldset>
      </section>
    </div>
  );
}
