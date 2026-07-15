/**
 * Real-time Health Monitoring Dashboard
 * Provides comprehensive system health visualization
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { internalGet } from '@/lib/internalFetch';

interface HealthCheckDetails {
  [key: string]: string | number | boolean | null;
}

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  details?: HealthCheckDetails;
  timestamp: string;
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  environment: string;
  checks: HealthCheck[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
  performance: {
    totalCheckTime: number;
    slowestCheck?: string;
    fastestCheck?: string;
  };
}

interface HealthMonitorProps {
  refreshInterval?: number;
  autoRefresh?: boolean;
  showDetails?: boolean;
}

export default function HealthMonitor({ 
  refreshInterval = 30000, 
  autoRefresh = true,
  showDetails = true 
}: HealthMonitorProps) {
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchHealthData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await internalGet<HealthData>('/api/health');
      setHealthData(data);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error('Health check fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchHealthData();

    // Set up auto-refresh
    if (autoRefresh) {
      const interval = setInterval(fetchHealthData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchHealthData, autoRefresh, refreshInterval]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return 'text-green-900 bg-green-100';
      case 'degraded': return 'text-amber-900 bg-amber-100';
      case 'unhealthy': return 'text-red-900 bg-red-100';
      default: return 'text-gray-900 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return '✅';
      case 'degraded': return '⚠️';
      case 'unhealthy': return '❌';
      default: return '❓';
    }
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatResponseTime = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    } else {
      return `${(ms / 1000).toFixed(2)}s`;
    }
  };

  if (loading && !healthData) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading health status...</span>
      </div>
    );
  }

  if (error && !healthData) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center">
          <span className="text-red-600 mr-2">❌</span>
          <h3 className="text-red-800 font-medium">Health Check Error</h3>
        </div>
        <p className="text-red-700 mt-1">{error}</p>
        <button
          onClick={fetchHealthData}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!healthData) {
    return (
      <div className="text-center p-8 text-gray-500">
        No health data available
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">System Health Monitor</h2>
        <div className="flex items-center space-x-3">
          {lastUpdate && (
            <span className="text-sm text-gray-500">
              Last updated: {lastUpdate.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={fetchHealthData}
            disabled={loading}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Overall Status */}
      <div className={`rounded-lg p-6 ${getStatusColor(healthData.status)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <span className="text-2xl">{getStatusIcon(healthData.status)}</span>
            <div>
              <h3 className="text-xl font-semibold capitalize">{healthData.status}</h3>
              <p className="text-sm opacity-75">
                System is {healthData.status === 'healthy' ? 'operating normally' : 
                         healthData.status === 'degraded' ? 'experiencing issues' : 
                         'experiencing critical issues'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-75">Uptime</div>
            <div className="font-mono text-lg">{formatUptime(healthData.uptime)}</div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{healthData.summary.total}</div>
          <div className="text-sm text-gray-600">Total Checks</div>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{healthData.summary.healthy}</div>
          <div className="text-sm text-gray-600">Healthy</div>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-yellow-600">{healthData.summary.degraded}</div>
          <div className="text-sm text-gray-600">Degraded</div>
        </div>
        <div className="bg-white rounded-lg border p-4 text-center">
          <div className="text-2xl font-bold text-red-600">{healthData.summary.unhealthy}</div>
          <div className="text-sm text-gray-600">Unhealthy</div>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-600">Total Check Time</div>
            <div className="text-lg font-mono">{formatResponseTime(healthData.performance.totalCheckTime)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Slowest Check</div>
            <div className="text-lg font-mono">{healthData.performance.slowestCheck || 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Fastest Check</div>
            <div className="text-lg font-mono">{healthData.performance.fastestCheck || 'N/A'}</div>
          </div>
        </div>
      </div>

      {/* Individual Health Checks */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold">Health Checks</h3>
        </div>
        <div className="divide-y">
          {healthData.checks.map((check) => (
            <div key={check.name} className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-xl">{getStatusIcon(check.status)}</span>
                  <div>
                    <h4 className="font-medium capitalize">{check.name.replace('_', ' ')}</h4>
                    {check.message && (
                      <p className="text-sm text-gray-600">{check.message}</p>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  {check.responseTime && (
                    <div className="text-sm text-gray-500">
                      {formatResponseTime(check.responseTime)}
                    </div>
                  )}
                  <div className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusColor(check.status)}`}>
                    {check.status}
                  </div>
                </div>
              </div>
              
              {showDetails && check.details && (
                <div className="mt-4 p-3 bg-gray-50 rounded text-sm">
                  <div className="font-medium text-gray-700 mb-2">Details:</div>
                  <pre className="text-gray-600 overflow-x-auto">
                    {JSON.stringify(check.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* System Info */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-lg font-semibold mb-4">System Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-600">Version</div>
            <div className="font-mono">{healthData.version}</div>
          </div>
          <div>
            <div className="text-gray-600">Environment</div>
            <div className="font-mono">{healthData.environment}</div>
          </div>
          <div>
            <div className="text-gray-600">Last Check</div>
            <div className="font-mono">{new Date(healthData.timestamp).toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Status indicator for errors */}
      {error && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <span className="text-yellow-600 mr-2">⚠️</span>
            <span className="text-yellow-800">
              Warning: {error}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
