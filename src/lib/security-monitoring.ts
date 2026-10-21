/**
 * Security event sanitization and durable persistence.
 * Alerting on persisted events is handled by the DB-backed operational monitor.
 */

import crypto from 'node:crypto';
import type { Prisma } from '@/generated/prisma/client';

import { logger } from '@/lib/logger-enterprise';
import type { SecurityEvent } from '@/lib/security-config';
import { isSensitiveFieldName, redactSensitiveText } from '@/lib/redaction';
import { privacyHmac } from '@/lib/privacyHash';

// A row is stored per accepted CSP report, so the fields that can be long are cut to what identifies the violation.
const STORED_DIRECTIVE_CHARS = 100;
const STORED_URL_CHARS = 256;

function redactText(value: string): string {
  return redactSensitiveText(value, 500);
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  // An absent field stays absent: it is never stored as the text "undefined".
  if (value === undefined) return undefined;
  if (depth > 2) return '[TRUNCATED]';
  if (typeof value === 'string') return redactText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  // JSON has no undefined; an array slot keeps its position as null.
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1) ?? null);
  if (typeof value === 'object' && value) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .slice(0, 30)
      .map(([key, entry]) => [
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

/**
 * Reduce a CSP report URL to origin + path. Query strings and fragments can
 * carry tokens; `data:`/`blob:` payloads are reduced to their scheme and CSP
 * keywords (`inline`, `eval`, …) are kept as they are.
 */
function reportUrlWithoutQuery(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return undefined;
  const scheme = /^([a-z][a-z\d+.-]*):/iu.exec(rawUrl)?.[1]?.toLowerCase();
  if (!scheme) return rawUrl.slice(0, 64);
  if (scheme !== 'http' && scheme !== 'https') return `${scheme}:`;
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.origin}${parsed.pathname}`.slice(0, STORED_URL_CHARS);
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

/**
 * Application-log-only record for high-volume diagnostics that any client can
 * trigger before authentication (CORS and request-shape violations). Writing
 * them to PostgreSQL would let a single client drive one INSERT per request;
 * they are medium severity and feed no alert rule.
 */
export function logSecurityDiagnostic(event: SecurityEvent): void {
  const sanitized = sanitizeEvent(event);
  logger.warn('Security diagnostic', {
    type: sanitized.event.type,
    severity: sanitized.event.severity,
    sourceHash: sanitized.event.ip,
    path: sanitized.event.url,
    details: sanitized.event.details,
  });
}

// Convenience function for recording events
async function recordSecurityEvent(event: SecurityEvent): Promise<void> {
  const sanitized = sanitizeEvent(event);
  logger.debug('Security event', {
    type: sanitized.event.type,
    severity: sanitized.event.severity,
    sourceHash: sanitized.event.ip,
    url: sanitized.event.url,
    details: sanitized.event.details,
  });
  try {
    await persistSecurityEvent(sanitized.event, sanitized.ipHash);
  } catch (error) {
    logger.error('Failed to persist security event', {
      type: sanitized.event.type,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

// CSP violation reporter
type CspReport = {
  'document-uri'?: string;
  'violated-directive'?: string;
  'effective-directive'?: string;
  'blocked-uri'?: string;
  disposition?: 'enforce' | 'report';
  'status-code'?: number;
  'source-file'?: string;
  'line-number'?: number;
  'column-number'?: number;
  [key: string]: unknown;
};

export async function handleCSPViolation(
  violationReport: CspReport, 
  request: { ip?: string }
): Promise<void> {
  const violatedDirective = violationReport['violated-directive']?.slice(0, STORED_DIRECTIVE_CHARS);
  const effectiveDirective = violationReport['effective-directive']?.slice(0, STORED_DIRECTIVE_CHARS);
  const event: SecurityEvent = {
    type: 'csp_violation',
    severity: 'medium',
    timestamp: new Date().toISOString(),
    ip: request.ip || 'unknown',
    url: violationReport['document-uri'] || 'unknown',
    // `referrer`, `script-sample` and `original-policy` (the one static policy) are accepted by the
    // route but never stored; the effective directive only when it adds to the violated one.
    details: {
      violatedDirective,
      effectiveDirective: effectiveDirective === violatedDirective ? undefined : effectiveDirective,
      disposition: violationReport.disposition,
      statusCode: violationReport['status-code'],
      blockedURI: reportUrlWithoutQuery(violationReport['blocked-uri']),
      sourceFile: reportUrlWithoutQuery(violationReport['source-file']),
      lineNumber: violationReport['line-number'],
      columnNumber: violationReport['column-number'],
    },
  };

  await recordSecurityEvent(event);
}
