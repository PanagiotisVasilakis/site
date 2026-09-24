/**
 * Security event sanitization and durable persistence.
 * Alerting on persisted events is handled by the DB-backed operational monitor.
 */

import crypto from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

import type { SecurityEvent } from '@/lib/security-config';
import { isSensitiveFieldName, redactSensitiveText } from '@/lib/redaction';
import { privacyHmac } from '@/lib/privacyHash';

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

// Convenience function for recording events
export async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  const sanitized = sanitizeEvent(event);
  if (process.env.NODE_ENV === 'development') {
    console.warn('🔐 Security Event:', {
      type: sanitized.event.type,
      severity: sanitized.event.severity,
      sourceHash: sanitized.event.ip,
      url: sanitized.event.url,
      details: sanitized.event.details,
    });
  }
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
