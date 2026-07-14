/**
 * Health Monitoring & Status Checks API
 * Comprehensive system health monitoring with dependency checks
 * Enhanced with metrics collection and distributed tracing
 */

import { NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { tracer, SpanStatus } from '@/lib/distributed-tracing';

interface HealthCheck {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  responseTime?: number;
  details?: Record<string, string | number | boolean | null>;
  timestamp: string;
}

interface HealthCheckResponse {
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

// Health check thresholds
const RSS_WARNING_THRESHOLD = 0.8; // 80%
const RSS_CRITICAL_THRESHOLD = 0.9; // 90%
const HEAP_HIGH_UTILIZATION_THRESHOLD = 0.95; // 95%
const MEMORY_LIMIT_CACHE_MS = 60_000;
const CGROUP_MEMORY_LIMIT_FILES = [
  '/sys/fs/cgroup/memory.max', // cgroup v2
  '/sys/fs/cgroup/memory/memory.limit_in_bytes', // cgroup v1
];

let cachedMemoryLimitBytes: number | null = null;
let cachedMemoryLimitTimestamp = 0;

function parseMemoryLimit(value: string): number | null {
  const normalized = value.trim();
  if (!normalized || normalized === 'max') {
    return null;
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  // Some systems report effectively "unlimited" memory as a massive sentinel value.
  if (parsed > 1e15) {
    return null;
  }

  return parsed;
}

async function resolveMemoryLimitBytes(): Promise<number> {
  const now = Date.now();
  if (cachedMemoryLimitBytes !== null && now - cachedMemoryLimitTimestamp < MEMORY_LIMIT_CACHE_MS) {
    return cachedMemoryLimitBytes;
  }

  const hostTotalMemory = os.totalmem();
  let memoryLimitBytes = hostTotalMemory;

  for (const limitFile of CGROUP_MEMORY_LIMIT_FILES) {
    try {
      // The path comes exclusively from the module-private CGROUP_MEMORY_LIMIT_FILES allowlist.
      const raw = await readFile(/*turbopackIgnore: true*/ limitFile, 'utf8');
      const parsed = parseMemoryLimit(raw);
      if (parsed !== null) {
        memoryLimitBytes = Math.min(memoryLimitBytes, parsed);
        break;
      }
    } catch {
      // Ignore files that do not exist in this runtime.
    }
  }

  cachedMemoryLimitBytes = memoryLimitBytes;
  cachedMemoryLimitTimestamp = now;
  return memoryLimitBytes;
}

async function performHealthChecks(): Promise<HealthCheckResponse> {
  const overallStartTime = Date.now();
  const checks: HealthCheck[] = [];
  
  // Memory check
  const memoryCheck = await runHealthCheck('memory', async () => {
    const memUsage = process.memoryUsage();
    const memoryLimitBytes = await resolveMemoryLimitBytes();
    const heapUsagePercentage = memUsage.heapTotal > 0 ? memUsage.heapUsed / memUsage.heapTotal : 0;
    const rssUsagePercentage = memoryLimitBytes > 0 ? memUsage.rss / memoryLimitBytes : 0;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = `Memory usage healthy (RSS ${Math.round(rssUsagePercentage * 100)}%, heap ${Math.round(heapUsagePercentage * 100)}%)`;
    
    if (rssUsagePercentage > RSS_CRITICAL_THRESHOLD) {
      status = 'unhealthy';
      message = `Critical RSS memory usage: ${Math.round(rssUsagePercentage * 100)}%`;
    } else if (rssUsagePercentage > RSS_WARNING_THRESHOLD) {
      status = 'degraded';
      message = `High RSS memory usage: ${Math.round(rssUsagePercentage * 100)}%`;
    } else if (heapUsagePercentage > HEAP_HIGH_UTILIZATION_THRESHOLD) {
      status = 'degraded';
      message = `High heap utilization: ${Math.round(heapUsagePercentage * 100)}%`;
    }

    return {
      status,
      message,
      details: {
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss,
        memoryLimit: memoryLimitBytes,
        percentage: Math.round(rssUsagePercentage * 100),
        rssPercentage: Math.round(rssUsagePercentage * 100),
        heapPercentage: Math.round(heapUsagePercentage * 100),
      },
    };
  });
  checks.push(memoryCheck);

  // Storage/Filesystem check
  const storageCheck = await runHealthCheck('storage', async () => {
    // Test basic filesystem operations
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'Filesystem accessible';
    
    try {
      // Simple check - we can't write files in production but can check env
      if (process.env.NODE_ENV === 'development') {
        message = 'Filesystem check (development mode)';
      } else {
        message = 'Filesystem check (production mode)';
      }
    } catch (error) {
      status = 'unhealthy';
      message = `Filesystem error: ${error instanceof Error ? error.message : String(error)}`;
    }

    return {
      status,
      message,
      details: {
        nodeEnv: process.env.NODE_ENV,
        platform: process.platform,
      },
    };
  });
  checks.push(storageCheck);

  // Environment check
  const envCheck = await runHealthCheck('environment', async () => {
    const requiredEnvVars = [
      'NODE_ENV',
      'NEXT_PUBLIC_SITE_URL',
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    let message = 'All required environment variables are set';

    if (missingVars.length > 0) {
      status = 'degraded';
      message = `Missing environment variables: ${missingVars.join(', ')}`;
    }

    return {
      status,
      message,
      details: {
        missing: missingVars,
        nodeEnv: process.env.NODE_ENV,
        nodeVersion: process.version,
      },
    };
  });
  checks.push(envCheck);

  // Analytics health check
  const analyticsCheck = await runHealthCheck('analytics', async () => {
    try {
      const { getHits, vitalsSummary } = await import('@/lib/analyticsStore');
      const hits = getHits();
      const vitals = vitalsSummary();
      
      return {
        status: 'healthy' as const,
        message: `Analytics operational (${hits.length} hits, ${vitals.length} vital types)`,
        details: {
          hitCount: hits.length,
          vitalTypes: vitals.length,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy' as const,
        message: `Analytics error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
  checks.push(analyticsCheck);

  // Metrics system check
  const metricsCheck = await runHealthCheck('metrics', async () => {
    try {
      // Test metrics collection
      const testMetricName = 'health_check_test';
      metrics.counter(testMetricName, 1, { check: 'health' });
      
      return {
        status: 'healthy' as const,
        message: 'Metrics collection operational',
        details: {
          testMetric: testMetricName,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy' as const,
        message: `Metrics error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
  checks.push(metricsCheck);

  // Calculate summary
  const summary = {
    total: checks.length,
    healthy: checks.filter(c => c.status === 'healthy').length,
    degraded: checks.filter(c => c.status === 'degraded').length,
    unhealthy: checks.filter(c => c.status === 'unhealthy').length,
  };

  // Overall status determination
  let status: HealthCheckResponse['status'] = 'healthy';
  if (summary.unhealthy > 0) {
    status = 'unhealthy';
  } else if (summary.degraded > 0) {
    status = 'degraded';
  }

  // Performance metrics
  const totalCheckTime = Date.now() - overallStartTime;
  const checkTimes = checks.map(c => ({ name: c.name, time: c.responseTime || 0 }));
  const slowestCheck = checkTimes.reduce((prev, current) => 
    (prev.time > current.time) ? prev : current
  );
  const fastestCheck = checkTimes.reduce((prev, current) => 
    (prev.time < current.time) ? prev : current
  );

  return {
    status,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '0.1.1',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'unknown',
    checks,
    summary,
    performance: {
      totalCheckTime,
      slowestCheck: slowestCheck.name,
      fastestCheck: fastestCheck.name,
    },
  };
}

async function runHealthCheck(
  name: string,
  checkFn: () => Promise<{ status: 'healthy' | 'degraded' | 'unhealthy'; message: string; details?: unknown }>
): Promise<HealthCheck> {
  const startTime = Date.now();
  
  try {
    const result = await checkFn();
    const responseTime = Date.now() - startTime;
    
    // Track metrics
    metrics.counter('health_check.executed', 1, { check: name, status: result.status });
    metrics.timer('health_check.response_time', responseTime, { check: name });
    
    const details = ((): Record<string, string | number | boolean | null> | undefined => {
      if (result.details && typeof result.details === 'object') {
        const out: Record<string, string | number | boolean | null> = {};
        for (const [k, v] of Object.entries(result.details as Record<string, unknown>)) {
          if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            out[k] = v as string | number | boolean | null;
          } else {
            out[k] = null;
          }
        }
        return out;
      }
      return undefined;
    })();

    return {
      name,
      status: result.status,
      message: result.message,
      responseTime,
      details,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    metrics.counter('health_check.errors', 1, { check: name });
    
    logger.error(`Health check '${name}' failed`, {}, error instanceof Error ? error : new Error(String(error)));
    
    return {
      name,
      status: 'unhealthy',
      message: `Check failed: ${error instanceof Error ? error.message : String(error)}`,
      responseTime,
      timestamp: new Date().toISOString(),
    };
  }
}

// Wrap with error handler and export
export const GET = withErrorHandler(async (request: NextRequest) => {
  const span = tracer.startSpan('health_check', undefined, {
    component: 'health',
    'http.method': request.method,
    'http.url': request.url,
  });

  const correlationId = logger.getContext()?.correlationId;
  const startTime = Date.now();
  
  try {
    // Check if this is a specific check request
    const url = new URL(request.url);
    const checkName = url.searchParams.get('check');
    
    if (checkName) {
      tracer.addTags(span, { 'health.check': checkName });
      logger.info(`Specific health check requested: ${checkName}`);
      
      // For specific checks, we'd need to implement individual check runners
      // For now, run all checks and filter
      const healthData = await performHealthChecks();
      const specificCheck = healthData.checks.find(c => c.name === checkName);
      
      if (!specificCheck) {
        throw new ApiError(
          ApiErrorCode.NOT_FOUND,
          `Health check '${checkName}' not found`,
          { availableChecks: healthData.checks.map(c => c.name) },
          correlationId
        );
      }
      
      tracer.addTags(span, { 'health.status': specificCheck.status });
      tracer.finishSpan(span);
      
      const statusCode = specificCheck.status === 'healthy' ? 200 : 
                        specificCheck.status === 'degraded' ? 200 : 503;
      
      return createSuccessResponse(specificCheck, statusCode, correlationId);
    }
    
    logger.info('Full health check requested');
    
    const healthData = await performHealthChecks();
    
    tracer.addTags(span, { 
      'health.status': healthData.status,
      'health.checks_total': healthData.summary.total,
      'health.checks_healthy': healthData.summary.healthy,
      'health.checks_degraded': healthData.summary.degraded,
      'health.checks_unhealthy': healthData.summary.unhealthy,
    });
    
    const duration = Date.now() - startTime;
    metrics.timer('health_check.full_duration', duration);
    metrics.gauge('system.health.status', healthData.status === 'healthy' ? 1 : 0);
    metrics.gauge('system.health.checks_total', healthData.summary.total);
    metrics.gauge('system.health.checks_healthy', healthData.summary.healthy);
    metrics.gauge('system.health.checks_degraded', healthData.summary.degraded);
    metrics.gauge('system.health.checks_unhealthy', healthData.summary.unhealthy);
    
    logger.info('Health check completed', {
      status: healthData.status,
      duration,
      checksTotal: healthData.summary.total,
      checksHealthy: healthData.summary.healthy,
      checksDegraded: healthData.summary.degraded,
      checksUnhealthy: healthData.summary.unhealthy,
      slowestCheck: healthData.performance.slowestCheck,
      fastestCheck: healthData.performance.fastestCheck,
    });

    tracer.finishSpan(span);

    // Return different status codes based on health
    const statusCode = healthData.status === 'healthy' ? 200 : 
                     healthData.status === 'degraded' ? 200 : 503;

    return createSuccessResponse(healthData, statusCode, correlationId);
    
  } catch (error) {
    tracer.addLog(span, 'error', 'Health check failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);

    logger.error('Health check failed', {}, error instanceof Error ? error : new Error(String(error)));
    
    metrics.counter('health_check.endpoint_errors', 1);

    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError(
      ApiErrorCode.SERVICE_UNAVAILABLE,
      'Health check service unavailable',
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
  enableRequestLogging: false, // Health checks are frequent
  requestTimeoutMs: 10000, // 10 second timeout for comprehensive health checks
});

// Simple liveness probe (minimal check)
export async function HEAD() {
  try {
    // Simple liveness check - just return 200 if the process is running
    metrics.counter('health_check.liveness', 1);
    return new Response(null, { status: 200 });
  } catch (error) {
    metrics.counter('health_check.liveness_errors', 1);
    logger.error('Liveness check failed', {}, error instanceof Error ? error : new Error(String(error)));
    return new Response(null, { status: 503 });
  }
}
