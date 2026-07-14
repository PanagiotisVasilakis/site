/**
 * Metrics Collection API Endpoint
 * Provides access to collected metrics data for dashboard visualization
 */

import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode, validateRequestBody } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { tracer, SpanStatus } from '@/lib/distributed-tracing';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

interface MetricsQuery {
  metric?: string;
  timeRange?: number; // milliseconds
  aggregation?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  tags?: Record<string, string>;
}

interface MetricsResponse {
  timestamp: number;
  timeRange: number;
  metrics: Array<{
    name: string;
    type: 'counter' | 'gauge' | 'histogram' | 'timer';
    values: Array<{
      timestamp: number;
      value: number;
      tags?: Record<string, string>;
    }>;
    aggregatedValue?: number;
    summary?: {
      count: number;
      sum: number;
      avg: number;
      min: number;
      max: number;
    };
  }>;
  systemMetrics: {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    healthStatus: 'healthy' | 'degraded' | 'unhealthy';
  };
}

type Aggregation = NonNullable<MetricsQuery['aggregation']>;
interface MetricRecord {
  name: string;
  timestamp: number;
  value: number;
  tags?: Record<string, string>;
}

function parseCsvEnv(envName: string): string[] {
  return (process.env[envName] || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function extractApiKey(request: NextRequest): string | undefined {
  const apiKey = request.headers.get('x-api-key')?.trim();
  if (apiKey) return apiKey;

  const authHeader = request.headers.get('authorization')?.trim();
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    return token || undefined;
  }

  return undefined;
}

function matchesConfiguredKey(key: string, candidates: readonly string[]): boolean {
  const supplied = Buffer.from(key);
  return candidates.some((candidate) => {
    const expected = Buffer.from(candidate);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  });
}

function hasReadApiKeyAccess(request: NextRequest): boolean {
  const key = extractApiKey(request);
  if (!key) return false;
  const readKeys = parseCsvEnv('VALID_API_KEYS');
  const writeKeys = parseCsvEnv('METRICS_WRITE_API_KEYS');
  return matchesConfiguredKey(key, [...readKeys, ...writeKeys]);
}

function hasWriteApiKeyAccess(request: NextRequest): boolean {
  const key = extractApiKey(request);
  if (!key) return false;
  const writeKeys = parseCsvEnv('METRICS_WRITE_API_KEYS');
  return matchesConfiguredKey(key, writeKeys);
}

const metricSubmissionSchema = z.object({
  metric: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,99}$/),
  value: z.number().finite().min(-1e12).max(1e12),
  type: z.enum(['counter', 'gauge', 'timer', 'histogram']).optional().default('gauge'),
  tags: z.record(z.string().max(50), z.string().max(200)).optional(),
}).strict().superRefine((value, context) => {
  if (value.tags && Object.keys(value.tags).length > 30) {
    context.addIssue({ code: 'custom', path: ['tags'], message: 'At most 30 tags are allowed' });
  }
});

async function assertMetricsAccess(request: NextRequest, access: 'read' | 'write', correlationId?: string): Promise<void> {
  if (await isAdminRequest(request)) return;

  const hasAccess = access === 'write'
    ? hasWriteApiKeyAccess(request)
    : hasReadApiKeyAccess(request);

  if (!hasAccess) {
    throw new ApiError(
      ApiErrorCode.FORBIDDEN,
      access === 'write'
        ? 'Admin or metrics-write API key required'
        : 'Admin or API key required',
      undefined,
      correlationId
    );
  }
}

function isAggregation(v: string | null): v is Aggregation {
  return v === 'sum' || v === 'avg' || v === 'min' || v === 'max' || v === 'count';
}

// System metrics calculation
function calculateSystemMetrics(allMetrics: MetricRecord[]): MetricsResponse['systemMetrics'] {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  // Filter recent metrics
  const recentMetrics = allMetrics.filter(m => m.timestamp >= oneHourAgo);
  
  // Calculate request count
  const requestMetrics = recentMetrics.filter(m => m.name.includes('request') || m.name.includes('http'));
  const requestCount = requestMetrics.reduce((sum, m) => sum + m.value, 0);
  
  // Calculate error count
  const errorMetrics = recentMetrics.filter(m => m.name.includes('error') || m.name.includes('exception'));
  const errorCount = errorMetrics.reduce((sum, m) => sum + m.value, 0);
  
  // Calculate average response time
  const responseTimeMetrics = recentMetrics.filter(m => m.name.includes('response_time') || m.name.includes('duration'));
  const avgResponseTime = responseTimeMetrics.length > 0 
    ? responseTimeMetrics.reduce((sum, m) => sum + m.value, 0) / responseTimeMetrics.length
    : 0;
  
  // Determine health status based on error rate
  const errorRate = requestCount > 0 ? (errorCount / requestCount) * 100 : 0;
  let healthStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  
  if (errorRate > 10) {
    healthStatus = 'unhealthy';
  } else if (errorRate > 5 || avgResponseTime > 1000) {
    healthStatus = 'degraded';
  }
  
  return {
    requestCount,
    errorCount,
    averageResponseTime: avgResponseTime,
    healthStatus,
  };
}

