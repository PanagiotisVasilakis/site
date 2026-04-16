/**
 * Alert Webhook Receiver
 * Receives and processes alert notifications from external systems
 */

import { NextRequest } from 'next/server';
import { withErrorHandler, createSuccessResponse, ApiError, ApiErrorCode } from '@/lib/apiErrorHandler';
import { logger } from '@/lib/logger-enterprise';
import { metrics } from '@/lib/metrics-collector';
import { tracer, SpanStatus } from '@/lib/distributed-tracing';
import crypto from 'node:crypto';

export const dynamic = 'force-dynamic';

interface WebhookAlert {
  alert: {
    id: string;
    rule: string;
    metric: string;
    value: number;
    threshold?: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
    status: 'active' | 'resolved' | 'acknowledged';
    message: string;
    timestamp: number;
  };
  timestamp: number;
}

// POST /api/alerts/webhook - Receive alert webhook notifications
export const POST = withErrorHandler(async (request: NextRequest) => {
  const span = tracer.startSpan('alerts_webhook', undefined, {
    component: 'alerts',
    'http.method': request.method,
  });

  const correlationId = logger.getContext()?.correlationId;

  try {
    // Validate webhook authentication
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.ALERT_WEBHOOK_TOKEN;

    if (!expectedToken) {
      throw new ApiError(
        ApiErrorCode.SERVICE_UNAVAILABLE,
        'Webhook token is not configured',
        {},
        correlationId
      );
    }
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(
        ApiErrorCode.UNAUTHORIZED,
        'Missing or invalid authorization header',
        {},
        correlationId
      );
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer '
    const tokenBuffer = Buffer.from(token, 'utf8');
    const expectedBuffer = Buffer.from(expectedToken, 'utf8');
    const isValidToken = tokenBuffer.length === expectedBuffer.length
      && crypto.timingSafeEqual(tokenBuffer, expectedBuffer);
    if (!isValidToken) {
      throw new ApiError(
        ApiErrorCode.UNAUTHORIZED,
        'Invalid webhook token',
        {},
        correlationId
      );
    }

    const webhookData: WebhookAlert = await request.json();
    
    if (!webhookData.alert || !webhookData.alert.id) {
      throw new ApiError(
        ApiErrorCode.VALIDATION_ERROR,
        'Invalid webhook payload',
        { required: ['alert.id', 'alert.rule', 'alert.severity'] },
        correlationId
      );
    }

    tracer.addTags(span, {
      'alerts.webhook.id': webhookData.alert.id,
      'alerts.webhook.severity': webhookData.alert.severity,
      'alerts.webhook.status': webhookData.alert.status,
    });

    // Process the webhook alert
    const alert = webhookData.alert;
    
    // Log the webhook alert
    logger.info('Webhook alert received', {
      alertId: alert.id,
      rule: alert.rule,
      metric: alert.metric,
      value: alert.value,
      severity: alert.severity,
      status: alert.status,
      message: alert.message,
    });

    // Track webhook metrics
    metrics.counter('alerts.webhook.received', 1, {
      severity: alert.severity,
      status: alert.status,
    });

    // In a real implementation, you might:
    // 1. Store the alert in a database
    // 2. Forward to other notification systems
    // 3. Trigger additional automations
    // 4. Update monitoring dashboards

    // Example: Forward critical alerts to additional channels
    if (alert.severity === 'critical') {
      logger.error('Critical alert received via webhook', {
        alertId: alert.id,
        rule: alert.rule,
        metric: alert.metric,
        value: alert.value,
        message: alert.message,
      });
      
      metrics.counter('alerts.webhook.critical', 1);
      
      // Here you could integrate with:
      // - PagerDuty
      // - Slack
      // - Email services
      // - SMS gateways
    }

    // Response data
    const responseData = {
      success: true,
      alertId: alert.id,
      processed: true,
      timestamp: Date.now(),
      actions: {
        logged: true,
        metricsTracked: true,
        criticalEscalation: alert.severity === 'critical',
      },
    };

    tracer.finishSpan(span);

    return createSuccessResponse(responseData, 200, correlationId);

  } catch (error) {
    tracer.addLog(span, 'error', 'Webhook processing failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    tracer.finishSpan(span, SpanStatus.ERROR);

    logger.error('Webhook processing failed', {}, error instanceof Error ? error : new Error(String(error)));

    metrics.counter('alerts.webhook.errors', 1);

    if (error instanceof ApiError) {
      throw error;
    }

    throw new ApiError(
      ApiErrorCode.INTERNAL_ERROR,
      'Webhook processing failed',
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

// GET /api/alerts/webhook - Health check for webhook endpoint
export const GET = withErrorHandler(async () => {
  const responseData = {
    status: 'healthy',
    endpoint: 'alerts-webhook',
    timestamp: Date.now(),
    version: '1.0.0',
    accepts: ['POST'],
    authentication: 'Bearer token required',
  };

  return createSuccessResponse(responseData, 200);
}, {
  enableErrorLogging: false,
  enablePerformanceLogging: false,
  enableRequestLogging: false,
  requestTimeoutMs: 5000,
});