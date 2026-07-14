'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import internalFetch from '@/lib/internalFetchClient';
import { Badge, EmptyPanel, MetricCard, Surface } from '@/components/ui';

type RequestStatus = 'pending' | 'approved' | 'rejected';
type RequestFilter = RequestStatus | 'all';
type Feedback = { type: 'success' | 'error'; message: string } | null;

type CheckInRequest = {
  id: string;
  bookingId?: string;
  userId?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  requestedTime: string;
  message?: string;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
};

type Summary = {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
};

const filters: Array<{ value: RequestFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const emptySummary: Summary = {
  pending: 0,
  approved: 0,
  rejected: 0,
  total: 0,
};

function formatDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function displayGuest(request: CheckInRequest): string {
  return request.guestName || request.guestEmail || request.guestPhone || 'Guest';
}

function initialsFor(value: string): string {
  const parts = value
    .replace(/[^a-zA-Z0-9@\s._+-]/g, ' ')
    .split(/[\s@._+-]+/)
    .filter(Boolean);

  if (parts.length === 0) return 'G';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join('');
}

export default function AdminRequestsClient() {
  const [requests, setRequests] = useState<CheckInRequest[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [filter, setFilter] = useState<RequestFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadRequests = useCallback(async (nextFilter: RequestFilter, clearFeedback = true) => {
    setLoading(true);
    if (clearFeedback) setFeedback(null);
    try {
      const response = await internalFetch(`/api/admin/check-in-requests?status=${nextFilter}`);
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setRequests([]);
        setSummary(emptySummary);
        setFeedback({
          type: 'error',
          message: data?.error?.message || 'Unable to load arrival requests',
        });
        return;
      }

      setRequests(data.data?.requests ?? []);
      setSummary(data.data?.summary ?? emptySummary);
    } catch (error) {
      console.error('Failed to load arrival requests', error);
      setRequests([]);
      setSummary(emptySummary);
      setFeedback({ type: 'error', message: 'Unable to load arrival requests' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests('pending');
  }, [loadRequests]);

  const summaryCards = useMemo(() => ([
    ['Pending Requests', summary.pending],
    ['Approved', summary.approved],
    ['Rejected', summary.rejected],
    ['Total', summary.total],
  ]), [summary]);

  const changeFilter = (nextFilter: RequestFilter) => {
    setFilter(nextFilter);
    loadRequests(nextFilter);
  };

  const updateRequestStatus = async (requestId: string, status: Exclude<RequestStatus, 'pending'>) => {
    setActionId(requestId);
    setFeedback(null);
    try {
      const response = await internalFetch(`/api/admin/check-in-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        setFeedback({
          type: 'error',
          message: data?.error?.message || `Unable to ${status} request`,
        });
        return;
      }

      await loadRequests(filter, false);
      setFeedback({
        type: 'success',
        message: `Request ${status}. Notification ${data.data?.notification?.status ?? 'skipped'}.`,
      });
    } catch (error) {
      console.error('Failed to update request status', error);
      setFeedback({ type: 'error', message: `Unable to ${status} request` });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Surface padding="lg" radius="lg" shadow="lg" border="none">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-accent-subtle">
              Admin inbox
            </p>
            <h1 className="mt-2 font-serif text-4xl font-semibold italic page-title">
              Requests
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-body">
              Review guest arrival-time requests without using guest sessions or credentials.
            </p>
          </div>
          <Link
            href="/admin"
            className="admin-action-outline min-h-11 px-5"
          >
            Back to operations
          </Link>
        </div>
      </Surface>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Request summary">
        {summaryCards.map(([label, value]) => (
          <MetricCard key={label} label={label} value={loading ? '...' : value} />
        ))}
      </section>

      <div className="mt-6 surface-card rounded-lg border border-soft p-4 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Request filters">
            {filters.map((item) => {
              const active = item.value === filter;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => changeFilter(item.value)}
                  aria-pressed={active}
                  className={active ? 'admin-action-primary min-h-10' : 'admin-action-outline'}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => loadRequests(filter)}
            disabled={loading}
            className="admin-action-outline"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {feedback && (
          <div
            className={`mt-4 rounded-lg px-4 py-3 text-sm ${feedback.type === 'success' ? 'feedback-success' : 'feedback-error'}`}
            role={feedback.type === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </div>
        )}
      </div>

      <section className="mt-6 space-y-4" aria-label="Arrival-time requests">
        {loading ? (
          <EmptyPanel>Loading requests...</EmptyPanel>
        ) : requests.length === 0 ? (
          <EmptyPanel title="No requests">There are no arrival-time requests for this filter.</EmptyPanel>
        ) : (
          requests.map((request) => {
            const guest = displayGuest(request);
            const isPending = request.status === 'pending';
            const isActing = actionId === request.id;

            return (
              <article key={request.id} className="surface-card rounded-lg border border-soft p-5 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="admin-avatar">
                      {initialsFor(guest)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words font-serif text-2xl font-semibold italic section-title">
                          {guest}
                        </h2>
                        <Badge variant={request.status}>
                          {request.status}
                        </Badge>
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Requested arrival</dt>
                          <dd className="mt-1 font-semibold text-text-accent">{request.requestedTime}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Standard check-in</dt>
                          <dd className="mt-1 text-body">15:00</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Submitted</dt>
                          <dd className="mt-1 text-body">{formatDateTime(request.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Updated</dt>
                          <dd className="mt-1 text-body">{formatDateTime(request.updatedAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Booking</dt>
                          <dd className="mt-1 break-all text-body">{request.bookingId || 'Unavailable'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-subtle">Contact</dt>
                          <dd className="mt-1 break-words text-body">
                            {request.guestEmail || request.guestPhone || 'Unavailable'}
                          </dd>
                        </div>
                      </dl>
                      {request.guestEmail && request.guestPhone && (
                        <p className="mt-3 text-sm text-body">{request.guestPhone}</p>
                      )}
                      {request.message && (
                        <div className="admin-note-panel mt-4 text-body">
                          {request.message}
                        </div>
                      )}
                    </div>
                  </div>

                  {isPending && (
                    <div className="grid gap-2 sm:grid-cols-2 lg:w-56 lg:grid-cols-1">
                      <button
                        type="button"
                        onClick={() => updateRequestStatus(request.id, 'approved')}
                        disabled={isActing}
                        className="admin-action-primary"
                      >
                        {isActing ? 'Updating...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        onClick={() => updateRequestStatus(request.id, 'rejected')}
                        disabled={isActing}
                        className="admin-action-danger"
                      >
                        {isActing ? 'Updating...' : 'Reject'}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
