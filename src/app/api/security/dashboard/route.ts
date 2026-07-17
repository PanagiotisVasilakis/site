import { NextRequest } from 'next/server';

import { isAdminRequest } from '@/lib/rbac';
import { getSecurityConfig } from '@/lib/security-config';

type PrismaClient = typeof import('@/lib/prisma').prisma;

async function unauthorized(request: NextRequest): Promise<Response | null> {
  return await isAdminRequest(request) ? null : Response.json({ error: 'Unauthorized' }, { status: 401 });
}

async function metricsSince(prisma: PrismaClient, since: Date) {
  const [totalEvents, byType, bySeverity, activeAlerts] = await Promise.all([
    prisma.securityAuditEvent.count({ where: { occurredAt: { gte: since } } }),
    prisma.securityAuditEvent.groupBy({
      by: ['eventType'], where: { occurredAt: { gte: since } }, _count: { _all: true },
      orderBy: { _count: { eventType: 'desc' } },
    }),
    prisma.securityAuditEvent.groupBy({
      by: ['severity'], where: { occurredAt: { gte: since } }, _count: { _all: true },
      orderBy: { _count: { severity: 'desc' } },
    }),
    prisma.alert.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED'] } } }),
  ]);
  return {
    totalEvents,
    eventsByType: Object.fromEntries(byType.map((row) => [row.eventType, row._count._all])),
    eventsBySeverity: Object.fromEntries(bySeverity.map((row) => [row.severity, row._count._all])),
    activeAlerts,
    since: since.toISOString(),
    generatedAt: new Date().toISOString(),
  };
}

function minutesParam(request: NextRequest): number {
  const value = Number.parseInt(request.nextUrl.searchParams.get('minutes') || '60', 10);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1), 10_080) : 60;
}

export async function GET(request: NextRequest) {
  const rejected = await unauthorized(request);
  if (rejected) return rejected;
  const { prisma } = await import('@/lib/prisma');

  const endpoint = request.nextUrl.searchParams.get('endpoint') || 'dashboard';
  const minutes = minutesParam(request);
  const since = new Date(Date.now() - minutes * 60_000);
  const recentEvents = () => prisma.securityAuditEvent.findMany({
    where: { occurredAt: { gte: since } },
    orderBy: { occurredAt: 'desc' },
    take: 200,
    select: {
      id: true,
      eventType: true,
      severity: true,
      correlationId: true,
      path: true,
      details: true,
      occurredAt: true,
    },
  });

  if (endpoint === 'metrics') return Response.json(await metricsSince(prisma, since));
  if (endpoint === 'events') {
    const events = await recentEvents();
    return Response.json({ events, count: events.length, minutes });
  }
  if (endpoint === 'health') {
    const config = getSecurityConfig();
    const critical = await prisma.securityAuditEvent.count({
      where: { severity: 'critical', occurredAt: { gte: new Date(Date.now() - 15 * 60_000) } },
    });
    const checks = {
      monitoringEnabled: config.monitoring.enabled,
      cspEnabled: config.csp.enabled,
      hstsEnabled: config.headers.hsts.enabled,
      recentCriticalEvents: critical === 0,
    };
    return Response.json({
      status: critical > 0 ? 'critical' : Object.values(checks).every(Boolean) ? 'healthy' : 'warning',
      checks,
      criticalEventsLast15Minutes: critical,
    });
  }
  if (endpoint === 'report') {
    const type = request.nextUrl.searchParams.get('type') || 'daily';
    if (type !== 'daily' && type !== 'trends') return Response.json({ error: 'Invalid report type' }, { status: 400 });
    const reportMinutes = type === 'daily' ? 1_440 : 10_080;
    const reportSince = new Date(Date.now() - reportMinutes * 60_000);
    return Response.json({ type, report: await metricsSince(prisma, reportSince) });
  }
  if (endpoint === 'dashboard') {
    const [metrics, events] = await Promise.all([metricsSince(prisma, since), recentEvents()]);
    return Response.json({
      metrics,
      recentEvents: events.slice(0, 20),
      summary: {
        totalEvents: metrics.totalEvents,
        activeAlerts: metrics.activeAlerts,
        topThreats: Object.entries(metrics.eventsByType).slice(0, 5).map(([type, count]) => ({ type, count })),
      },
    });
  }
  return Response.json({ error: 'Invalid endpoint' }, { status: 400 });
}
