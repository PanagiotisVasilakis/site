/**
 * Enterprise Metrics Collection System
 * Comprehensive monitoring for application performance, business metrics, and system health
 */

import { logger } from '@/lib/logger-enterprise';
import type { MetricSink } from '@/lib/observability-contracts';

// Core metric types
interface BaseMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  type: MetricType;
}

interface CounterMetric extends BaseMetric {
  type: 'counter';
  delta?: number;
}

interface GaugeMetric extends BaseMetric {
  type: 'gauge';
}

interface HistogramMetric extends BaseMetric {
  type: 'histogram';
  buckets?: number[];
  samples?: number[];
}

interface TimerMetric extends BaseMetric {
  type: 'timer';
  duration: number;
  startTime: number;
  endTime: number;
}

type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';
type Metric = CounterMetric | GaugeMetric | HistogramMetric | TimerMetric;

// Metric aggregation interfaces
interface MetricAggregation {
  name: string;
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  timestamp: number;
  tags: Record<string, string>;
}

interface BusinessMetric {
  event: string;
  value?: number;
  properties?: Record<string, unknown>;
  timestamp: number;
}

// Application performance metrics
interface ApplicationMetrics {
  requests: {
    total: number;
    rate: number;
    errorRate: number;
    averageResponseTime: number;
    p90ResponseTime: number;
    p95ResponseTime: number;
  };
  endpoints: Record<string, {
    hits: number;
    averageTime: number;
    errorRate: number;
    lastAccess: number;
  }>;
  errors: {
    total: number;
    rate: number;
    byType: Record<string, number>;
    recent: Array<{
      message: string;
      stack?: string;
      timestamp: number;
      frequency: number;
    }>;
  };
  webVitals: {
    lcp: number;
    fid: number;
    cls: number;
    inp: number;
    ttfb: number;
    score: number;
  };
  timestamp: number;
}

class MetricsCollector implements MetricSink {
  private metrics: Map<string, Metric[]> = new Map();
  private businessMetrics: BusinessMetric[] = [];
  private aggregations: Map<string, MetricAggregation> = new Map();
  private isEnabled: boolean = true;
  private maxMetricsPerType: number = 10000;
  private retentionPeriod: number = 24 * 60 * 60 * 1000; // 24 hours
  private aggregationInterval: number = 60 * 1000; // 1 minute
  private lastAggregation: number = Date.now();
  private aggregationTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  // Simple in-process alerts
  private alerts: {
    verificationFailed: { windowMs: number; threshold: number; recent: number[] };
  } = {
    verificationFailed: { windowMs: 60_000, threshold: 20, recent: [] },
  };

  constructor(config?: {
    maxMetricsPerType?: number;
    retentionPeriod?: number;
    aggregationInterval?: number;
  }) {
    if (config) {
      this.maxMetricsPerType = config.maxMetricsPerType ?? this.maxMetricsPerType;
      this.retentionPeriod = config.retentionPeriod ?? this.retentionPeriod;
      this.aggregationInterval = config.aggregationInterval ?? this.aggregationInterval;
    }

    this.start();
  }