// Aggregate metric values
function aggregateMetricValues(values: MetricRecord[], aggregation: Aggregation) {
  if (values.length === 0) return 0;
  
  const numericValues = values.map(v => v.value);
  
  switch (aggregation) {
    case 'sum':
      return numericValues.reduce((sum, val) => sum + val, 0);
    case 'avg':
      return numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
    case 'min':
      return Math.min(...numericValues);
    case 'max':
      return Math.max(...numericValues);
    case 'count':
      return numericValues.length;
    default:
      return numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length;
  }
}

// Calculate summary statistics
function calculateSummary(values: MetricRecord[]) {
  if (values.length === 0) {
    return { count: 0, sum: 0, avg: 0, min: 0, max: 0 };
  }
  
  const numericValues = values.map(v => v.value);
  const sum = numericValues.reduce((sum, val) => sum + val, 0);
  
  return {
    count: numericValues.length,
    sum,
    avg: sum / numericValues.length,
    min: Math.min(...numericValues),
    max: Math.max(...numericValues),
  };
}

export const GET = withErrorHandler(async (request: NextRequest) => {
  const span = tracer.startSpan('metrics_query', undefined, {
    component: 'metrics',
    'http.method': request.method,
    'http.url': request.nextUrl.pathname,
  });

  const correlationId = logger.getContext()?.correlationId;
  const startTime = Date.now();

  try {
    await assertMetricsAccess(request, 'read', correlationId);

    const url = new URL(request.url);
    const timeRangeRaw = url.searchParams.get('timeRange');
    const parsedTimeRange = timeRangeRaw ? Number.parseInt(timeRangeRaw, 10) : 3600000;
    if (!Number.isFinite(parsedTimeRange) || parsedTimeRange <= 0 || parsedTimeRange > 7 * 24 * 60 * 60 * 1000) {
      throw new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        'timeRange must be a positive integer up to 604800000',
        { timeRange: timeRangeRaw },
        correlationId
      );
    }

    let parsedTags: Record<string, string> | undefined;
    const tagsRaw = url.searchParams.get('tags');
    if (tagsRaw) {
      try {
        const decoded = JSON.parse(tagsRaw) as unknown;
        if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
          throw new Error('tags must be an object');
        }

        const entries = Object.entries(decoded as Record<string, unknown>);
        if (entries.length > 30) throw new Error('too many tags');
        parsedTags = entries.reduce<Record<string, string>>((acc, [k, v]) => {
          if (/^[A-Za-z0-9_.-]{1,50}$/.test(k) && typeof v === 'string' && v.length <= 200) {
            acc[k] = v;
          }
          return acc;
        }, {});
      } catch {
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'tags must be a valid JSON object',
          undefined,
          correlationId
        );
      }
    }

    const query: MetricsQuery = {
      metric: url.searchParams.get('metric') || undefined,
      timeRange: parsedTimeRange,
      aggregation: isAggregation(url.searchParams.get('aggregation')) ? (url.searchParams.get('aggregation') as Aggregation) : 'avg',
      tags: parsedTags,
    };

    // Ensure defaults for required fields
    const timeRange = query.timeRange || 3600000;
    const aggregation = query.aggregation || 'avg';

    tracer.addTags(span, {
      'metrics.query.metric': query.metric || 'all',
      'metrics.query.timeRange': timeRange.toString(),
      'metrics.query.aggregation': aggregation,
    });

    logger.info('Metrics query requested', {
      metric: query.metric,
      timeRange: timeRange,
      aggregation: aggregation,
    });

    // Calculate time range
    const now = Date.now();
    const since = now - timeRange;

    // Get metrics from collector
  let allMetrics: MetricRecord[] = [];
    
    if (query.metric) {
      // Get specific metric
      allMetrics = metrics.getMetrics(query.metric, since);
    } else {
      allMetrics = metrics.getMetrics(undefined, since);
    }

    // Group metrics by name
    const groupedMetrics = new Map<string, MetricRecord[]>();
    for (const metric of allMetrics) {
      const existing = groupedMetrics.get(metric.name) || [];
      existing.push(metric);
      groupedMetrics.set(metric.name, existing);
    }

    // Process metrics
    const processedMetrics = Array.from(groupedMetrics.entries()).map(([name, metricValues]) => {
      const aggregatedValue = aggregateMetricValues(metricValues, aggregation);
      const summary = calculateSummary(metricValues);
      
      // Determine metric type (would be stored in the actual metric)
      let type: 'counter' | 'gauge' | 'histogram' | 'timer' = 'gauge';
      if (name.includes('count') || name.includes('requests') || name.includes('errors')) {
        type = 'counter';
      } else if (name.includes('time') || name.includes('duration')) {
        type = 'timer';
      } else if (name.includes('histogram')) {
        type = 'histogram';
      }

      return {
        name,
        type,
        values: metricValues.map((m) => ({
          timestamp: m.timestamp,
          value: m.value,
          tags: m.tags,
        })),
        aggregatedValue,
        summary,
      };
    });

    // Calculate system metrics
    const systemMetrics = calculateSystemMetrics(allMetrics);

    const response: MetricsResponse = {
      timestamp: now,
      timeRange: timeRange,
      metrics: processedMetrics,
      systemMetrics,
    };

    tracer.addTags(span, {
      'metrics.count': processedMetrics.length,
      'metrics.system.requests': systemMetrics.requestCount,
      'metrics.system.errors': systemMetrics.errorCount,
      'metrics.system.health': systemMetrics.healthStatus,
    });

    const duration = Date.now() - startTime;
    metrics.timer('metrics_query.duration', duration, {
      metric: query.metric || 'all',
      aggregation: aggregation,
    });

    logger.info('Metrics query completed', {
      duration,
      metricsCount: processedMetrics.length,
      systemHealth: systemMetrics.healthStatus,
      requestCount: systemMetrics.requestCount,
    });

    tracer.finishSpan(span);

    return createSuccessResponse(response, 200, correlationId);

  } catch (error) {
    if (error instanceof ApiError) {
      tracer.addLog(span, 'info', 'Metrics query rejected', {
        code: error.code,
        status: error.statusCode,
      });
      tracer.finishSpan(span);
      logger.debug('Metrics query rejected', { code: error.code, status: error.statusCode });
      throw error;
    }

    tracer.addLog(span, 'error', 'Metrics query failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);

    logger.error('Metrics query failed', {}, error instanceof Error ? error : new Error(String(error)));

    metrics.counter('metrics_query.errors', 1);

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Metrics query failed',
      {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      correlationId
    );
  }
}, {
  enableErrorLogging: true,
  enablePerformanceLogging: true,
  enableRequestLogging: false,
  requestTimeoutMs: 15000, // 15 second timeout for metrics queries
});

