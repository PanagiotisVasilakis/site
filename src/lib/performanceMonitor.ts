/**
 * Enterprise-grade Performance Monitoring System
 * Tracks Core Web Vitals, custom metrics, and provides real-time performance insights
 */

import { onCLS, onFID, onFCP, onLCP, onTTFB, type Metric } from 'web-vitals';

interface PerformanceMetric {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
  id?: string;
  navigationType?: string;
  url: string;
  userAgent: string;
  connection?: {
    effectiveType?: string;
    downlink?: number;
    rtt?: number;
  };
}

interface PerformanceThresholds {
  [key: string]: {
    good: number;
    poor: number;
  };
}

interface CustomMetric {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private customMetrics: CustomMetric[] = [];
  private reportingEndpoint = '/api/performance';
  private batchSize = 10;
  private flushInterval = 30000; // 30 seconds
  private minFlushSpacing = 5000; // at least 5s between flushes to avoid bursts
  private flushTimer?: NodeJS.Timeout;
  private isEnabled = true;
  private sessionId: string;
  private lastFlushAt = 0;
  private backoffUntil = 0; // epoch ms until which we shouldn't send
  private backoffBaseMs = 15000; // base backoff when Retry-After missing
  private maxCustomMetrics = 200; // cap queue to avoid memory growth
  private immediateCooldownMs = 3000; // don't send immediate reports more often than this
  private lastImmediateAt = 0;
  private lastImmediateByName = new Map<string, number>(); // cooldown per metric name
  private recentMetricIds = new Map<string, number>(); // metric id -> expiry epoch ms
  private recentIdWindowMs = 60000; // dedupe same metric id for 60s
  // Circuit breaker
  private disabledUntil = 0; // hard disable sending until timestamp
  private consecutive429 = 0;
  private last429At = 0;
  private circuitWindowMs = 2000; // lookback window for consecutive 429s
  private circuitDisableMs = 120000; // disable for 2 minutes when tripped
  private sendingEnabled = true; // allow sending metrics over network

  // Core Web Vitals thresholds
  private thresholds: PerformanceThresholds = {
    CLS: { good: 0.1, poor: 0.25 },
    FID: { good: 100, poor: 300 },
    FCP: { good: 1800, poor: 3000 },
    LCP: { good: 2500, poor: 4000 },
    TTFB: { good: 800, poor: 1800 },
  };

  constructor() {
    this.sessionId = this.generateSessionId();
    // Disable network sending in non-production unless explicitly enabled
    const envEnabled = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_ENABLE_PERF_TELEMETRY === 'true' : false;
    const isProd = typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : false;
    this.sendingEnabled = isProd || envEnabled;
    this.setupCoreWebVitals();
    this.setupCustomMetrics();
    this.setupNavigationObserver();
    this.setupResourceObserver();
    this.startPeriodicFlush();
  }

  private generateSessionId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupCoreWebVitals(): void {
    if (typeof window === 'undefined') return;

    // Cumulative Layout Shift
    onCLS(this.handleMetric.bind(this));
    
    // First Input Delay
    onFID(this.handleMetric.bind(this));
    
    // First Contentful Paint
    onFCP(this.handleMetric.bind(this));
    
    // Largest Contentful Paint
    onLCP(this.handleMetric.bind(this));
    
    // Time to First Byte
    onTTFB(this.handleMetric.bind(this));
  }

  private handleMetric(metric: Metric): void {
    if (!this.isEnabled) return;

    const rating = this.getRating(metric.name, metric.value);
    const connection = this.getConnectionInfo();

    const performanceMetric: PerformanceMetric = {
      name: metric.name,
      value: metric.value,
      rating,
      timestamp: Date.now(),
      id: metric.id,
      navigationType: metric.navigationType,
      url: window.location.href,
      userAgent: navigator.userAgent,
      connection,
    };

    this.metrics.set(metric.name, performanceMetric);
    
    // Log critical performance issues immediately
    if (rating === 'poor') {
      console.warn(`Poor ${metric.name} performance:`, metric.value);
      this.reportImmediately(performanceMetric);
    }
  }

