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
      <Surface padding="lg" radius="lg" shadow="lg" border="none">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-accent-subtle">Admin</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold italic page-title">Operational settings</h1>
        <p className="mt-3 text-sm text-body">These shared settings are stored in the database and apply to every app instance.</p>
        <Link href="/admin" className="admin-action-outline mt-5 inline-flex">Back to operations</Link>
      </Surface>

      {error && <div className="feedback-error mt-5 rounded-lg p-3" role="alert">{error}</div>}
      <section className="surface-card mt-6 rounded-lg border border-soft p-5" aria-busy={!flags || saving}>
        {!flags ? <p>Loading settings…</p> : (
          <fieldset disabled={saving} className="space-y-4">
            <legend className="font-serif text-2xl font-semibold italic section-title">Guest features</legend>
            {([
              ['portalEnabled', 'Guest portal', 'Allow guests with verified reservations to sign in.'],
              ['checkinEnabled', 'Check-in workflow', 'Expose verified guest check-in tools and arrival requests.'],
            ] as const).map(([key, label, description]) => (
              <label key={key} className="flex items-start justify-between gap-4 rounded border border-soft p-4">
                <span><strong className="block">{label}</strong><span className="text-sm text-body">{description}</span></span>
                <input
                  type="checkbox"
                  checked={flags[key]}
                  onChange={(event) => void save({ [key]: event.target.checked })}
                  className="h-5 w-5"
                />
              </label>
            ))}
          </fieldset>
        )}
      </section>
    </div>
  );
}
