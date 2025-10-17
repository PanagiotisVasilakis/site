/**
 * Core Web Vitals Reporter Component
 * Real-time performance monitoring and reporting for Core Web Vitals
 */

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { onCLS, onFID, onLCP, onINP, onTTFB } from 'web-vitals';
import { internalPost } from '@/lib/internalFetch';

interface WebVitalMetric {
  name: 'CLS' | 'FID' | 'LCP' | 'INP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
  id: string;
}

interface WebVitalsState {
  metrics: Record<string, WebVitalMetric>;
  isLoading: boolean;
  score: number;
  recommendations: string[];
}

interface WebVitalsReporterProps {
  showWidget?: boolean;
  position?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  enableRealTimeReporting?: boolean;
  enableRecommendations?: boolean;
  onMetricUpdate?: (metric: WebVitalMetric) => void;
  className?: string;
}

const METRIC_THRESHOLDS = {
  CLS: { good: 0.1, poor: 0.25 },
  FID: { good: 100, poor: 300 },
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  TTFB: { good: 800, poor: 1800 },
};

const METRIC_DESCRIPTIONS = {
  CLS: 'Cumulative Layout Shift - Visual stability of the page',
  FID: 'First Input Delay - Responsiveness to user interaction',
  LCP: 'Largest Contentful Paint - Loading performance',
  INP: 'Interaction to Next Paint - Overall responsiveness',
  TTFB: 'Time to First Byte - Server response time',
};

// Send metrics to analytics endpoint
function sendMetric(metric: { name: string; value: number; id: string; rating: string }) {
  try {
    const envEnabled = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ENABLE_PERF_TELEMETRY === 'true' : false;
    const isProd = typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : false;
    if (!isProd && !envEnabled) return;
    // Use sendBeacon for reliable reporting
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/performance', JSON.stringify({
        type: 'core-web-vital',
        sessionId: 'web-vitals-session',
        metric: {
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          timestamp: Date.now(),
          id: metric.id,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      }));
    } else {
      // Fallback to helper
      internalPost('/api/performance', {
        type: 'core-web-vital',
        sessionId: 'web-vitals-session',
        metric: {
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          timestamp: Date.now(),
          id: metric.id,
          url: window.location.href,
          userAgent: navigator.userAgent,
        },
      }).catch(err => {
        console.warn('Failed to send web vital metric', { metric, error: err });
      });
    }
  } catch (err) {
    console.warn('sendBeacon vitals failed', { metric, error: err });
  }
}

