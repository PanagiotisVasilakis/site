'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import internalFetch from '@/lib/internalFetchClient';
import { Surface } from '@/components/ui';

type Flags = { portalEnabled: boolean; checkinEnabled: boolean };

export default function AdminSettingsClient() {
  const [flags, setFlags] = useState<Flags | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const response = await internalFetch('/api/admin/flags');
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new Error(body?.error?.message || 'Unable to load settings');
    setFlags(body.data);
  }, []);

  useEffect(() => { load().catch((loadError) => setError(loadError.message)); }, [load]);

  async function save(next: Partial<Flags>) {
    setSaving(true);
    setError('');
    try {
      const response = await internalFetch('/api/admin/flags', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error?.message || 'Unable to save settings');
      setFlags(body.data);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save settings');
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
    </div>
  );
}