  public start(): void {
    if (!this.aggregationTimer) {
      this.startAggregation();
    }

    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => this.cleanup(), this.retentionPeriod / 10);
      this.cleanupTimer.unref?.();
    }
  }

  public stop(): void {
    if (this.aggregationTimer) {
      clearInterval(this.aggregationTimer);
      this.aggregationTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // Core metric collection methods
  public counter(name: string, value: number = 1, tags?: Record<string, string>): void {
    if (!this.isEnabled) return;

    const metric: CounterMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
      type: 'counter',
    };

    this.addMetric(metric);

    // Alert hooks
    if (name === 'verification_failed') {
      this.recordVerificationFailed();
    }
  }

  public gauge(name: string, value: number, tags?: Record<string, string>): void {
    if (!this.isEnabled) return;

    const metric: GaugeMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
      type: 'gauge',
    };

    this.addMetric(metric);
  }

  // Runtime controls used by the development verification endpoint.
  public setVerificationFailedAlertConfig(config: { windowMs?: number; threshold?: number }): void {
    if (typeof config.windowMs === 'number' && config.windowMs > 0) {
      this.alerts.verificationFailed.windowMs = config.windowMs;
    }
    if (typeof config.threshold === 'number' && config.threshold > 0) {
      this.alerts.verificationFailed.threshold = config.threshold;
    }
  }

  public getVerificationFailedAlertConfig(): { windowMs: number; threshold: number } {
    return {
      windowMs: this.alerts.verificationFailed.windowMs,
      threshold: this.alerts.verificationFailed.threshold,
    };
  }

  // Simple alerting for verification failures per minute
  private recordVerificationFailed(): void {
    const bucket = this.alerts.verificationFailed;
    const now = Date.now();
    bucket.recent.push(now);
    // Evict outside window
    const cutoff = now - bucket.windowMs;
    bucket.recent = bucket.recent.filter(t => t >= cutoff);
    if (bucket.recent.length >= bucket.threshold) {
      logger.warn('ALERT: verification_failed spike', { count: bucket.recent.length, windowMs: bucket.windowMs });
      // Emit an alert metric for dashboards/automation
      this.counter('alert.verification_failed.spike', 1, {
        windowMs: String(bucket.windowMs),
        count: String(bucket.recent.length),
      });
    }
  }

  public histogram(name: string, value: number, tags?: Record<string, string>): void {
    if (!this.isEnabled) return;

    const metric: HistogramMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
      type: 'histogram',
    };

    this.addMetric(metric);
  }

  public timer(name: string, duration: number, tags?: Record<string, string>): void {
    if (!this.isEnabled) return;

    const now = Date.now();
    const metric: TimerMetric = {
      name,
      value: duration,
      timestamp: now,
      tags,
      type: 'timer',
      duration,
      startTime: now - duration,
      endTime: now,
    };

    this.addMetric(metric);
  }

  // Business metrics tracking
  public trackEvent(event: string, properties?: Record<string, unknown>, value?: number): void {
    if (!this.isEnabled) return;

    const businessMetric: BusinessMetric = {
      event,
      value,
      properties,
      timestamp: Date.now(),
    };

    this.businessMetrics.push(businessMetric);
    
    // Limit business metrics size
    if (this.businessMetrics.length > this.maxMetricsPerType) {
      this.businessMetrics.splice(0, this.businessMetrics.length - this.maxMetricsPerType);
    }
  }

  // High-level performance tracking
  public trackPageLoad(path: string, loadTime: number, navigationTiming?: PerformanceNavigationTiming): void {
    this.timer('page.load_time', loadTime, { path });
    this.counter('page.views', 1, { path });

    if (navigationTiming) {
      this.gauge('page.dns_time', navigationTiming.domainLookupEnd - navigationTiming.domainLookupStart, { path });
      this.gauge('page.connect_time', navigationTiming.connectEnd - navigationTiming.connectStart, { path });
      this.gauge('page.ttfb', navigationTiming.responseStart - navigationTiming.requestStart, { path });
      this.gauge('page.dom_load', navigationTiming.domContentLoadedEventEnd - navigationTiming.domContentLoadedEventStart, { path });
    }

    this.trackEvent('page_view', { path, loadTime });
  }

  public trackApiCall(endpoint: string, method: string, statusCode: number, responseTime: number): void {
    const tags = { endpoint, method, status: statusCode.toString() };
    
    this.timer('api.response_time', responseTime, tags);
    this.counter('api.requests', 1, tags);
    
    if (statusCode >= 400) {
      this.counter('api.errors', 1, tags);
    }

    this.trackEvent('api_call', { endpoint, method, statusCode, responseTime });
  }

  public trackUserAction(action: string, category: string, value?: number): void {
    this.counter('user.actions', 1, { action, category });
    this.trackEvent('user_action', { action, category, value });
  }

  public trackError(error: Error): void {
    this.counter('errors.total', 1, { type: error.name });
    this.trackEvent('error', {
      message: error.message
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
        .replace(/\+?[1-9][0-9 ()-]{7,20}/g, '[REDACTED_PHONE]')
        .slice(0, 500),
    });
  }

  // Web Vitals integration
  public trackWebVital(name: string, value: number, rating: string): void {
    this.gauge(`web_vitals.${name.toLowerCase()}`, value, { rating });
    this.trackEvent('web_vital', { name, value, rating });
  }

  // Application metrics aggregation
  public getApplicationMetrics(): ApplicationMetrics {
    const now = Date.now();
    const hourAgo = now - (60 * 60 * 1000);

    // Get recent metrics
    const recentMetrics = this.getMetricsSince(hourAgo);
    
    // Calculate request metrics
    const apiMetrics = recentMetrics.filter(m => m.name.startsWith('api.'));
    const requestMetrics = apiMetrics.filter(m => m.name === 'api.requests');
    const errorMetrics = apiMetrics.filter(m => m.name === 'api.errors');
    const responseTimeMetrics = apiMetrics.filter(m => m.name === 'api.response_time');

    const totalRequests = requestMetrics.reduce((sum, m) => sum + m.value, 0);
    const totalErrors = errorMetrics.reduce((sum, m) => sum + m.value, 0);
    const responseTimes = responseTimeMetrics.map(m => m.value);

    // Calculate endpoints stats
  const endpointStats: Record<string, { hits: number; totalTime: number; errors: number; lastAccess: number }> = {};
    apiMetrics.forEach(metric => {
      if (metric.tags?.endpoint) {
        const endpoint = metric.tags.endpoint;
        if (!endpointStats[endpoint]) {
          endpointStats[endpoint] = { hits: 0, totalTime: 0, errors: 0, lastAccess: 0 };
        }
        
        if (metric.name === 'api.requests') {
          endpointStats[endpoint].hits += metric.value;
          endpointStats[endpoint].lastAccess = Math.max(endpointStats[endpoint].lastAccess, metric.timestamp);
        }
        if (metric.name === 'api.response_time') {
          endpointStats[endpoint].totalTime += metric.value;
        }
        if (metric.name === 'api.errors') {
          endpointStats[endpoint].errors += metric.value;
        }
      }
    });

    // Process endpoint stats
    const endpoints: Record<string, { hits: number; averageTime: number; errorRate: number; lastAccess: number }> = {};
    Object.entries(endpointStats).forEach(([endpoint, stats]) => {
      endpoints[endpoint] = {
        hits: stats.hits,
        averageTime: stats.hits > 0 ? stats.totalTime / stats.hits : 0,
        errorRate: stats.hits > 0 ? (stats.errors / stats.hits) * 100 : 0,
        lastAccess: stats.lastAccess,
      };
    });

    // Get Web Vitals
    const webVitalMetrics = recentMetrics.filter(m => m.name.startsWith('web_vitals.'));
    const webVitals = {
      lcp: this.getLatestMetricValue(webVitalMetrics, 'web_vitals.lcp') || 0,
      fid: this.getLatestMetricValue(webVitalMetrics, 'web_vitals.fid') || 0,
      cls: this.getLatestMetricValue(webVitalMetrics, 'web_vitals.cls') || 0,
      inp: this.getLatestMetricValue(webVitalMetrics, 'web_vitals.inp') || 0,
      ttfb: this.getLatestMetricValue(webVitalMetrics, 'web_vitals.ttfb') || 0,
      score: this.calculateWebVitalsScore(webVitalMetrics),
    };

    return {
      requests: {
        total: totalRequests,
        rate: totalRequests / (60 * 60), // per second over last hour
        errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
        averageResponseTime: responseTimes.length > 0 ? 
          responseTimes.reduce((sum, t) => sum + t, 0) / responseTimes.length : 0,
        p90ResponseTime: this.percentile(responseTimes, 0.9),
        p95ResponseTime: this.percentile(responseTimes, 0.95),
      },
      endpoints,
      errors: {
        total: totalErrors,
        rate: totalErrors / (60 * 60), // per second over last hour
        byType: this.getErrorsByType(recentMetrics),
        recent: this.getRecentErrors(),
      },
      webVitals,
      timestamp: now,
    };
  }

  // Metric retrieval methods
  public getMetrics(name?: string, since?: number): Metric[] {
    const now = Date.now();
    const cutoff = since || (now - this.retentionPeriod);

    if (name) {
      const metrics = this.metrics.get(name) || [];
      return metrics.filter(m => m.timestamp >= cutoff);
    }

    const allMetrics: Metric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics.filter(m => m.timestamp >= cutoff));
    }

    return allMetrics.sort((a, b) => a.timestamp - b.timestamp);
  }

  public getBusinessMetrics(since?: number): BusinessMetric[] {
    const cutoff = since || (Date.now() - this.retentionPeriod);
    return this.businessMetrics.filter(m => m.timestamp >= cutoff);
  }

  public getAggregations(name?: string): MetricAggregation[] {
    if (name) {
      const aggregation = this.aggregations.get(name);
      return aggregation ? [aggregation] : [];
    }

    return Array.from(this.aggregations.values());
  }

  // Control methods
  public enable(): void {
    this.isEnabled = true;
  }

  public disable(): void {
    this.isEnabled = false;
  }

  public clear(): void {
    this.metrics.clear();
    this.businessMetrics.length = 0;
    this.aggregations.clear();
  }

  // Private helper methods
  private addMetric(metric: Metric): void {
    const metrics = this.metrics.get(metric.name) || [];
    metrics.push(metric);

    // Limit metrics size
    if (metrics.length > this.maxMetricsPerType) {
      metrics.splice(0, metrics.length - this.maxMetricsPerType);
    }

    this.metrics.set(metric.name, metrics);
  }

  private getMetricsSince(timestamp: number): Metric[] {
    const result: Metric[] = [];
    for (const metrics of this.metrics.values()) {
      result.push(...metrics.filter(m => m.timestamp >= timestamp));
    }
    return result;
  }

  private getLatestMetricValue(metrics: Metric[], name: string): number | null {
    const filtered = metrics.filter(m => m.name === name);
    if (filtered.length === 0) return null;
    
    const latest = filtered.reduce((latest, current) => 
      current.timestamp > latest.timestamp ? current : latest
    );
    
    return latest.value;
  }

  private calculateWebVitalsScore(webVitalMetrics: Metric[]): number {
    const weights = { lcp: 0.3, fid: 0.2, cls: 0.3, inp: 0.1, ttfb: 0.1 };
    let totalScore = 0;
    let totalWeight = 0;

    Object.entries(weights).forEach(([vital, weight]) => {
      const value = this.getLatestMetricValue(webVitalMetrics, `web_vitals.${vital}`);
      if (value !== null) {
        const score = this.getWebVitalScore(vital, value);
        totalScore += score * weight;
        totalWeight += weight;
      }
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  private getWebVitalScore(vital: string, value: number): number {
    const thresholds: Record<string, { good: number; poor: number }> = {
      lcp: { good: 2500, poor: 4000 },
      fid: { good: 100, poor: 300 },
      cls: { good: 0.1, poor: 0.25 },
      inp: { good: 200, poor: 500 },
      ttfb: { good: 800, poor: 1800 },
    };

    const threshold = thresholds[vital];
    if (!threshold) return 50;

    if (value <= threshold.good) return 100;
    if (value >= threshold.poor) return 0;
    
    // Linear interpolation between good and poor
    return 100 - ((value - threshold.good) / (threshold.poor - threshold.good)) * 100;
  }

  private getErrorsByType(metrics: Metric[]): Record<string, number> {
    const errorMetrics = metrics.filter(m => m.name === 'errors.total');
    const byType: Record<string, number> = {};
    
    errorMetrics.forEach(metric => {
      if (metric.tags?.type) {
        byType[metric.tags.type] = (byType[metric.tags.type] || 0) + metric.value;
      }
    });

    return byType;
  }

  private getRecentErrors(): Array<{ message: string; stack?: string; timestamp: number; frequency: number }> {
    const recentEvents = this.getBusinessMetrics(Date.now() - (60 * 60 * 1000)); // Last hour
    const errorEvents = recentEvents.filter(e => e.event === 'error');
    
    const errorMap = new Map<string, { message: string; stack?: string; timestamp: number; frequency: number }>();
    
    errorEvents.forEach(event => {
      const props = event.properties as Record<string, unknown> | undefined;
      const msgVal = props ? props['message'] : undefined;
      if (typeof msgVal === 'string') {
        const key = msgVal;
        const existing = errorMap.get(key);
        const stackVal = props ? props['stack'] : undefined;
        const stack = typeof stackVal === 'string' ? stackVal : undefined;

        if (existing) {
          existing.frequency++;
          existing.timestamp = Math.max(existing.timestamp, event.timestamp);
        } else {
          errorMap.set(key, {
            message: key,
            stack,
            timestamp: event.timestamp,
            frequency: 1,
          });
        }
      }
    });

    return Array.from(errorMap.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10);
  }

  private percentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    
    const sorted = [...values].sort((a, b) => a - b);
    const index = (p * (sorted.length - 1));
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    
    if (lower === upper) return sorted[lower];
    
    const weight = index - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  private startAggregation(): void {
    this.aggregationTimer = setInterval(() => {
      this.aggregateMetrics();
    }, this.aggregationInterval);
    this.aggregationTimer.unref?.();
  }

  private aggregateMetrics(): void {
    const now = Date.now();
    const since = this.lastAggregation;
    
    const metricsToAggregate = this.getMetricsSince(since);
    const byName = new Map<string, Metric[]>();
    
    metricsToAggregate.forEach(metric => {
      const existing = byName.get(metric.name) || [];
      existing.push(metric);
      byName.set(metric.name, existing);
    });

    byName.forEach((metrics, name) => {
      if (metrics.length === 0) return;

      const values = metrics.map(m => m.value);
      const tags = metrics[0].tags || {};
      
      const aggregation: MetricAggregation = {
        name,
        count: metrics.length,
        sum: values.reduce((sum, v) => sum + v, 0),
        avg: values.reduce((sum, v) => sum + v, 0) / values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        p50: this.percentile(values, 0.5),
        p90: this.percentile(values, 0.9),
        p95: this.percentile(values, 0.95),
        p99: this.percentile(values, 0.99),
        timestamp: now,
        tags,
      };

      this.aggregations.set(name, aggregation);
    });

    this.lastAggregation = now;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.retentionPeriod;
    
    // Clean up metrics
    for (const [name, metrics] of this.metrics.entries()) {
      const filtered = metrics.filter(m => m.timestamp >= cutoff);
      if (filtered.length === 0) {
        this.metrics.delete(name);
      } else {
        this.metrics.set(name, filtered);
      }
    }

    // Clean up business metrics
    this.businessMetrics = this.businessMetrics.filter(m => m.timestamp >= cutoff);

    // Clean up old aggregations
    for (const [name, aggregation] of this.aggregations.entries()) {
      if (aggregation.timestamp < cutoff) {
        this.aggregations.delete(name);
      }
    }
  }

}

// Global metrics instance
export const metrics = new MetricsCollector({
  maxMetricsPerType: 10000,
  retentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
  aggregationInterval: 60 * 1000, // 1 minute
});
