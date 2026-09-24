/**
 * Observability dashboard backed only by data the app currently exposes.
 */

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { internalGet } from '@/lib/internalFetch';

type AnalyticsHit = {
  path: string;
  locale?: string;
  eventName?: string;
};

type AnalyticsVital = {
  name: 'FCP' | 'LCP' | 'FID' | 'CLS' | 'TTFB' | string;
  value: number;
  ts?: number;
  id?: string;
};

type AnalyticsResponse = {
  hits?: AnalyticsHit[];
  vitals?: AnalyticsVital[];
};

type TopPath = {
  path: string;
  count: number;
};

type DashboardTab = 'overview' | 'analytics';

interface DashboardProps {
  refreshInterval?: number;
  autoRefresh?: boolean;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildTopPaths(hits: AnalyticsHit[]): TopPath[] {
  const counts = new Map<string, number>();
  for (const hit of hits) {
    counts.set(hit.path, (counts.get(hit.path) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export default function ObservabilityDashboard({
  refreshInterval = 15000,
  autoRefresh = true,
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [analytics, setAnalytics] = useState<AnalyticsResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await internalGet<AnalyticsResponse>('/api/analytics');
      setAnalytics({
        hits: response.hits ?? [],
        vitals: response.vitals ?? [],
      });
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    if (!autoRefresh) return;
    const interval = window.setInterval(fetchDashboardData, refreshInterval);
    return () => window.clearInterval(interval);
  }, [fetchDashboardData, autoRefresh, refreshInterval]);

  const hits = useMemo(() => analytics.hits ?? [], [analytics.hits]);
  const pageviews = useMemo(() => hits.filter((hit) => !hit.eventName), [hits]);
  const vitals = useMemo(() => analytics.vitals ?? [], [analytics.vitals]);
  const topPaths = useMemo(() => buildTopPaths(pageviews), [pageviews]);
  const uniquePaths = useMemo(() => new Set(pageviews.map((hit) => hit.path)).size, [pageviews]);
  const vitalSummary = useMemo(() => {
    const names = ['FCP', 'LCP', 'FID', 'CLS', 'TTFB'];
    return names.map((name) => {
      const samples = vitals.filter((vital) => vital.name === name).map((vital) => vital.value);
      return { name, avg: average(samples), samples: samples.length };
    });
  }, [vitals]);

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'analytics', label: 'Analytics' },
  ] as const;

  const renderOverview = () => (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-600">Tracked Events</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatNumber(hits.length)}</p>
        </div>
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-600">Unique Paths</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatNumber(uniquePaths)}</p>
        </div>
        <div className="rounded-lg border bg-white p-6">
          <p className="text-sm text-gray-600">Web Vital Samples</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatNumber(vitals.length)}</p>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Core Web Vitals</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
          {vitalSummary.map((metric) => (
            <div key={metric.name} className="rounded border border-gray-200 p-4 text-center">
              <div className="text-xl font-semibold text-gray-900">
                {metric.name === 'CLS' ? metric.avg.toFixed(3) : `${metric.avg.toFixed(0)}ms`}
              </div>
              <div className="mt-1 text-xs text-gray-500">{metric.name} · {metric.samples} samples</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  const renderAnalytics = () => (
    <section className="overflow-hidden rounded-lg border bg-white">
      <div className="border-b bg-gray-50 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Top Paths</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left font-medium uppercase text-gray-500">Path</th>
              <th className="px-6 py-3 text-left font-medium uppercase text-gray-500">Hits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {topPaths.map((path) => (
              <tr key={path.path}>
                <td className="break-all px-6 py-4 font-mono text-gray-900">{path.path}</td>
                <td className="px-6 py-4 text-gray-900">{formatNumber(path.count)}</td>
              </tr>
            ))}
            {topPaths.length === 0 && (
              <tr>
                <td colSpan={2} className="px-6 py-8 text-center text-gray-500">No analytics events recorded.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );

  const renderContent = () => {
    if (activeTab === 'analytics') {
      return renderAnalytics();
    }
    return renderOverview();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Observability Dashboard</h1>
            <p className="mt-1 text-gray-600">Analytics from configured application endpoints.</p>
          </div>
          <div className="flex items-center gap-4">
            {lastUpdate && <span className="text-sm text-gray-500">Last updated: {lastUpdate.toLocaleTimeString()}</span>}
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="mb-8 border-b border-gray-200">
          <nav className="-mb-px flex gap-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`border-b-2 px-1 py-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
            Error loading dashboard data: {error}
          </div>
        )}

        <div className="transition-all duration-200">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
