'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { MetricCard } from '@/components/ui/MetricCard';
import { Surface } from '@/components/ui/Surface';
import { adminRequest, emptySummary, type Summary } from '@/app/admin/adminApi';

export default function AdminHomeClient() {
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadSummary = async () => {
      setLoading(true);
      setError('');
      try {
        const result = await adminRequest<{ summary?: Summary } | undefined>(
          'Unable to load admin dashboard data',
          '/api/admin/check-in-requests?status=all&limit=1',
        );
        if (!result.ok) {
          setError(result.message);
          return;
        }

        setSummary(result.data?.summary ?? emptySummary);
      } catch (err) {
        console.error('Failed to load admin dashboard data', err);
        setError('Unable to load admin dashboard data');
      } finally {
        setLoading(false);
      }
    };

    loadSummary();
  }, []);

  const cards = [
    {
      title: 'Pending arrival requests',
      value: loading ? '...' : String(summary.pending),
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
      title: 'Availability & prices',
      value: 'Calendar',
      body: 'Set seasonal nightly prices and check the Booking.com calendar sync.',
      href: '/admin/availability',
      action: 'Open availability',
    },
    {
      title: 'Settings',
      value: 'Shared state',
      body: 'Manage guest portal and check-in availability across all app instances.',
      href: '/admin/settings',
      action: 'Open settings',
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Surface padding="lg" radius="lg" shadow="lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] admin-eyebrow">
              Admin
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold italic admin-title">
              Operations
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 admin-muted">
              Manage guest arrival requests, bookings, and operational monitoring from one place.
            </p>
          </div>
          <Button asChild variant="primary" size="sm">
            <Link href="/admin/requests">Review requests</Link>
          </Button>
        </div>
      </Surface>

      {error && (
        <div className="mt-5 rounded-tile px-4 py-3 text-sm feedback-error" role="alert">
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
          <MetricCard key={label} label={label} value={loading ? '...' : value} />
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Admin work areas">
        {cards.map((card) => (
          <div key={card.title} className="admin-card rounded-tile border p-5 shadow-sm">
            <div className="flex min-h-[9rem] flex-col justify-between gap-5">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h2 className="font-display text-2xl font-semibold italic admin-title">{card.title}</h2>
                  <Badge variant="warning">
                    {card.value}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-6 admin-muted">{card.body}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={card.href}
                  className="admin-action-outline shell-link"
                >
                  {card.action}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
