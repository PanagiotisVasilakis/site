'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import internalFetch from '@/lib/internalFetchClient';
import { Badge, EmptyPanel, Surface } from '@/components/ui';

type StayRequestStatus = 'PENDING' | 'DELIVERED' | 'DELIVERY_FAILED' | 'CLOSED';
type StayRequest = {
  id: string; propertyName: string; startDate: string; endDate: string; firstName: string; lastName: string;
  email: string; phone: string; status: StayRequestStatus; createdAt: string;
  outboxEvents: Array<{ status: string; attemptCount: number; lastError?: string }>;
};

const statusFilters: Array<{ value: StayRequestStatus | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'DELIVERY_FAILED', label: 'Delivery failed' },
  { value: 'CLOSED', label: 'Closed' },
];

function listUrl(status: StayRequestStatus | 'ALL', cursor?: string): string {
  const params = new URLSearchParams();
  if (status !== 'ALL') params.set('status', status);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return query ? `/api/admin/stay-requests?${query}` : '/api/admin/stay-requests';
}

export default function AdminStayRequestsClient() {
  const [requests, setRequests] = useState<StayRequest[]>([]);
  const [status, setStatus] = useState<StayRequestStatus | 'ALL'>('ALL');
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const versionRef = useRef(0);

  const load = useCallback(async (filter: StayRequestStatus | 'ALL') => {
    const version = ++versionRef.current;
    setLoading(true); setError('');
    try {
      const response = await internalFetch(listUrl(filter));
      const body = await response.json().catch(() => null);
      if (version !== versionRef.current) return;
      if (!response.ok || !body?.success) throw new Error(body?.error?.message || 'Unable to load stay requests');
      const loaded: StayRequest[] = body.data.requests ?? [];
      setRequests(loaded);
      setTotal(body.data.total ?? loaded.length);
      setNextCursor(body.data.nextCursor ?? null);
    } catch (loadError) {
      if (version !== versionRef.current) return;
      setRequests([]); setNextCursor(null);
      setError(loadError instanceof Error ? loadError.message : 'Unable to load stay requests');
    } finally { if (version === versionRef.current) setLoading(false); }
  }, []);
  useEffect(() => { void load('ALL'); }, [load]);

  async function loadMore() {
    if (!nextCursor) return;
    const version = versionRef.current;
    setLoadingMore(true);
    try {
      const response = await internalFetch(listUrl(status, nextCursor));
      const body = await response.json().catch(() => null);
      if (version !== versionRef.current) return;
      if (!response.ok || !body?.success) throw new Error(body?.error?.message || 'Unable to load more stay requests');
      const more: StayRequest[] = body.data.requests ?? [];
      setRequests((current) => {
        const known = new Set(current.map((request) => request.id));
        return [...current, ...more.filter((request) => !known.has(request.id))];
      });
      setTotal(body.data.total ?? 0);
      setNextCursor(body.data.nextCursor ?? null);
    } catch (loadError) {
      if (version !== versionRef.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Unable to load more stay requests');
    } finally { setLoadingMore(false); }
  }

  function changeStatus(next: StayRequestStatus | 'ALL') {
    setStatus(next);
    void load(next);
  }

  async function act(id: string, action: 'retry_delivery' | 'close') {
    const response = await internalFetch(`/api/admin/stay-requests/${id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) { setError(body?.error?.message || 'Unable to update request'); return; }
    await load(status);
  }

  return <div className="mx-auto max-w-5xl px-4 py-8">
    <Surface padding="lg" radius="lg" shadow="lg" border="none">
      <h1 className="font-serif text-4xl font-semibold italic page-title">Stay requests</h1>
      <p className="mt-3 text-sm text-body">Durably stored booking enquiries and their delivery state.</p>
      <Link href="/admin" className="admin-action-outline mt-5 inline-flex">Back to operations</Link>
    </Surface>
    <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Stay request filters">
      {statusFilters.map((item) => (
        <button key={item.value} type="button" onClick={() => changeStatus(item.value)} aria-pressed={item.value === status}
          className={item.value === status ? 'admin-action-primary min-h-10' : 'admin-action-outline'}>{item.label}</button>
      ))}
    </div>
    {error && <div className="feedback-error mt-5 rounded-lg p-3" role="alert">{error}</div>}
    <section className="mt-6 space-y-4">
      {loading ? <EmptyPanel>Loading stay requests…</EmptyPanel> : requests.length === 0 ? <EmptyPanel title="No stay requests">No enquiries match this filter.</EmptyPanel> : requests.map((request) => {
        const event = request.outboxEvents[0];
        return <article key={request.id} className="surface-card rounded-lg border border-soft p-5">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-serif text-2xl italic">{request.firstName} {request.lastName}</h2><p className="text-sm text-body">{request.propertyName}</p></div><Badge variant={request.status === 'DELIVERED' ? 'approved' : request.status === 'DELIVERY_FAILED' ? 'rejected' : 'pending'}>{request.status.toLowerCase()}</Badge></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><div><dt>Dates</dt><dd>{new Date(request.startDate).toLocaleDateString(undefined, { timeZone: 'UTC' })} – {new Date(request.endDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}</dd></div><div><dt>Contact</dt><dd>{request.email}<br />{request.phone}</dd></div><div><dt>Submitted</dt><dd>{new Date(request.createdAt).toLocaleString()}</dd></div><div><dt>Delivery attempts</dt><dd>{event?.attemptCount ?? 0}</dd></div></dl>
          {event?.lastError && <p className="feedback-error mt-3 rounded p-2 text-sm">{event.lastError}</p>}
          <div className="mt-4 flex gap-2">{request.status === 'DELIVERY_FAILED' && <button className="admin-action-primary" onClick={() => void act(request.id, 'retry_delivery')}>Retry delivery</button>}{(request.status === 'DELIVERED' || request.status === 'DELIVERY_FAILED') && <button className="admin-action-outline" onClick={() => void act(request.id, 'close')}>Close</button>}</div>
        </article>;
      })}
    </section>
    {!loading && requests.length > 0 && <div className="mt-6 flex flex-col items-center gap-3">
      <p className="text-sm text-body" role="status">Showing {requests.length} of {total}</p>
      {nextCursor && <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="admin-action-outline">{loadingMore ? 'Loading…' : 'Load more'}</button>}
    </div>}
  </div>;
}