// POST endpoint for custom metric submission
export const POST = withErrorHandler(async (request: NextRequest) => {
  const span = tracer.startSpan('metrics_submit', undefined, {
    component: 'metrics',
    'http.method': request.method,
  });

  const correlationId = logger.getContext()?.correlationId;

  try {
    await assertMetricsAccess(request, 'write', correlationId);

    const { metric, value, tags, type } = await validateRequestBody(metricSubmissionSchema, 64 * 1_024)(request);

    tracer.addTags(span, {
      'metrics.submit.metric': metric,
      'metrics.submit.type': type,
      'metrics.submit.value': value.toString(),
    });

    // Submit metric based on type
    switch (type) {
      case 'counter':
        metrics.counter(metric, value, tags);
        break;
      case 'gauge':
        metrics.gauge(metric, value, tags);
        break;
      case 'timer':
        metrics.timer(metric, value, tags);
        break;
      case 'histogram':
        metrics.histogram(metric, value, tags);
        break;
      default:
        metrics.gauge(metric, value, tags);
    }

    logger.info('Custom metric submitted', {
      metric,
      type,
      value,
      tags,
    });

    tracer.finishSpan(span);

    return createSuccessResponse(
      { 
        success: true, 
        metric, 
        type, 
        value, 
        timestamp: Date.now() 
      }, 
      201, 
      correlationId
    );

  } catch (error) {
    if (error instanceof ApiError) {
      tracer.addLog(span, 'info', 'Metric submission rejected', {
        code: error.code,
        status: error.statusCode,
      });
      tracer.finishSpan(span);
      logger.debug('Metric submission rejected', { code: error.code, status: error.statusCode });
      throw error;
    }

    tracer.addLog(span, 'error', 'Metric submission failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);

    logger.error('Metric submission failed', {}, error instanceof Error ? error : new Error(String(error)));

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Metric submission failed',
      {
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      },
      correlationId
    );
  }
}, {
  enableErrorLogging: true,
  enablePerformanceLogging: true,
  enableRequestLogging: true,
  requestTimeoutMs: 5000,
});
