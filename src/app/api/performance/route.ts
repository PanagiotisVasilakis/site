/**
 * Performance metrics API endpoint
 * Receives and processes client-side performance data
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode, RateLimitError } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';

// Performance metric schemas
const CoreWebVitalSchema = z.object({
  name: z.enum(['CLS', 'FID', 'FCP', 'LCP', 'TTFB']),
  value: z.number().min(0),
  rating: z.enum(['good', 'needs-improvement', 'poor']),
  timestamp: z.number(),
  id: z.string().optional(),
  navigationType: z.string().optional(),
  url: z.string().url(),
  userAgent: z.string(),
  connection: z.object({
    effectiveType: z.string().optional(),
    downlink: z.number().optional(),
    rtt: z.number().optional(),
  }).optional(),
});

const CustomMetricSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.number(),
  timestamp: z.number(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const PerformanceReportSchema = z.object({
  sessionId: z.string().min(1).max(100),
  timestamp: z.number(),
  url: z.string().url(),
  coreWebVitals: z.array(CoreWebVitalSchema).max(20),
  customMetrics: z.array(CustomMetricSchema).max(100),
});

const SingleMetricReportSchema = z.object({
  type: z.literal('core-web-vital'),
  sessionId: z.string().min(1).max(100),
  metric: CoreWebVitalSchema,
});

type PerformanceReport = z.infer<typeof PerformanceReportSchema>;
type SingleMetricReport = z.infer<typeof SingleMetricReportSchema>;

// Rate limiting for performance reports (per session)
const performanceReportLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REPORTS_PER_WINDOW = 20;
// Deduplicate recent single-metric ids per session to avoid floods
const recentMetrics = new Map<string, Map<string, number>>(); // sessionId -> (metricId -> expiryMs)
const RECENT_ID_WINDOW_MS = 60 * 1000;
const MAX_TRACKED_SESSIONS = 5000;
const STORE_CLEANUP_INTERVAL_MS = 60 * 1000;
let lastStoreCleanupAt = 0;

function cleanupTrackingStores(now: number): void {
  if (now - lastStoreCleanupAt < STORE_CLEANUP_INTERVAL_MS) {
    return;
  }
  lastStoreCleanupAt = now;

  for (const [sessionId, entry] of performanceReportLimits) {
    if (entry.resetTime <= now) {
      performanceReportLimits.delete(sessionId);
    }
  }

  for (const [sessionId, metricMap] of recentMetrics) {
    for (const [metricId, expiresAt] of metricMap) {
      if (expiresAt <= now) {
        metricMap.delete(metricId);
      }
    }
    if (metricMap.size === 0) {
      recentMetrics.delete(sessionId);
    }
  }

  while (performanceReportLimits.size > MAX_TRACKED_SESSIONS) {
    const oldestSessionId = performanceReportLimits.keys().next().value;
    if (!oldestSessionId) break;
    performanceReportLimits.delete(oldestSessionId);
  }

  while (recentMetrics.size > MAX_TRACKED_SESSIONS) {
    const oldestSessionId = recentMetrics.keys().next().value;
    if (!oldestSessionId) break;
    recentMetrics.delete(oldestSessionId);
  }
}

function dedupeSingleMetric(sessionId: string, metricId?: string): boolean {
  if (!metricId) return true;
  const now = Date.now();
  cleanupTrackingStores(now);

  let sessionMap = recentMetrics.get(sessionId);
  if (!sessionMap) {
    sessionMap = new Map<string, number>();
    recentMetrics.set(sessionId, sessionMap);
  }
  const exp = sessionMap.get(metricId);
  if (exp && exp > now) {
    return false; // duplicate within window
  }
  // prune occasionally
  if (sessionMap.size > 500) {
    for (const [id, ts] of sessionMap) {
      if (ts <= now) sessionMap.delete(id);
    }
  }

  sessionMap.set(metricId, now + RECENT_ID_WINDOW_MS);

  while (sessionMap.size > 1000) {
    const oldestMetricId = sessionMap.keys().next().value;
    if (!oldestMetricId) break;
    sessionMap.delete(oldestMetricId);
  }

  return true;
}

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  cleanupTrackingStores(now);
  const limit = performanceReportLimits.get(sessionId);

  if (!limit || now > limit.resetTime) {
    performanceReportLimits.set(sessionId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= MAX_REPORTS_PER_WINDOW) {
    return false;
  }
// (helper defined above)

  limit.count++;
  return true;
}

function analyzePerformance(report: PerformanceReport): {
  score: number;
  issues: string[];
  insights: string[];
} {
  const issues: string[] = [];
  const insights: string[] = [];
  let totalScore = 0;
  let metricCount = 0;

  // Analyze Core Web Vitals
  for (const metric of report.coreWebVitals) {
    metricCount++;
    
    switch (metric.rating) {
      case 'good':
        totalScore += 100;
        insights.push(`Good ${metric.name}: ${metric.value}${getMetricUnit(metric.name)}`);
        break;
      case 'needs-improvement':
        totalScore += 50;
        issues.push(`${metric.name} needs improvement: ${metric.value}${getMetricUnit(metric.name)}`);
        break;
      case 'poor':
        totalScore += 0;
        issues.push(`Poor ${metric.name}: ${metric.value}${getMetricUnit(metric.name)}`);
        break;
    }
  }

  // Analyze custom metrics for performance insights
  const slowResources = report.customMetrics.filter(m => 
    m.name === 'slow-resource' && m.value > 2000
  );
  if (slowResources.length > 0) {
    issues.push(`${slowResources.length} slow resources detected (>2s)`);
  }

  const largeResources = report.customMetrics.filter(m => 
    m.name === 'large-resource' && m.value > 2 * 1024 * 1024
  );
  if (largeResources.length > 0) {
    issues.push(`${largeResources.length} large resources detected (>2MB)`);
  }

  const jsErrors = report.customMetrics.filter(m => m.name === 'js-error-count');
  if (jsErrors.length > 5) {
    issues.push(`High JavaScript error rate: ${jsErrors.length} errors`);
  }

  const apiCalls = report.customMetrics.filter(m => m.name === 'api-call');
  const slowApiCalls = apiCalls.filter(m => m.value > 1000);
  if (slowApiCalls.length > 0) {
    issues.push(`${slowApiCalls.length} slow API calls detected (>1s)`);
  }

  const score = metricCount > 0 ? Math.round(totalScore / metricCount) : 100;

  return { score, issues, insights };
}

function getMetricUnit(metricName: string): string {
  switch (metricName) {
    case 'CLS':
      return '';
    case 'FID':
    case 'FCP':
    case 'LCP':
    case 'TTFB':
      return 'ms';
    default:
      return '';
  }
}

async function storePerformanceData(report: PerformanceReport, analysis: ReturnType<typeof analyzePerformance>): Promise<void> {
  // Log performance data with structured format
  logger.info('Performance metrics received', {
    sessionId: report.sessionId,
    url: report.url,
    timestamp: report.timestamp,
    coreWebVitalsCount: report.coreWebVitals.length,
    customMetricsCount: report.customMetrics.length,
    performanceScore: analysis.score,
    issuesCount: analysis.issues.length,
    coreWebVitals: report.coreWebVitals.reduce((acc, metric) => {
      acc[metric.name] = {
        value: metric.value,
        rating: metric.rating,
      };
      return acc;
    }, {} as Record<string, { value: number; rating: string }>),
  });

  // Here you would integrate with your analytics/monitoring platform:
  // - Send to Datadog, New Relic, or custom analytics
  // - Store in database for historical analysis
  // - Trigger alerts for poor performance
  
  // Example integrations:
  // await sendToDatadog(report, analysis);
  // await storeInDatabase(report, analysis);
  // await checkPerformanceAlerts(analysis);
}

async function handleCriticalPerformanceIssue(report: SingleMetricReport): Promise<void> {
  const metric = report.metric;
  
  logger.warn('Critical performance issue detected', {
    sessionId: report.sessionId,
    metricName: metric.name,
    metricValue: metric.value,
    rating: metric.rating,
    url: metric.url,
    userAgent: metric.userAgent,
    connection: metric.connection,
  });

  // Immediate actions for critical performance issues
  if (metric.rating === 'poor') {
    // Trigger immediate alerts or notifications
    // await sendPerformanceAlert(metric);
    
    // Log for real-time monitoring
    logger.error('Poor Core Web Vital detected', {
      metric: metric.name,
      value: metric.value,
      url: metric.url,
      threshold: getPerformanceThreshold(metric.name),
    });
  }
}

function getPerformanceThreshold(metricName: string): number {
  const thresholds: Record<string, number> = {
    CLS: 0.25,
    FID: 300,
    FCP: 3000,
    LCP: 4000,
    TTFB: 1800,
  };
  return thresholds[metricName] || 0;
}

// POST endpoint for performance reports
export const POST = withErrorHandler(async (request: NextRequest) => {
  const correlationId = logger.getContext()?.correlationId || 'unknown';
  
  try {
    // Determine if this is a batch report or single metric report
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    if (body.type === 'core-web-vital') {
      // Handle single critical metric report
      const report = SingleMetricReportSchema.parse(body);

      // Rate limiting
      if (!checkRateLimit(report.sessionId)) {
        logger.warn('Performance report rate limit exceeded', { sessionId: report.sessionId, correlationId });
        // Signal rate limit with retry-after so clients can back off
        throw new RateLimitError(MAX_REPORTS_PER_WINDOW, RATE_LIMIT_WINDOW, Math.ceil(RATE_LIMIT_WINDOW / 1000), correlationId);
      }

      // Dedupe repeated metric id within short window
      if (!dedupeSingleMetric(report.sessionId, report.metric.id)) {
        return createSuccessResponse({ received: false, deduped: true, type: 'critical-metric', correlationId }, 202, correlationId);
      }

      await handleCriticalPerformanceIssue(report);

      return createSuccessResponse({
        received: true,
        type: 'critical-metric',
        correlationId,
      }, 201, correlationId);

    } else {
      // Handle batch performance report
      const report = PerformanceReportSchema.parse(body);

      // Rate limiting
      if (!checkRateLimit(report.sessionId)) {
        logger.warn('Performance report rate limit exceeded', { sessionId: report.sessionId, correlationId });
        throw new RateLimitError(MAX_REPORTS_PER_WINDOW, RATE_LIMIT_WINDOW, Math.ceil(RATE_LIMIT_WINDOW / 1000), correlationId);
      }

      // Analyze performance data
      const analysis = analyzePerformance(report);

      // Store performance data
      await storePerformanceData(report, analysis);

      logger.info('Performance report processed successfully', {
        sessionId: report.sessionId,
        metricsCount: report.coreWebVitals.length + report.customMetrics.length,
        performanceScore: analysis.score,
        correlationId,
      });

      return createSuccessResponse({
        received: true,
        sessionId: report.sessionId,
        analysis: {
          score: analysis.score,
          issuesCount: analysis.issues.length,
          insightsCount: analysis.insights.length,
        },
        correlationId,
      }, 201, correlationId);
    }

  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    logger.error('Failed to process performance report', {
      correlationId,
      error: error instanceof Error ? error.message : String(error),
    }, error instanceof Error ? error : new Error(String(error)));

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Failed to process performance report',
      { correlationId },
      correlationId
    );
  }
}, {
  enableErrorLogging: true,
  enablePerformanceLogging: true,
  enableRequestLogging: false, // Don't log performance requests to avoid noise
  maxRequestBodySize: 100 * 1024, // 100KB max for performance reports
  requestTimeoutMs: 15000, // 15 second timeout
});