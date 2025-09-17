/**
 * React Performance Monitoring Hook
 * Client-side performance tracking with Core Web Vitals integration
 */

'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { onCLS, onFID, onLCP, onINP, onTTFB, onFCP } from 'web-vitals';
import { usePerformanceMonitoring } from '@/lib/performanceMonitor';
import { logger } from '@/lib/logger';

interface PerformanceMetrics {
  cls: number | null;
  fid: number | null;
  lcp: number | null;
  inp: number | null;
  ttfb: number | null;
  fcp: number | null;
  renderTime: number | null;
  hydrationTime: number | null;
  componentLoadTime: number | null;
}

interface UsePerformanceOptions {
  enabled?: boolean;
  trackComponentMetrics?: boolean;
  trackUserInteractions?: boolean;
  reportInterval?: number;
  onMetricCollected?: (metric: string, value: number) => void;
  customMetrics?: Record<string, () => number>;
}

interface ComponentPerformanceData {
  componentName: string;
  renderTime: number;
  mountTime: number;
  updateCount: number;
  lastUpdate: number;
}

export function usePerformance(
  componentName: string = 'Unknown',
  options: UsePerformanceOptions = {}
) {
  const {
    enabled = true,
    trackComponentMetrics = true,
    trackUserInteractions = true,
    reportInterval = 30000, // 30 seconds
    onMetricCollected,
    customMetrics = {},
  } = options;

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    cls: null,
    fid: null,
    lcp: null,
    inp: null,
    ttfb: null,
    fcp: null,
    renderTime: null,
    hydrationTime: null,
    componentLoadTime: null,
  });

  const [componentData, setComponentData] = useState<ComponentPerformanceData>({
    componentName,
    renderTime: 0,
    mountTime: Date.now(),
    updateCount: 0,
    lastUpdate: Date.now(),
  });

  const { trackCustomMetric } = usePerformanceMonitoring();
  
  const renderStartRef = useRef<number | null>(null);
  const updateCountRef = useRef<number>(0);
  const reportTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastInteractionRef = useRef<number>(0);
  const interactionThrottleMs = 750; // don't record interactions more frequently than this

  // Web Vitals collection
  const collectWebVitals = useCallback(() => {
    if (!enabled) return;

    const handleMetric = (metric: { name: string; value: number; rating?: string }) => {
      setMetrics(prev => ({
        ...prev,
        [metric.name.toLowerCase()]: metric.value,
      }));

      // Track with performance monitoring system
      trackCustomMetric(`web-vital-${metric.name.toLowerCase()}`, metric.value, {
        componentName,
        rating: metric.rating || 'unknown',
        timestamp: Date.now(),
      });

      // Call custom handler
      onMetricCollected?.(metric.name, metric.value);

      logger.debug('Web Vital collected', {
        component: componentName,
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
      });
    };

    // Set up Web Vitals observers
    onCLS(handleMetric);
    onFID(handleMetric);
    onLCP(handleMetric);
    onINP(handleMetric);
    onTTFB(handleMetric);
    onFCP(handleMetric);
  }, [enabled, componentName, trackCustomMetric, onMetricCollected]);

  // Component render time tracking
  const trackRenderStart = useCallback(() => {
    if (!enabled || !trackComponentMetrics) return;
    renderStartRef.current = performance.now();
  }, [enabled, trackComponentMetrics]);

  const trackRenderEnd = useCallback(() => {
    if (!enabled || !trackComponentMetrics || !renderStartRef.current) return;
    
    const renderTime = performance.now() - renderStartRef.current;
    
    setMetrics(prev => ({ ...prev, renderTime }));
    setComponentData(prev => ({
      ...prev,
      renderTime,
      updateCount: prev.updateCount + 1,
      lastUpdate: Date.now(),
    }));

    trackCustomMetric('component-render-time', renderTime, {
      componentName,
      updateCount: updateCountRef.current + 1,
    });

    updateCountRef.current += 1;
    renderStartRef.current = null;
  }, [enabled, trackComponentMetrics, componentName, trackCustomMetric]);

  // User interaction tracking
  const trackInteraction = useCallback((interactionType: string, target?: string) => {
    if (!enabled || !trackUserInteractions) return;
    const now = Date.now();
    if (now - lastInteractionRef.current < interactionThrottleMs) return;
    lastInteractionRef.current = now;
    const timestamp = now;
    
    trackCustomMetric('user-interaction', timestamp, {
      componentName,
      interactionType,
      target: target || 'unknown',
    });

    logger.debug('User interaction tracked', {
      component: componentName,
      interaction: interactionType,
      target,
      timestamp,
    });
  }, [enabled, trackUserInteractions, componentName, trackCustomMetric]);

  // Custom metric collection
  const collectCustomMetrics = useCallback(() => {
    if (!enabled || Object.keys(customMetrics).length === 0) return;

    Object.entries(customMetrics).forEach(([metricName, metricFunction]) => {
      try {
        const value = metricFunction();
        trackCustomMetric(`custom-${metricName}`, value, {
          componentName,
        });
      } catch (error) {
        logger.warn('Custom metric collection failed', {
          component: componentName,
          metric: metricName,
          error,
        });
      }
    });
  }, [enabled, customMetrics, componentName, trackCustomMetric]);

  // Periodic reporting
  const scheduleReport = useCallback(() => {
    if (!enabled || reportInterval <= 0) return;

    if (reportTimeoutRef.current) {
      clearTimeout(reportTimeoutRef.current);
    }

    reportTimeoutRef.current = setTimeout(() => {
      collectCustomMetrics();
      // Manual reporting - send accumulated metrics
      logger.info('Performance metrics report', {
        component: componentName,
        metrics,
        componentData,
      });
      scheduleReport(); // Schedule next report
    }, reportInterval);
  }, [enabled, reportInterval, collectCustomMetrics, componentName, metrics, componentData]);

  // Performance observer for long tasks
  const observeLongTasks = useCallback(() => {
    if (!enabled || typeof window === 'undefined') return;

    if ('PerformanceObserver' in window) {
      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.duration > 50) { // Long task threshold
              trackCustomMetric('long-task', entry.duration, {
                componentName,
                startTime: entry.startTime,
                entryType: entry.entryType,
              });

              logger.warn('Long task detected', {
                component: componentName,
                duration: entry.duration,
                startTime: entry.startTime,
              });
            }
          });
        });

        longTaskObserver.observe({ entryTypes: ['longtask'] });

        return () => longTaskObserver.disconnect();
      } catch (error) {
        logger.warn('Long task observer setup failed', { error });
      }
    }
  }, [enabled, componentName, trackCustomMetric]);

  // Initialize performance tracking
  useEffect(() => {
    if (!enabled) return;

    collectWebVitals();
    const cleanupLongTasks = observeLongTasks();
    scheduleReport();

    return () => {
      if (reportTimeoutRef.current) {
        clearTimeout(reportTimeoutRef.current);
      }
      cleanupLongTasks?.();
    };
  }, [enabled, collectWebVitals, observeLongTasks, scheduleReport]);

  // Event handlers for common interactions
  const createInteractionHandler = useCallback(
    (interactionType: string) => 
      (event: React.SyntheticEvent) => {
        const target = (event.target as HTMLElement)?.tagName?.toLowerCase() || 'unknown';
        trackInteraction(interactionType, target);
      },
    [trackInteraction]
  );

  return {
    // Metrics
    metrics,
    componentData,
    
    // Manual tracking functions
    trackRenderStart,
    trackRenderEnd,
    trackInteraction,
    
    // Event handlers
    onClick: createInteractionHandler('click'),
    onFocus: createInteractionHandler('focus'),
    onBlur: createInteractionHandler('blur'),
    onScroll: createInteractionHandler('scroll'),
    
    // Status
    isTracking: enabled,
  };
}

// Simple HOC for performance tracking
export function withPerformanceMonitoring<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string,
  options?: UsePerformanceOptions
): React.ComponentType<P> {
  const displayName = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Anonymous';
  
  const ComponentWithPerformance: React.FC<P> = (props) => {
    usePerformance(displayName, options);
    return React.createElement(WrappedComponent, props);
  };

  ComponentWithPerformance.displayName = `withPerformanceMonitoring(${displayName})`;
  
  return ComponentWithPerformance;
}

export default usePerformance;