  private getRating(metricName: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const threshold = this.thresholds[metricName];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  }

  private getConnectionInfo() {
    type NetworkInformation = {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
    };
    const nav = navigator as unknown as { connection?: NetworkInformation; mozConnection?: NetworkInformation; webkitConnection?: NetworkInformation };
    const connection = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (!connection) return undefined;

    return {
      effectiveType: connection.effectiveType,
      downlink: connection.downlink,
      rtt: connection.rtt,
    };
  }

  private setupCustomMetrics(): void {
    if (typeof window === 'undefined') return;

    // Track page load time
    window.addEventListener('load', () => {
      const loadTime = performance.now();
      this.trackCustomMetric('page-load-time', loadTime, {
        entryType: 'navigation',
      });
    });

    // Track Time to Interactive (TTI) approximation
    this.trackTimeToInteractive();

    // Track JavaScript errors that might impact performance
    window.addEventListener('error', (event) => {
      this.trackCustomMetric('js-error-count', 1, {
        filename: event.filename,
        lineno: event.lineno,
        message: event.message,
      });
    });

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', () => {
      this.trackCustomMetric('unhandled-rejection-count', 1);
    });
  }

  private trackTimeToInteractive(): void {
    // Simple TTI approximation - when main thread is quiet for 5 seconds
    let lastActivityTime = performance.now();
    let ttiReported = false;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.duration > 50) { // Long task
          lastActivityTime = entry.startTime + entry.duration;
        }
      }
    });

    observer.observe({ entryTypes: ['longtask'] });

    const checkTTI = () => {
      if (ttiReported) return;
      
      const now = performance.now();
      if (now - lastActivityTime >= 5000) { // 5 seconds of quiet
        this.trackCustomMetric('time-to-interactive', now, {
          method: 'longtask-approximation',
        });
        ttiReported = true;
        observer.disconnect();
      } else {
        setTimeout(checkTTI, 1000);
      }
    };

    setTimeout(checkTTI, 1000);
  }

  private setupNavigationObserver(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType === 'navigation') {
          const navEntry = entry as PerformanceNavigationTiming;
          
          // Track detailed navigation timing
          this.trackCustomMetric('dns-lookup-time', navEntry.domainLookupEnd - navEntry.domainLookupStart);
          this.trackCustomMetric('tcp-connect-time', navEntry.connectEnd - navEntry.connectStart);
          this.trackCustomMetric('ssl-time', navEntry.connectEnd - navEntry.secureConnectionStart);
          this.trackCustomMetric('server-response-time', navEntry.responseStart - navEntry.requestStart);
          this.trackCustomMetric('dom-parse-time', navEntry.domComplete - navEntry.domInteractive);
          this.trackCustomMetric('dom-content-loaded', navEntry.domContentLoadedEventEnd - navEntry.domContentLoadedEventStart);
          this.trackCustomMetric('load-event-time', navEntry.loadEventEnd - navEntry.loadEventStart);
        }
      }
    });

    observer.observe({ entryTypes: ['navigation'] });
  }

  private setupResourceObserver(): void {
    if (typeof window === 'undefined' || !('PerformanceObserver' in window)) return;

    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.entryType === 'resource') {
          const resourceEntry = entry as PerformanceResourceTiming;
          
          // Track slow resources
          if (resourceEntry.duration > 1000) { // Slow resource (>1s)
            this.trackCustomMetric('slow-resource', resourceEntry.duration, {
              name: resourceEntry.name,
              initiatorType: resourceEntry.initiatorType,
              transferSize: resourceEntry.transferSize,
            });
          }

          // Track large resources
          if (resourceEntry.transferSize > 1024 * 1024) { // Large resource (>1MB)
            this.trackCustomMetric('large-resource', resourceEntry.transferSize, {
              name: resourceEntry.name,
              initiatorType: resourceEntry.initiatorType,
              duration: resourceEntry.duration,
            });
          }
        }
      }
    });

    observer.observe({ entryTypes: ['resource'] });
  }

  private startPeriodicFlush(): void {
    if (typeof window === 'undefined') return;

    this.flushTimer = setInterval(() => {
      this.flushMetrics();
    }, this.flushInterval);

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flushMetrics(true);
    });

    // Flush on visibility change (tab switching)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushMetrics(true);
      }
    });
  }

  public trackCustomMetric(name: string, value: number, metadata?: Record<string, unknown>): void {
    if (!this.isEnabled) return;

    const metric: CustomMetric = {
      name,
      value,
      timestamp: Date.now(),
      metadata,
    };

    this.customMetrics.push(metric);
    // Cap queue size to avoid unbounded growth
    if (this.customMetrics.length > this.maxCustomMetrics) {
      this.customMetrics.splice(0, this.customMetrics.length - this.maxCustomMetrics);
    }

    // Flush if we have too many metrics
    if (this.customMetrics.length >= this.batchSize) {
      this.flushMetrics();
    }
  }

  public trackUserTiming(name: string, startTime?: number): void {
    if (typeof window === 'undefined') return;

    const mark = `${name}-start`;
    const measure = `${name}-duration`;

    if (startTime !== undefined) {
      // End timing
      performance.mark(`${name}-end`);
      performance.measure(measure, mark, `${name}-end`);
      
      const entry = performance.getEntriesByName(measure)[0];
      if (entry) {
        this.trackCustomMetric(name, entry.duration, {
          type: 'user-timing',
          startTime: startTime,
        });
      }
    } else {
      // Start timing
      performance.mark(mark);
    }
  }

  public trackPageView(path: string, metadata?: Record<string, unknown>): void {
    this.trackCustomMetric('page-view', 1, {
      path,
      timestamp: Date.now(),
      referrer: document.referrer,
      ...metadata,
    });
  }

  public trackAPICall(endpoint: string, duration: number, status: number, size?: number): void {
    this.trackCustomMetric('api-call', duration, {
      endpoint,
      status,
      size,
      rating: duration > 1000 ? 'slow' : duration > 500 ? 'medium' : 'fast',
    });
  }

  public trackInteraction(element: string, action: string, duration?: number): void {
    this.trackCustomMetric('user-interaction', duration || 1, {
      element,
      action,
      timestamp: Date.now(),
    });
  }

  private async reportImmediately(metric: PerformanceMetric): Promise<void> {
    // Respect backoff window
    const nowGlobal = Date.now();
    if (!this.sendingEnabled || nowGlobal < this.backoffUntil || nowGlobal < this.disabledUntil) return;
    // Drop duplicates by metric id within window
    if (metric.id) {
      const exp = this.recentMetricIds.get(metric.id);
      const now = Date.now();
      if (exp && exp > now) {
        return;
      }
      // prune old ids occasionally
      if (this.recentMetricIds.size > 500) {
        for (const [id, ts] of this.recentMetricIds) {
          if (ts <= now) this.recentMetricIds.delete(id);
        }
      }
      this.recentMetricIds.set(metric.id, now + this.recentIdWindowMs);
    }
    // Cooldown globally and per metric name
    const nowTs = Date.now();
    if (nowTs - this.lastImmediateAt < this.immediateCooldownMs) return;
    const lastByName = this.lastImmediateByName.get(metric.name);
    if (lastByName && nowTs - lastByName < this.immediateCooldownMs) return;
    this.lastImmediateAt = nowTs;
    this.lastImmediateByName.set(metric.name, nowTs);
    try {
      const res = await fetch(this.reportingEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'core-web-vital',
          sessionId: this.sessionId,
          metric,
        }),
      });
      if (!res.ok) {
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
          const waitMs = isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoffBaseMs;
          this.backoffUntil = Date.now() + waitMs;
          // circuit breaker bookkeeping
          const now = Date.now();
          if (now - this.last429At <= this.circuitWindowMs) {
            this.consecutive429 += 1;
          } else {
            this.consecutive429 = 1;
          }
          this.last429At = now;
          if (this.consecutive429 >= 3) {
            this.disabledUntil = now + this.circuitDisableMs;
          }
        }
      }
    } catch (error) {
      console.warn('Failed to report performance metric:', error);
    }
  }

  private async flushMetrics(useBeacon = false): Promise<void> {
    if (this.customMetrics.length === 0 && this.metrics.size === 0) return;
    // Respect backoff and spacing
    const now = Date.now();
    if (!this.sendingEnabled || now < this.backoffUntil || now < this.disabledUntil) return;
    if (now - this.lastFlushAt < this.minFlushSpacing) return;

    const payload = {
      sessionId: this.sessionId,
      timestamp: Date.now(),
      url: window.location.href,
      coreWebVitals: Array.from(this.metrics.values()),
      customMetrics: [...this.customMetrics],
    };

    try {
      if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        const ok = navigator.sendBeacon(this.reportingEndpoint, JSON.stringify(payload));
        if (ok) {
          this.lastFlushAt = now;
          // Clear sent metrics and vitals to avoid resending
          this.customMetrics = [];
          this.metrics.clear();
          return;
        }
        // Fallback to fetch if beacon failed
      }

      const res = await fetch(this.reportingEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      this.lastFlushAt = now;
      if (res.ok) {
        // Clear sent metrics and vitals to avoid resending the same CWV repeatedly
        this.customMetrics = [];
        this.metrics.clear();
      } else if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('Retry-After') || '0', 10);
        const waitMs = isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoffBaseMs;
        this.backoffUntil = Date.now() + waitMs;
        // circuit breaker bookkeeping
        const now2 = Date.now();
        if (now2 - this.last429At <= this.circuitWindowMs) {
          this.consecutive429 += 1;
        } else {
          this.consecutive429 = 1;
        }
        this.last429At = now2;
        if (this.consecutive429 >= 3) {
          this.disabledUntil = now2 + this.circuitDisableMs;
        }
      }
    } catch (error) {
      console.warn('Failed to flush performance metrics:', error);
    }
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  public getMetrics(): {
    coreWebVitals: PerformanceMetric[];
    customMetrics: CustomMetric[];
  } {
    return {
      coreWebVitals: Array.from(this.metrics.values()),
      customMetrics: [...this.customMetrics],
    };
  }

  public getPerformanceScore(): number {
    const metrics = Array.from(this.metrics.values());
    if (metrics.length === 0) return 100;

    const scores = metrics.map(metric => {
      switch (metric.rating) {
        case 'good': return 100;
        case 'needs-improvement': return 50;
        case 'poor': return 0;
        default: return 100;
      }
    });

    return Math.round(scores.reduce((sum: number, score: number) => sum + score, 0) / scores.length);
  }

  public destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flushMetrics();
  }
}

