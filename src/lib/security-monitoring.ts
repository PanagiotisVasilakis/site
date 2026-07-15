/**
 * Security Monitoring and Reporting
 * Enterprise-grade security monitoring with alerting and reporting capabilities
 */

import crypto from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

import {
  getSecurityConfig, 
  type SecurityEvent 
} from '@/lib/security-config';
import { isSensitiveFieldName, redactSensitiveText } from '@/lib/redaction';
import { privacyHmac } from '@/lib/privacyHash';

// Security metrics collection
interface SecurityMetrics {
  totalEvents: number;
  eventsByType: Record<string, number>;
  eventsBySeverity: Record<string, number>;
  topIPs: Array<{ ip: string; count: number }>;
  alertsTriggered: number;
  lastUpdated: string;
}

function redactText(value: string): string {
  return redactSensitiveText(value, 500);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 2) return '[TRUNCATED]';
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  if (typeof value === 'object' && value) {
    return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, entry]) => [
      key.slice(0, 100),
      isSensitiveFieldName(key) ? '[REDACTED]' : sanitizeValue(entry, depth + 1),
    ]));
  }
  return String(value).slice(0, 200);
}

function pathnameOnly(rawUrl: string): string {
  if (!rawUrl || rawUrl === 'unknown') return 'unknown';
  try {
    return new URL(rawUrl, 'http://localhost').pathname.slice(0, 512);
  } catch {
    return 'invalid';
  }
}

function sanitizeEvent(event: SecurityEvent): { event: SecurityEvent; ipHash: string | null } {
  const ipHash = event.ip && event.ip !== 'unknown'
    ? privacyHmac(event.ip, 'security-event-ip:v1')
    : null;
  return {
    ipHash,
    event: {
      type: event.type,
      severity: event.severity,
      timestamp: Number.isNaN(Date.parse(event.timestamp)) ? new Date().toISOString() : event.timestamp,
      ip: ipHash ?? 'unknown',
      url: pathnameOnly(event.url),
      details: sanitizeValue(event.details) as Record<string, unknown>,
    },
  };
}

async function persistSecurityEvent(event: SecurityEvent, ipHash: string | null): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  const { prisma } = await import('@/lib/prisma');
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '1800ms'");
    await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '500ms'");
    await tx.securityAuditEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventType: event.type,
        severity: event.severity,
        ipHash,
        path: event.url === 'unknown' ? null : event.url,
        details: event.details as Prisma.InputJsonValue,
        occurredAt: new Date(event.timestamp),
      },
    });
  }, { maxWait: 1_000, timeout: 2_500 });
}

class SecurityMonitor {
  private metrics: SecurityMetrics = {
    totalEvents: 0,
    eventsByType: {},
    eventsBySeverity: {},
    topIPs: [],
    alertsTriggered: 0,
    lastUpdated: new Date().toISOString(),
  };

  private eventBuffer: SecurityEvent[] = [];
  private readonly lastAlertAt = new Map<string, number>();
  private readonly MAX_BUFFER_SIZE = 1000;
  private readonly ALERT_COOLDOWN_MS = 5 * 60 * 1000;
  private readonly ALERT_THRESHOLDS = {
    high_severity_events: 5, // Alert after 5 high severity events in 5 minutes
    total_events_per_minute: 50, // Alert after 50 events per minute
    unique_ips_threshold: 20, // Alert after 20 unique IPs in suspicious activity
  };

