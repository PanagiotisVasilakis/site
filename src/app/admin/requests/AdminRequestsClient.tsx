'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EmptyPanel } from '@/components/ui/EmptyPanel';
import { MetricCard } from '@/components/ui/MetricCard';
import { Surface } from '@/components/ui/Surface';
import {
  adminRequest,
  emptySummary,
  type CheckInRequest,
  type RequestStatus,
  type Summary,
} from '@/app/admin/adminApi';

type RequestFilter = RequestStatus | 'all';
type Feedback = { type: 'success' | 'error'; message: string } | null;

type RequestsPage = {
  requests?: CheckInRequest[];
  summary?: Summary;
  total?: number;
  nextCursor?: string | null;
};

const filters: Array<{ value: RequestFilter; label: string }> = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

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
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [standardCheckInTime, setStandardCheckInTime] = useState('15:00');
  const loadVersionRef = useRef(0);
  const loadAbortRef = useRef<AbortController | null>(null);
  const filterRef = useRef<RequestFilter>('pending');

  const loadRequests = useCallback(async (nextFilter: RequestFilter, clearFeedback = true) => {
    const version = loadVersionRef.current + 1;
    loadVersionRef.current = version;
    loadAbortRef.current?.abort();
    const controller = new AbortController();
    loadAbortRef.current = controller;
    setLoading(true);
    if (clearFeedback) setFeedback(null);
    try {
      const result = await adminRequest<RequestsPage | undefined>(
        'Unable to load arrival requests',
        `/api/admin/check-in-requests?status=${nextFilter}`,
        { signal: controller.signal },
      );
      if (version !== loadVersionRef.current) return;
      if (!result.ok) {
        setRequests([]);
        setSummary(emptySummary);
        setNextCursor(null);
        setFeedback({ type: 'error', message: result.message });
        return;
      }

      const loaded: CheckInRequest[] = result.data?.requests ?? [];
      setRequests(loaded);
      setSummary(result.data?.summary ?? emptySummary);
      setTotal(result.data?.total ?? loaded.length);
      setNextCursor(result.data?.nextCursor ?? null);
    } catch (error) {
      if (controller.signal.aborted || version !== loadVersionRef.current) return;
      console.error('Failed to load arrival requests', error);
      setRequests([]);
      setSummary(emptySummary);
      setNextCursor(null);
      setFeedback({ type: 'error', message: 'Unable to load arrival requests' });
    } finally {
      if (version === loadVersionRef.current) {
        loadAbortRef.current = null;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;
    void loadRequests('pending');
    void adminRequest<{ checkInTime?: string }>('Unable to load check-in preferences', '/api/check-in/preferences')
      .then((result) => {
        if (active && result.ok && typeof result.data?.checkInTime === 'string' && result.data.checkInTime) {
          setStandardCheckInTime(result.data.checkInTime);
        }
      });
    return () => {
      active = false;
      loadVersionRef.current += 1;
      loadAbortRef.current?.abort();
    };
  }, [loadRequests]);

  const summaryCards = useMemo(() => ([
    ['Pending Requests', summary.pending],
    ['Approved', summary.approved],
    ['Rejected', summary.rejected],
    ['Total', summary.total],
  ]), [summary]);

  const loadMore = async () => {
    if (!nextCursor) return;
    const version = loadVersionRef.current;
    setLoadingMore(true);
    try {
      const result = await adminRequest<RequestsPage | undefined>(
        'Unable to load more requests',
        `/api/admin/check-in-requests?status=${filterRef.current}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      if (version !== loadVersionRef.current) return;
      if (!result.ok) {
        setFeedback({ type: 'error', message: result.message });
        return;
      }
      const more: CheckInRequest[] = result.data?.requests ?? [];
      setRequests((current) => {
        const known = new Set(current.map((request) => request.id));
        return [...current, ...more.filter((request) => !known.has(request.id))];
      });
      setSummary(result.data?.summary ?? emptySummary);
      setTotal(result.data?.total ?? 0);
      setNextCursor(result.data?.nextCursor ?? null);
    } catch (error) {
      if (version !== loadVersionRef.current) return;
      console.error('Failed to load more arrival requests', error);
      setFeedback({ type: 'error', message: 'Unable to load more requests' });
    } finally {
      setLoadingMore(false);
    }
  };

  const changeFilter = (nextFilter: RequestFilter) => {
    filterRef.current = nextFilter;
    setFilter(nextFilter);
    void loadRequests(nextFilter);
  };

  const retryNotification = async (requestId: string) => {
    setActionId(requestId);
    setFeedback(null);
    try {
      const result = await adminRequest('Unable to retry the notification', `/api/admin/check-in-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry_delivery' }),
      });
      if (!result.ok) {
        setFeedback({ type: 'error', message: result.message });
        return;
      }
      await loadRequests(filterRef.current, false);
      setFeedback({ type: 'success', message: 'Notification queued for delivery.' });
    } catch (error) {
      console.error('Failed to retry notification', error);
      setFeedback({ type: 'error', message: 'Unable to retry the notification' });
    } finally {
      setActionId(null);
    }
  };

  const updateRequestStatus = async (requestId: string, status: Exclude<RequestStatus, 'pending'>) => {
    setActionId(requestId);
    setFeedback(null);
    try {
      const result = await adminRequest<{ notification?: { status?: string } } | undefined>(
        `Unable to ${status} request`,
        `/api/admin/check-in-requests/${requestId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );

      if (!result.ok) {
        // Another administrator may have decided it already (409): show the current list, then the reason.
        await loadRequests(filterRef.current, false);
        setFeedback({ type: 'error', message: result.message });
        return;
      }

      await loadRequests(filterRef.current, false);
      setFeedback({
        type: 'success',
        message: `Request ${status}. Notification ${result.data?.notification?.status ?? 'skipped'}.`,
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
      <Surface padding="lg" radius="lg" shadow="lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] admin-eyebrow">
              Admin inbox
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold italic admin-title">
              Requests
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 admin-muted">
              Review guest arrival-time requests without using guest sessions or credentials.
            </p>
          </div>
          <Link
            href="/admin"
            className="admin-action-outline shell-link min-h-11 px-5"
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

      <div className="admin-card mt-6 rounded-tile border p-4 shadow-sm">
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
            className={`mt-4 rounded-tile px-4 py-3 text-sm ${feedback.type === 'success' ? 'feedback-success' : 'feedback-error'}`}
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
              <article key={request.id} className="admin-card rounded-tile border p-5 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="admin-avatar">
                      {initialsFor(guest)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="break-words font-display text-2xl font-semibold italic admin-title">
                          {guest}
                        </h2>
                        <Badge variant={request.status}>
                          {request.status}
                        </Badge>
                        {request.notificationStatus === 'dead' && (
                          <Badge variant="rejected">Notification failed</Badge>
                        )}
                      </div>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] admin-muted">Requested arrival</dt>
                          <dd className="mt-1 font-semibold admin-accent">{request.requestedTime}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] admin-muted">Standard check-in</dt>
                          <dd className="mt-1 admin-muted">{standardCheckInTime}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] admin-muted">Submitted</dt>
                          <dd className="mt-1 admin-muted">{formatDateTime(request.createdAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] admin-muted">Updated</dt>
                          <dd className="mt-1 admin-muted">{formatDateTime(request.updatedAt)}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] admin-muted">Booking</dt>
                          <dd className="mt-1 break-all admin-muted">{request.bookingId || 'Unavailable'}</dd>
                        </div>
                        <div>
                          <dt className="text-xs font-semibold uppercase tracking-[0.12em] admin-muted">Contact</dt>
                          <dd className="mt-1 break-words admin-muted">
                            {request.guestEmail || request.guestPhone || 'Unavailable'}
                          </dd>
                        </div>
                      </dl>
                      {request.guestEmail && request.guestPhone && (
                        <p className="mt-3 text-sm admin-muted">{request.guestPhone}</p>
                      )}
                      {request.message && (
                        <div className="admin-note-panel mt-4">
                          {request.message}
                        </div>
                      )}
                    </div>
                  </div>

                  {request.notificationStatus === 'dead' && (
                    <button
                      type="button"
                      onClick={() => retryNotification(request.id)}
                      disabled={isActing}
                      className="admin-action-outline lg:w-56"
                    >
                      {isActing ? 'Updating...' : 'Retry notification'}
                    </button>
                  )}

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

      {!loading && requests.length > 0 && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-sm admin-muted" role="status">Showing {requests.length} of {total}</p>
          {nextCursor && (
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="admin-action-outline">
              {loadingMore ? 'Loading...' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
