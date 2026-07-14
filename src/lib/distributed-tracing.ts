/**
 * Distributed Tracing & APM System
 * Provides request correlation, performance tracking, and bottleneck identification
 */

import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import crypto from 'node:crypto';
import { formatTraceContextHeaders, parseTraceContextHeaders, SpanStatus } from '@/lib/observability-contracts';
import type { Span, SpanLogLevel, TraceContext } from '@/lib/observability-contracts';

export { SpanStatus } from '@/lib/observability-contracts';
export type { Span, TraceContext } from '@/lib/observability-contracts';

// Tracer class for distributed tracing
class DistributedTracer {
  private spans: Map<string, Span> = new Map();
  private activeSpans: Map<string, string> = new Map(); // context -> spanId
  private maxSpans: number = 10000;
  private retentionPeriod: number = 60 * 60 * 1000; // 1 hour
  private isEnabled: boolean = true;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: { maxSpans?: number; retentionPeriod?: number }) {
    if (config) {
      this.maxSpans = config.maxSpans ?? this.maxSpans;
      this.retentionPeriod = config.retentionPeriod ?? this.retentionPeriod;
    }

    this.start();
  }

  public start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(), this.retentionPeriod / 10);
    this.cleanupTimer.unref?.();
  }

  public stop(): void {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  // Generate trace/span IDs
  private generateTraceId(): string {
    // W3C trace-id: 16 bytes (32 hex chars)
    return crypto.randomBytes(16).toString('hex');
  }

  private generateSpanId(): string {
    // W3C span-id: 8 bytes (16 hex chars)
    return crypto.randomBytes(8).toString('hex');
  }

  // Extract trace context from headers
  public extractTraceContext(headers: Record<string, string>): TraceContext | null {
    return parseTraceContextHeaders(headers);
  }

  // Inject trace context into headers
  public injectTraceContext(context: TraceContext): Record<string, string> {
    return formatTraceContextHeaders(context);
  }

  // Start a new span
  public startSpan(
    operationName: string,
    parentContext?: TraceContext,
    tags: Record<string, unknown> = {}
  ): Span {
    if (!this.isEnabled) {
      return this.createDummySpan(operationName);
    }

    const traceId = parentContext?.traceId || this.generateTraceId();
    const spanId = this.generateSpanId();
    const parentSpanId = parentContext?.spanId;

    const componentFromTags = typeof (tags as Record<string, unknown>).component === 'string'
      ? (tags as Record<string, unknown>).component as string
      : undefined;

    const span: Span = {
      traceId,
      spanId,
      parentSpanId,
      operationName,
      startTime: Date.now(),
      tags: {
        component: 'next-app',
        ...tags,
      },
      logs: [],
      status: SpanStatus.OK,
      component: componentFromTags ?? 'unknown',
    };

    this.spans.set(spanId, span);

    // Limit spans
    if (this.spans.size > this.maxSpans) {
      const oldestSpanId = Array.from(this.spans.keys())[0];
      this.spans.delete(oldestSpanId);
    }

    // Track span creation
    metrics.counter('tracing.spans_created', 1, {
      operation: operationName,
      component: span.component,
    });

    return span;
  }

  // Finish a span
  public finishSpan(span: Span, status: SpanStatus = SpanStatus.OK): void {
    if (!this.isEnabled) return;

    try {
      const endTime = Date.now();
      span.endTime = endTime;
      span.duration = endTime - span.startTime;
      span.status = status;

      // Update span in storage
      this.spans.set(span.spanId, span);

      // Track span completion - graceful degradation if metrics fail
      try {
        metrics.timer('tracing.span_duration', span.duration, {
          operation: span.operationName,
          component: span.component,
          status,
        });
      } catch (metricsError) {
        // Silently fail - don't let metrics errors break the app
        if (process.env.NODE_ENV === 'development') {
          console.error('[Tracing] Metrics error in finishSpan:', metricsError);
        }
      }

      // Log slow operations
      if (span.duration > 1000) {
        this.addLog(span, 'warn', 'Slow operation detected', {
          duration: span.duration,
          threshold: 1000,
        });
      }

      // Track errors
      if (status === SpanStatus.ERROR) {
        try {
          metrics.counter('tracing.span_errors', 1, {
            operation: span.operationName,
            component: span.component,
          });
        } catch (metricsError) {
          // Silently fail - don't let metrics errors break the app
          if (process.env.NODE_ENV === 'development') {
            console.error('[Tracing] Metrics error in finishSpan (error tracking):', metricsError);
          }
        }
      }
    } catch (error) {
      // Graceful degradation - don't let tracing failures break the application
      if (process.env.NODE_ENV === 'development') {
        console.error('[Tracing] Failed to finish span:', error);
      }
    }

    logger.debug('Span finished', {
      traceId: span.traceId,
      spanId: span.spanId,
      operation: span.operationName,
      duration: span.duration,
      status,
    });
  }

  // Add log to span
  public addLog(
    span: Span,
    level: SpanLogLevel,
    message: string,
    fields?: Record<string, unknown>
  ): void {
    if (!this.isEnabled) return;

    span.logs.push({
      timestamp: Date.now(),
      level,
      message,
      fields,
    });
  }

  // Add tags to span
  public addTags(span: Span, tags: Record<string, unknown>): void {
    if (!this.isEnabled) return;

    Object.assign(span.tags, tags);
    this.spans.set(span.spanId, span);
  }

  // Get span by ID
  public getSpan(spanId: string): Span | undefined {
    return this.spans.get(spanId);
  }

  // Get trace (all spans with same traceId)
  public getTrace(traceId: string): Span[] {
    return Array.from(this.spans.values())
      .filter(span => span.traceId === traceId)
      .sort((a, b) => a.startTime - b.startTime);
  }

  // Get recent traces
  public getRecentTraces(limit: number = 100): Span[][] {
    const traceGroups = new Map<string, Span[]>();
    
    // Group spans by trace ID
    for (const span of this.spans.values()) {
      const traces = traceGroups.get(span.traceId) || [];
      traces.push(span);
      traceGroups.set(span.traceId, traces);
    }

    // Sort traces by most recent start time
    return Array.from(traceGroups.values())
      .map(spans => spans.sort((a, b) => a.startTime - b.startTime))
      .sort((a, b) => Math.max(...b.map(s => s.startTime)) - Math.max(...a.map(s => s.startTime)))
      .slice(0, limit);
  }

  // Analyze trace performance
  public analyzeTrace(traceId: string): TraceAnalysis {
    const spans = this.getTrace(traceId);
    
    if (spans.length === 0) {
      return {
        traceId,
        totalDuration: 0,
        spanCount: 0,
        errorCount: 0,
        bottlenecks: [],
        criticalPath: [],
      };
    }

    const totalDuration = Math.max(...spans.map(s => (s.endTime || Date.now()) - s.startTime));
    const errorCount = spans.filter(s => s.status === SpanStatus.ERROR).length;
    
    // Find bottlenecks (spans taking >20% of total time)
    const bottlenecks = spans
      .filter(s => s.duration && s.duration > totalDuration * 0.2)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));

    // Build critical path (longest sequential chain)
    const criticalPath = this.buildCriticalPath(spans);

    return {
      traceId,
      totalDuration,
      spanCount: spans.length,
      errorCount,
      bottlenecks,
      criticalPath,
    };
  }

  // Clean up old spans
  private cleanup(): void {
    const cutoff = Date.now() - this.retentionPeriod;
    const toDelete: string[] = [];

    for (const [spanId, span] of this.spans.entries()) {
      if (span.startTime < cutoff) {
        toDelete.push(spanId);
      }
    }

    toDelete.forEach(spanId => this.spans.delete(spanId));

    if (toDelete.length > 0) {
      logger.debug('Cleaned up old spans', { count: toDelete.length });
    }
  }

  // Build critical path for trace analysis
  private buildCriticalPath(spans: Span[]): Span[] {
    // Simple implementation: find the longest sequential path
    const roots = spans.filter(s => !s.parentSpanId);
    let longestPath: Span[] = [];

    for (const root of roots) {
      const path = this.findLongestPath(root, spans);
      if (path.reduce((sum, s) => sum + (s.duration || 0), 0) > 
          longestPath.reduce((sum, s) => sum + (s.duration || 0), 0)) {
        longestPath = path;
      }
    }

    return longestPath;
  }

  private findLongestPath(span: Span, allSpans: Span[]): Span[] {
    const children = allSpans.filter(s => s.parentSpanId === span.spanId);
    
    if (children.length === 0) {
      return [span];
    }

    let longestChildPath: Span[] = [];
    for (const child of children) {
      const childPath = this.findLongestPath(child, allSpans);
      if (childPath.reduce((sum, s) => sum + (s.duration || 0), 0) >
          longestChildPath.reduce((sum, s) => sum + (s.duration || 0), 0)) {
        longestChildPath = childPath;
      }
    }

    return [span, ...longestChildPath];
  }

  private createDummySpan(operationName: string): Span {
    return {
      traceId: 'disabled',
      spanId: 'disabled',
      operationName,
      startTime: Date.now(),
      tags: {},
      logs: [],
      status: SpanStatus.OK,
      component: 'disabled',
    };
  }

  // Control methods
  public enable(): void {
    this.isEnabled = true;
  }

  public disable(): void {
    this.isEnabled = false;
  }

  public clear(): void {
    this.spans.clear();
  }
}

// Trace analysis interface
interface TraceAnalysis {
  traceId: string;
  totalDuration: number;
  spanCount: number;
  errorCount: number;
  bottlenecks: Span[];
  criticalPath: Span[];
}

// Global tracer instance
export const tracer = new DistributedTracer({
  maxSpans: 10000,
  retentionPeriod: 60 * 60 * 1000, // 1 hour
});
