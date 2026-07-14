'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import internalFetch from '@/lib/internalFetchClient';
import { Badge, EmptyPanel, Surface } from '@/components/ui';

type StayRequest = {
  id: string; propertyName: string; startDate: string; endDate: string; firstName: string; lastName: string;
  email: string; phone: string; status: 'PENDING' | 'DELIVERED' | 'DELIVERY_FAILED' | 'CLOSED'; createdAt: string;
  outboxEvents: Array<{ status: string; attemptCount: number; lastError?: string }>;
};

export default function AdminStayRequestsClient() {
  const [requests, setRequests] = useState<StayRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await internalFetch('/api/admin/stay-requests');
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.success) throw new Error(body?.error?.message || 'Unable to load stay requests');
      setRequests(body.data.requests ?? []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load stay requests'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(id: string, action: 'retry_delivery' | 'close') {
    const response = await internalFetch(`/api/admin/stay-requests/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) { setError(body?.error?.message || 'Unable to update request'); return; }
    await load();
  }

  return <div className="mx-auto max-w-5xl px-4 py-8">
    <Surface padding="lg" radius="lg" shadow="lg" border="none">
      <h1 className="font-serif text-4xl font-semibold italic page-title">Stay requests</h1>
      <p className="mt-3 text-sm text-body">Durably stored booking enquiries and their delivery state.</p>
      <Link href="/admin" className="admin-action-outline mt-5 inline-flex">Back to operations</Link>
    </Surface>
    {error && <div className="feedback-error mt-5 rounded-lg p-3" role="alert">{error}</div>}
    <section className="mt-6 space-y-4">
      {loading ? <EmptyPanel>Loading stay requests…</EmptyPanel> : requests.length === 0 ? <EmptyPanel title="No stay requests">No enquiries have been submitted.</EmptyPanel> : requests.map((request) => {
        const event = request.outboxEvents[0];
        return <article key={request.id} className="surface-card rounded-lg border border-soft p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl italic">{request.firstName} {request.lastName}</h2><p className="text-sm text-body">{request.propertyName}</p></div><Badge variant={request.status === 'DELIVERED' ? 'approved' : request.status === 'DELIVERY_FAILED' ? 'rejected' : 'pending'}>{request.status.toLowerCase()}</Badge></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt>Dates</dt><dd>{new Date(request.startDate).toLocaleDateString()} – {new Date(request.endDate).toLocaleDateString()}</dd></div><div><dt>Contact</dt><dd>{request.email}<br />{request.phone}</dd></div><div><dt>Submitted</dt><dd>{new Date(request.createdAt).toLocaleString()}</dd></div><div><dt>Delivery attempts</dt><dd>{event?.attemptCount ?? 0}</dd></div></dl>
          {event?.lastError && <p className="feedback-error mt-3 rounded p-2 text-sm">{event.lastError}</p>}
          <div className="mt-4 flex gap-2">{request.status === 'DELIVERY_FAILED' && <button className="admin-action-primary" onClick={() => void act(request.id, 'retry_delivery')}>Retry delivery</button>}{(request.status === 'DELIVERED' || request.status === 'DELIVERY_FAILED') && <button className="admin-action-outline" onClick={() => void act(request.id, 'close')}>Close</button>}</div>
        </article>;
      })}
    </section>
  </div>;
}