  public recordEvent(rawEvent: SecurityEvent): { event: SecurityEvent; ipHash: string | null } {
    const sanitized = sanitizeEvent(rawEvent);
    const event = sanitized.event;
    // Add to buffer
    this.eventBuffer.push(event);
    
    // Maintain buffer size
    if (this.eventBuffer.length > this.MAX_BUFFER_SIZE) {
      this.eventBuffer.shift();
    }

    // Update metrics
    this.updateMetrics(event);

    // Check for alerts
    this.checkAlerts();

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.warn('🔐 Security Event:', {
        type: event.type,
        severity: event.severity,
        sourceHash: event.ip,
        url: event.url,
        details: event.details,
      });
    }
    return sanitized;
  }

  private updateMetrics(event: SecurityEvent): void {
    this.metrics.totalEvents++;
    this.metrics.eventsByType[event.type] = (this.metrics.eventsByType[event.type] || 0) + 1;
    this.metrics.eventsBySeverity[event.severity] = (this.metrics.eventsBySeverity[event.severity] || 0) + 1;
    
    // Update top IPs
    const existingIP = this.metrics.topIPs.find(item => item.ip === event.ip);
    if (existingIP) {
      existingIP.count++;
    } else {
      this.metrics.topIPs.push({ ip: event.ip, count: 1 });
    }
    
    // Sort and limit top IPs
    this.metrics.topIPs.sort((a, b) => b.count - a.count);
    this.metrics.topIPs = this.metrics.topIPs.slice(0, 10);
    
    this.metrics.lastUpdated = new Date().toISOString();
  }

  private checkAlerts(): void {
    const config = getSecurityConfig();
    if (!config.monitoring.alertOnViolations) return;

    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    const recentEvents = this.eventBuffer.filter(e => 
      new Date(e.timestamp).getTime() > fiveMinutesAgo
    );

    // Check for high severity events
    const highSeverityEvents = recentEvents.filter(e => 
      e.severity === 'high' || e.severity === 'critical'
    );

    if (highSeverityEvents.length >= this.ALERT_THRESHOLDS.high_severity_events) {
      this.triggerAlert('high_severity_threshold', {
        count: highSeverityEvents.length,
        threshold: this.ALERT_THRESHOLDS.high_severity_events,
        eventTypes: highSeverityEvents.slice(-5).map((event) => event.type),
      });
    }

    // Check for event rate
    const oneMinuteAgo = now - (60 * 1000);
    const recentMinuteEvents = this.eventBuffer.filter(e => 
      new Date(e.timestamp).getTime() > oneMinuteAgo
    );

    if (recentMinuteEvents.length >= this.ALERT_THRESHOLDS.total_events_per_minute) {
      this.triggerAlert('high_event_rate', {
        eventsPerMinute: recentMinuteEvents.length,
        threshold: this.ALERT_THRESHOLDS.total_events_per_minute,
      });
    }

    // Check for suspicious IP activity
    const uniqueIPs = new Set(recentEvents.map(e => e.ip)).size;
    if (uniqueIPs >= this.ALERT_THRESHOLDS.unique_ips_threshold) {
      this.triggerAlert('suspicious_ip_activity', {
        uniqueIPs,
        threshold: this.ALERT_THRESHOLDS.unique_ips_threshold,
        timeWindow: '5 minutes',
      });
    }
  }

  private triggerAlert(alertType: string, data: Record<string, unknown>): void {
    const now = Date.now();
    const previousAlert = this.lastAlertAt.get(alertType);
    if (previousAlert !== undefined && now - previousAlert < this.ALERT_COOLDOWN_MS) return;
    this.lastAlertAt.set(alertType, now);
    this.metrics.alertsTriggered++;
    
    const alert = {
      type: alertType,
      timestamp: new Date().toISOString(),
      data,
    };

    // Log alert
    console.error('🚨 Security Alert:', alert);

  }

}

// Singleton instance
let securityMonitor: SecurityMonitor | null = null;

function getSecurityMonitor(): SecurityMonitor {
  if (!securityMonitor) {
    securityMonitor = new SecurityMonitor();
  }
  return securityMonitor;
}

// Convenience function for recording events
export async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  const monitor = getSecurityMonitor();
  const sanitized = monitor.recordEvent(event);
  try {
    await persistSecurityEvent(sanitized.event, sanitized.ipHash);
  } catch (error) {
    console.error('Failed to persist security event', {
      type: sanitized.event.type,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

// CSP violation reporter
type CspReport = {
  'document-uri'?: string;
  'violated-directive'?: string;
  'blocked-uri'?: string;
  'original-policy'?: string;
  'source-file'?: string;
  'line-number'?: number;
  'column-number'?: number;
  [key: string]: unknown;
};

export async function handleCSPViolation(
  violationReport: CspReport, 
  request: { ip?: string; userAgent?: string }
): Promise<void> {
  const event: SecurityEvent = {
    type: 'csp_violation',
    severity: 'medium',
    timestamp: new Date().toISOString(),
    ip: request.ip || 'unknown',
    userAgent: request.userAgent,
    url: violationReport['document-uri'] || 'unknown',
    details: {
      violatedDirective: violationReport['violated-directive'],
      blockedURI: violationReport['blocked-uri'],
      originalPolicy: violationReport['original-policy'],
      sourceFile: violationReport['source-file'],
      lineNumber: violationReport['line-number'],
      columnNumber: violationReport['column-number'],
    },
  };

  await recordSecurityEvent(event);
}