function WebVitalsReporterInternal({
  showWidget = process.env.NODE_ENV === 'development',
  position = 'bottom-right',
  // Default to false to avoid duplicate reporting; performanceMonitor handles sending
  enableRealTimeReporting = false,
  onMetricUpdate,
  className,
}: WebVitalsReporterProps) {
  const [vitalsState, setVitalsState] = useState<WebVitalsState>({
    metrics: {},
    isLoading: true,
    score: 100,
    recommendations: [],
  });

  const [isExpanded, setIsExpanded] = useState(false);

  const getRating = (metricName: string, value: number): 'good' | 'needs-improvement' | 'poor' => {
    const threshold = METRIC_THRESHOLDS[metricName as keyof typeof METRIC_THRESHOLDS];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  };

  // Handle metric updates from Web Vitals
  const handleMetricUpdate = useCallback((metric: { name: 'CLS' | 'FID' | 'LCP' | 'INP' | 'TTFB'; value: number; id: string }) => {
    const rating = getRating(metric.name, metric.value);
    
    const webVitalMetric: WebVitalMetric = {
      name: metric.name,
      value: metric.value,
      rating,
      timestamp: Date.now(),
      id: metric.id,
    };

    setVitalsState(prev => {
      const newMetrics = { ...prev.metrics, [metric.name]: webVitalMetric };
      const score = calculateOverallScore(Object.values(newMetrics));

      return {
        ...prev,
        metrics: newMetrics,
        isLoading: false,
        score,
      };
    });

    // Optionally send directly; by default rely on performanceMonitor batching
    if (enableRealTimeReporting) {
      sendMetric({
        name: metric.name,
        value: metric.value,
        id: metric.id,
        rating,
      });
    }

    // Collection handled by performanceMonitor; avoid duplicating here

    // Call custom handler
    onMetricUpdate?.(webVitalMetric);
  }, [enableRealTimeReporting, onMetricUpdate]);

  const calculateOverallScore = (metrics: WebVitalMetric[]): number => {
    if (metrics.length === 0) return 100;

    const scores: number[] = metrics.map(metric => {
      switch (metric.rating) {
        case 'good': return 100;
        case 'needs-improvement': return 50;
        case 'poor': return 0;
        default: return 100;
      }
    });

    return Math.round(scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length);
  };

  const formatMetricValue = (name: string, value: number): string => {
    switch (name) {
      case 'CLS':
        return value.toFixed(3);
      case 'FID':
      case 'LCP':
      case 'INP':
      case 'TTFB':
        return `${Math.round(value)}ms`;
      default:
        return value.toString();
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getRatingColor = (rating: string): string => {
    switch (rating) {
      case 'good': return 'text-green-600 bg-green-100';
      case 'needs-improvement': return 'text-yellow-600 bg-yellow-100';
      case 'poor': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getPositionClasses = (): string => {
    const base = 'fixed z-50';
    switch (position) {
      case 'bottom-left':
        return `${base} bottom-4 left-4`;
      case 'bottom-right':
        return `${base} bottom-4 right-4`;
      case 'top-left':
        return `${base} top-4 left-4`;
      case 'top-right':
        return `${base} top-4 right-4`;
      default:
        return `${base} bottom-4 right-4`;
    }
  };

  // Set up Web Vitals monitoring
  useEffect(() => {
    if (typeof window === 'undefined') return;

    onCLS(handleMetricUpdate);
    onFID(handleMetricUpdate);
    onLCP(handleMetricUpdate);
    onINP(handleMetricUpdate);
    onTTFB(handleMetricUpdate);
  }, [handleMetricUpdate]);

  // Removed duplicate always-on sender to avoid posting vitals twice

  if (!showWidget) {
    return null;
  }

  return (
    <div className={`${getPositionClasses()} ${className || ''}`}>
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden max-w-sm">
        {/* Header */}
        <div 
          className="p-3 bg-gray-50 border-b border-gray-200 cursor-pointer flex items-center justify-between"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-blue-500"></div>
            <h3 className="text-sm font-semibold text-gray-900">Core Web Vitals</h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`text-lg font-bold ${getScoreColor(vitalsState.score)}`}>
              {vitalsState.score}
            </span>
            <svg 
              className={`w-4 h-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Content */}
        {isExpanded && (
          <div className="p-4">
            {vitalsState.isLoading ? (
              <div className="flex items-center justify-center py-4">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500"></div>
                <span className="ml-2 text-sm text-gray-600">Measuring...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Metrics */}
                <div className="space-y-2">
                  {Object.values(vitalsState.metrics).map(metric => (
                    <div key={metric.name} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900">{metric.name}</span>
                        <div 
                          className="group relative"
                          title={METRIC_DESCRIPTIONS[metric.name]}
                        >
                          <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-mono">
                          {formatMetricValue(metric.name, metric.value)}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getRatingColor(metric.rating)}`}>
                          {metric.rating.replace('-', ' ')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="border-t border-gray-200 pt-3 flex space-x-2">
                  <button
                    onClick={() => window.location.reload()}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded hover:bg-blue-100 transition-colors"
                  >
                    Remeasure
                  </button>
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
                  >
                    Minimize
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function WebVitalsReporter(props: Partial<WebVitalsReporterProps> = {}) {
  return <WebVitalsReporterInternal showWidget={false} {...(props as WebVitalsReporterProps)} />;
}