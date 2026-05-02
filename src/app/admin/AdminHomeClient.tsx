'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import internalFetch from '@/lib/internalFetchClient';
import { getStoredAdminSecret, persistAdminSecretFromUrl } from '@/lib/adminClientSession';

type Summary = {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
};

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

const emptySummary: Summary = {
  pending: 0,
  approved: 0,
  rejected: 0,
  total: 0,
};

export default function AdminHomeClient() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [state, setState] = useState<LoadState>('idle');
  const [error, setError] = useState('');
  const [analyticsHref, setAnalyticsHref] = useState('/admin/analytics');

  useEffect(() => {
    persistAdminSecretFromUrl();
    const secret = getStoredAdminSecret();
    if (secret) {
      setAnalyticsHref(`/admin/analytics?token=${encodeURIComponent(secret)}`);
    }

    const loadSummary = async () => {
      setState('loading');
      setError('');
      try {
        const response = await internalFetch('/api/admin/check-in-requests?status=all');
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) {
          setError(data?.error?.message || 'Unable to load admin dashboard data');
          setState('error');
          return;
        }

        setSummary(data.data?.summary ?? emptySummary);
        setState('ready');
      } catch (err) {
        console.error('Failed to load admin dashboard data', err);
        setError('Unable to load admin dashboard data');
        setState('error');
      }
    };

    loadSummary();
  }, []);

  const cards = useMemo(() => ([
    {
      title: 'Pending arrival requests',
      value: state === 'loading' ? '...' : String(summary.pending),
      body: 'Review guest arrival-time requests and confirm availability.',
      href: '/admin/requests',
      action: 'Open requests',
    },
    {
      title: 'Guests',
      value: 'Bookings',
      body: 'Search bookings, check guest records, and review check-in activity.',
      href: '/admin/guests',
      action: 'Open guests',
    },
    {
      title: 'Messages',
      value: 'Placeholder',
      body: 'Message management can be connected here when the workflow is ready.',
      href: undefined,
      action: 'Not configured',
    },
    {
      title: 'Settings',
      value: 'Placeholder',
      body: 'Operational settings can be added here without changing guest auth.',
      href: undefined,
      action: 'Not configured',
    },
    {
      title: 'Analytics',
      value: 'Monitoring',
      body: 'Open analytics and observability dashboards.',
      href: analyticsHref,
      secondaryHref: '/admin/dashboard',
      action: 'Open analytics',
    },
  ]), [analyticsHref, state, summary.pending]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="surface-card rounded-xl p-6 shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-text-accent-subtle">
              Admin
            </p>
            <h1 className="mt-2 font-serif text-4xl font-semibold italic page-title">
              Operations
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-body">
              Manage guest arrival requests, bookings, and operational monitoring from one place.
            </p>
          </div>
          <Link
            href="/admin/requests"
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-[color:var(--brand-700)] px-5 py-2 text-sm font-semibold text-[color:var(--fg-inverse)] shadow-sm transition hover:bg-[color:var(--brand-800)]"
          >
            Review requests
          </Link>
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-lg border border-[#dfb8a8] bg-[#fff4ef] px-4 py-3 text-sm text-[#82432d] dark:border-[#613426] dark:bg-[#321d17] dark:text-[#F0B8A0]" role="alert">
          {error}
        </div>
      )}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Request summary">
        {[
          ['Pending Requests', summary.pending],
          ['Approved', summary.approved],
          ['Rejected', summary.rejected],
          ['Total', summary.total],
        ].map(([label, value]) => (
          <div key={label} className="surface-card rounded-lg border border-soft p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">{label}</p>
            <p className="mt-2 text-3xl font-semibold text-text-accent">
              {state === 'loading' ? '...' : value}
            </p>
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Admin work areas">
        {cards.map((card) => (
          <div key={card.title} className="surface-card rounded-lg border border-soft p-5 shadow-sm">
            <div className="flex min-h-[9rem] flex-col justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-serif text-2xl font-semibold italic section-title">{card.title}</h2>
                  <span className="rounded-full bg-[#f0e3ce] px-3 py-1 text-xs font-semibold text-[#6f552f] dark:bg-[#26372d] dark:text-[#D8C7A1]">
                    {card.value}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-body">{card.body}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {card.href ? (
                  <Link
                    href={card.href}
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#cfb994] px-4 py-2 text-sm font-semibold text-[#6f552f] transition hover:bg-[#f4eadb] dark:border-[#4a5a4d] dark:text-[#D8C7A1] dark:hover:bg-[#203026]"
                  >
                    {card.action}
                  </Link>
                ) : (
                  <span className="inline-flex min-h-10 items-center rounded-full border border-soft px-4 py-2 text-sm font-semibold text-subtle">
                    {card.action}
                  </span>
                )}
                {card.secondaryHref && (
                  <Link
                    href={card.secondaryHref}
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-soft px-4 py-2 text-sm font-semibold text-body transition hover:bg-[color:var(--layer-surface-alt)]"
                  >
                    Open monitoring
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
