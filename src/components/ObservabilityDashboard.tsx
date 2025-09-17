/**
 * Real-time Observability Dashboard
 * Comprehensive monitoring interface combining metrics, tracing, and health data
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { internalGet } from '@/lib/internalFetch';
import HealthMonitor from './HealthMonitor';

interface AnalyticsData {
  totalHits: number;
  uniqueVisitors: number;
  pageViews: number;
  vitals: {
    fcp: number;
    lcp: number;
    fid: number;
    cls: number;
    ttfb: number;
  };
  trends: {
    daily: number[];
    hourly: number[];
  };
}

interface SystemMetrics {
  cpu: number;
  memory: number;
  requests: number;
  errors: number;
  responseTime: number;
}

interface TraceData {
  traceId: string;
  duration: number;
  status: 'success' | 'error';
  operations: number;
  timestamp: number;
}

interface DashboardProps {
  refreshInterval?: number;
  autoRefresh?: boolean;
}

type DashboardTab = 'overview' | 'health' | 'metrics' | 'analytics' | 'traces';

export default function ObservabilityDashboard({ 
  refreshInterval = 15000,
  autoRefresh = true 
}: DashboardProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [recentTraces, setRecentTraces] = useState<TraceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch analytics data
      type AnalyticsHit = { ip?: string; type?: string };
      type AnalyticsVital = { name: 'FCP' | 'LCP' | 'FID' | 'CLS' | 'TTFB'; value: number };
      const analytics = await internalGet<{ hits?: AnalyticsHit[]; vitals?: AnalyticsVital[] }>('/api/analytics');
      if (analytics) {
        
        // Transform analytics data
        setAnalyticsData({
          totalHits: analytics.hits?.length || 0,
          uniqueVisitors: new Set((analytics.hits || []).map((h) => h.ip || '')).size,
          pageViews: (analytics.hits || []).filter((h) => h.type === 'page-view')?.length || 0,
          vitals: {
            fcp: (analytics.vitals || []).find((v) => v.name === 'FCP')?.value || 0,
            lcp: (analytics.vitals || []).find((v) => v.name === 'LCP')?.value || 0,
            fid: (analytics.vitals || []).find((v) => v.name === 'FID')?.value || 0,
            cls: (analytics.vitals || []).find((v) => v.name === 'CLS')?.value || 0,
            ttfb: (analytics.vitals || []).find((v) => v.name === 'TTFB')?.value || 0,
          },
          trends: {
            daily: [], // Would implement with more sophisticated analytics
            hourly: [],
          },
        });
      }

      // Mock system metrics (in real implementation, these would come from metrics API)
      setSystemMetrics({
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        requests: Math.floor(Math.random() * 1000),
        errors: Math.floor(Math.random() * 10),
        responseTime: Math.random() * 500,
      });

      // Mock trace data (in real implementation, these would come from tracing API)
      setRecentTraces(
        Array.from({ length: 10 }, (_, i) => ({
          traceId: `trace-${Date.now()}-${i}`,
          duration: Math.random() * 1000,
          status: Math.random() > 0.1 ? 'success' : 'error',
          operations: Math.floor(Math.random() * 10) + 1,
          timestamp: Date.now() - i * 60000,
        }))
      );

      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('Dashboard data fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();

    if (autoRefresh) {
      const interval = setInterval(fetchDashboardData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchDashboardData, autoRefresh, refreshInterval]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'health', label: 'Health', icon: '❤️' },
    { id: 'metrics', label: 'Metrics', icon: '📈' },
    { id: 'analytics', label: 'Analytics', icon: '🔍' },
    { id: 'traces', label: 'Traces', icon: '🔀' },
  ] as const;

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return `${ms.toFixed(0)}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  };

  const getStatusColor = (value: number, thresholds: { good: number; warning: number }) => {
    if (value <= thresholds.good) return 'text-green-600 bg-green-100';
    if (value <= thresholds.warning) return 'text-yellow-600 bg-yellow-100';
    return 'text-red-600 bg-red-100';
  };

  const renderOverview = () => (
    <div className="space-y-6">
      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {analyticsData && (
          <>
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Visitors</p>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(analyticsData.uniqueVisitors)}</p>
                </div>
                <div className="text-3xl">👥</div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Page Views</p>
                  <p className="text-2xl font-bold text-gray-900">{formatNumber(analyticsData.pageViews)}</p>
                </div>
                <div className="text-3xl">📄</div>
              </div>
            </div>
          </>
        )}
        
        {systemMetrics && (
          <>
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Response Time</p>
                  <p className="text-2xl font-bold text-gray-900">{formatDuration(systemMetrics.responseTime)}</p>
                </div>
                <div className="text-3xl">⚡</div>
              </div>
            </div>
            <div className="bg-white rounded-lg border p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Error Rate</p>
                  <p className="text-2xl font-bold text-gray-900">{((systemMetrics.errors / (systemMetrics.requests || 1)) * 100).toFixed(2)}%</p>
                </div>
                <div className="text-3xl">🚨</div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* System Health Overview */}
      {systemMetrics && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">System Resources</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">CPU Usage</span>
                <span className={`text-sm px-2 py-1 rounded ${getStatusColor(systemMetrics.cpu, { good: 70, warning: 85 })}`}>
                  {systemMetrics.cpu.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(systemMetrics.cpu, 100)}%` }}
                ></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">Memory Usage</span>
                <span className={`text-sm px-2 py-1 rounded ${getStatusColor(systemMetrics.memory, { good: 70, warning: 85 })}`}>
                  {systemMetrics.memory.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-green-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(systemMetrics.memory, 100)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Core Web Vitals */}
      {analyticsData && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="text-lg font-semibold mb-4">Core Web Vitals</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{analyticsData.vitals.fcp.toFixed(0)}ms</div>
              <div className="text-sm text-gray-600">FCP</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{analyticsData.vitals.lcp.toFixed(0)}ms</div>
              <div className="text-sm text-gray-600">LCP</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600">{analyticsData.vitals.fid.toFixed(0)}ms</div>
              <div className="text-sm text-gray-600">FID</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{analyticsData.vitals.cls.toFixed(3)}</div>
              <div className="text-sm text-gray-600">CLS</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{analyticsData.vitals.ttfb.toFixed(0)}ms</div>
              <div className="text-sm text-gray-600">TTFB</div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Traces */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold">Recent Traces</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trace ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operations</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {recentTraces.slice(0, 5).map((trace) => (
                <tr key={trace.traceId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                    {trace.traceId.substring(0, 16)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDuration(trace.duration)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {trace.operations}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                      trace.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {trace.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(trace.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'health':
        return <HealthMonitor refreshInterval={refreshInterval} autoRefresh={autoRefresh} />;
      case 'metrics':
        return (
          <div className="text-center p-8 text-gray-500">
            <div className="text-4xl mb-4">📈</div>
            <p>Detailed metrics dashboard coming soon...</p>
            <p className="text-sm mt-2">Will include custom metric visualizations and time-series charts</p>
          </div>
        );
      case 'analytics':
        return (
          <div className="text-center p-8 text-gray-500">
            <div className="text-4xl mb-4">🔍</div>
            <p>Advanced analytics dashboard coming soon...</p>
            <p className="text-sm mt-2">Will include user behavior analysis and conversion funnels</p>
          </div>
        );
      case 'traces':
        return (
          <div className="text-center p-8 text-gray-500">
            <div className="text-4xl mb-4">🔀</div>
            <p>Distributed tracing dashboard coming soon...</p>
            <p className="text-sm mt-2">Will include trace timeline visualization and bottleneck analysis</p>
          </div>
        );
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Observability Dashboard</h1>
            <p className="text-gray-600 mt-1">Real-time monitoring and analytics</p>
          </div>
          <div className="flex items-center space-x-4">
            {lastUpdate && (
              <span className="text-sm text-gray-500">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchDashboardData}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-8">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Error Banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-center">
              <span className="text-red-600 mr-2">⚠️</span>
              <span className="text-red-800">Error loading dashboard data: {error}</span>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="transition-all duration-200">
          {renderContent()}
        </div>
      </div>
    </div>
  );
}