/**
 * Alerts Management API
 * Provides endpoints for managing alerts, rules, and notifications
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { tracer, SpanStatus } from '@/lib/distributed-tracing';
import { alertingSystem, AlertRule } from '@/lib/alerting-system';
import { isAdminRequest } from '@/lib/rbac';

export const dynamic = 'force-dynamic';

async function assertAdminAccess(request: NextRequest, correlationId?: string): Promise<void> {
  if (!(await isAdminRequest(request))) {
    throw new ApiError(
      ApiErrorCode.FORBIDDEN,
      'Admin credentials required',
      undefined,
      correlationId
    );
  }
}

// GET /api/alerts - Get active alerts and system status
export const GET = withErrorHandler(async (request: NextRequest) => {
  const span = tracer.startSpan('alerts_get', undefined, {
    component: 'alerts',
    'http.method': request.method,
    'http.url': request.url,
  });

  const correlationId = logger.getContext()?.correlationId;

  try {
    await assertAdminAccess(request, correlationId);

    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'active'; // active, history, rules
    const hoursRaw = url.searchParams.get('hours');
    const hours = hoursRaw ? Number.parseInt(hoursRaw, 10) : 24;
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
      throw new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        'hours must be an integer between 1 and 720',
        { hours: hoursRaw },
        correlationId
      );
    }

    tracer.addTags(span, {
      'alerts.type': type,
      'alerts.hours': hours.toString(),
    });

    let responseData: {
      alerts?: unknown[];
      count?: number;
      summary?: Record<string, unknown>;
      metrics?: Record<string, unknown>;
      severityCounts?: Record<string, number>;
      timeRange?: number;
      rules?: unknown[];
      enabled?: number;
      disabled?: number;
      timestamp?: number;
      status?: string;
    } = {};

    switch (type) {
      case 'active':
        const activeAlerts = alertingSystem.getActiveAlerts();
        responseData = {
          alerts: activeAlerts,
          count: activeAlerts.length,
          severityCounts: {
            critical: activeAlerts.filter(a => a.severity === 'critical').length,
            high: activeAlerts.filter(a => a.severity === 'high').length,
            medium: activeAlerts.filter(a => a.severity === 'medium').length,
            low: activeAlerts.filter(a => a.severity === 'low').length,
          },
          timestamp: Date.now(),
        };
        break;

      case 'history':
        const historicalAlerts = alertingSystem.getAlertHistory(hours);
        responseData = {
          alerts: historicalAlerts,
          count: historicalAlerts.length,
          timeRange: hours,
          timestamp: Date.now(),
        };
        break;

      case 'rules':
        const rules = alertingSystem.getRules();
        responseData = {
          rules,
          count: rules.length,
          enabled: rules.filter(r => r.enabled).length,
          disabled: rules.filter(r => !r.enabled).length,
          timestamp: Date.now(),
        };
        break;

      default:
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'Invalid type parameter',
          { validTypes: ['active', 'history', 'rules'] },
          correlationId
        );
    }

    tracer.addTags(span, {
      'alerts.count': responseData.count || 0,
    });

    logger.info('Alerts query completed', {
      type,
      count: responseData.count || 0,
      hours: type === 'history' ? hours : undefined,
    });

    tracer.finishSpan(span);

    return createSuccessResponse(responseData, 200, correlationId);

  } catch (error) {
    tracer.addLog(span, 'error', 'Alerts query failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);

    logger.error('Alerts query failed', {}, error instanceof Error ? error : new Error(String(error)));

    metrics.counter('alerts.api.errors', 1, { operation: 'get' });

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Alerts query failed',
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
  requestTimeoutMs: 10000,
});

// POST /api/alerts - Create new alert rule or acknowledge alert
export const POST = withErrorHandler(async (request: NextRequest) => {
  const span = tracer.startSpan('alerts_post', undefined, {
    component: 'alerts',
    'http.method': request.method,
  });

  const correlationId = logger.getContext()?.correlationId;

  try {
    await assertAdminAccess(request, correlationId);

    const body = await request.json();
    const { action, data } = body;

    tracer.addTags(span, {
      'alerts.action': action,
    });

    let responseData: {
      success?: boolean;
      message?: string;
      alertId?: string;
      rule?: unknown;
      acknowledgedAt?: number;
      ruleId?: string;
      createdAt?: number;
    } = {};

    switch (action) {
      case 'acknowledge':
        const { alertId } = data;
        if (!alertId) {
          throw new ApiError(
            ApiErrorCode.VALIDATION_ERROR,
            'Alert ID is required for acknowledgment',
            {},
            correlationId
          );
        }

        const acknowledged = alertingSystem.acknowledgeAlert(alertId);
        if (!acknowledged) {
          throw new ApiError(
            ApiErrorCode.NOT_FOUND,
            'Alert not found or cannot be acknowledged',
            { alertId },
            correlationId
          );
        }

        responseData = {
          success: true,
          alertId,
          acknowledgedAt: Date.now(),
        };

        metrics.counter('alerts.api.acknowledged', 1);
        logger.info('Alert acknowledged via API', { alertId });
        break;

      case 'create_rule':
        const { rule } = data as { rule: AlertRule };
        if (!rule || !rule.id || !rule.name || !rule.metric) {
          throw new ApiError(
            ApiErrorCode.VALIDATION_ERROR,
            'Invalid rule data',
            { required: ['id', 'name', 'metric', 'condition', 'severity'] },
            correlationId
          );
        }

        alertingSystem.addRule(rule);
        responseData = {
          success: true,
          ruleId: rule.id,
          createdAt: Date.now(),
        };

        metrics.counter('alerts.api.rules_created', 1);
        logger.info('Alert rule created via API', { ruleId: rule.id, name: rule.name });
        break;

      default:
        throw new ApiError(
          ApiErrorCode.VALIDATION_ERROR,
          'Invalid action',
          { validActions: ['acknowledge', 'create_rule'] },
          correlationId
        );
    }

    tracer.finishSpan(span);

    return createSuccessResponse(responseData, 200, correlationId);

  } catch (error) {
    tracer.addLog(span, 'error', 'Alerts action failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);

    logger.error('Alerts action failed', {}, error instanceof Error ? error : new Error(String(error)));

    metrics.counter('alerts.api.errors', 1, { operation: 'post' });

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Alerts action failed',
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
  requestTimeoutMs: 10000,
});

// PUT /api/alerts - Update alert rule
export const PUT = withErrorHandler(async (request: NextRequest) => {
  const span = tracer.startSpan('alerts_put', undefined, {
    component: 'alerts',
    'http.method': request.method,
  });

  const correlationId = logger.getContext()?.correlationId;

  try {
    await assertAdminAccess(request, correlationId);

    const body = await request.json();
    const { ruleId, updates } = body;

    if (!ruleId || !updates) {
      throw new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        'Rule ID and updates are required',
        {},
        correlationId
      );
    }

    tracer.addTags(span, {
      'alerts.ruleId': ruleId,
    });

    const updated = alertingSystem.updateRule(ruleId, updates);
    if (!updated) {
      throw new ApiError(
        ApiErrorCode.NOT_FOUND,
        'Alert rule not found',
        { ruleId },
        correlationId
      );
    }

    const responseData = {
      success: true,
      ruleId,
      updatedAt: Date.now(),
      updates: Object.keys(updates),
    };

    metrics.counter('alerts.api.rules_updated', 1);
    logger.info('Alert rule updated via API', { ruleId, updates: Object.keys(updates) });

    tracer.finishSpan(span);

    return createSuccessResponse(responseData, 200, correlationId);

  } catch (error) {
    tracer.addLog(span, 'error', 'Alert rule update failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);

    logger.error('Alert rule update failed', {}, error instanceof Error ? error : new Error(String(error)));

    metrics.counter('alerts.api.errors', 1, { operation: 'put' });

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Alert rule update failed',
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
  requestTimeoutMs: 10000,
});

// DELETE /api/alerts - Remove alert rule
export const DELETE = withErrorHandler(async (request: NextRequest) => {
  const span = tracer.startSpan('alerts_delete', undefined, {
    component: 'alerts',
    'http.method': request.method,
  });

  const correlationId = logger.getContext()?.correlationId;

  try {
    await assertAdminAccess(request, correlationId);

    const url = new URL(request.url);
    const ruleId = url.searchParams.get('ruleId');

    if (!ruleId) {
      throw new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        'Rule ID is required',
        {},
        correlationId
      );
    }

    tracer.addTags(span, {
      'alerts.ruleId': ruleId,
    });

    const rule = alertingSystem.getRule(ruleId);
    if (!rule) {
      throw new ApiError(
        ApiErrorCode.NOT_FOUND,
        'Alert rule not found',
        { ruleId },
        correlationId
      );
    }

    alertingSystem.removeRule(ruleId);

    const responseData = {
      success: true,
      ruleId,
      deletedAt: Date.now(),
    };

    metrics.counter('alerts.api.rules_deleted', 1);
    logger.info('Alert rule deleted via API', { ruleId });

    tracer.finishSpan(span);

    return createSuccessResponse(responseData, 200, correlationId);

  } catch (error) {
    tracer.addLog(span, 'error', 'Alert rule deletion failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);

    logger.error('Alert rule deletion failed', {}, error instanceof Error ? error : new Error(String(error)));

    metrics.counter('alerts.api.errors', 1, { operation: 'delete' });

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Alert rule deletion failed',
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
  requestTimeoutMs: 10000,
});