// Create global instance
export const performanceMonitor = new PerformanceMonitor();

// React hooks for performance monitoring
export function usePerformanceMonitoring() {
  return {
    trackCustomMetric: performanceMonitor.trackCustomMetric.bind(performanceMonitor),
    trackUserTiming: performanceMonitor.trackUserTiming.bind(performanceMonitor),
    trackPageView: performanceMonitor.trackPageView.bind(performanceMonitor),
    trackAPICall: performanceMonitor.trackAPICall.bind(performanceMonitor),
    trackInteraction: performanceMonitor.trackInteraction.bind(performanceMonitor),
    getMetrics: performanceMonitor.getMetrics.bind(performanceMonitor),
    getPerformanceScore: performanceMonitor.getPerformanceScore.bind(performanceMonitor),
  };
}

// Convenience exports
export const trackCustomMetric = performanceMonitor.trackCustomMetric.bind(performanceMonitor);
export const trackUserTiming = performanceMonitor.trackUserTiming.bind(performanceMonitor);
export const trackPageView = performanceMonitor.trackPageView.bind(performanceMonitor);
export const trackAPICall = performanceMonitor.trackAPICall.bind(performanceMonitor);
export const trackInteraction = performanceMonitor.trackInteraction.bind(performanceMonitor);

// Types
export type { PerformanceMetric, CustomMetric, PerformanceThresholds };