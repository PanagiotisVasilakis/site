/**
 * Security Dashboard API
 * Provides security metrics and status for admin dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  getSecurityMonitor, 
  getSecurityHealthStatus,
  securityReportGenerator 
} from '@/lib/security-monitoring';
import { verifyAdmin } from '@/lib/auth/admin';

function getClientIP(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }
  
  return realIP || 'unknown';
}

function requireAuth(request: NextRequest): boolean {
  // Check admin secret
  const secret = process.env.ADMIN_DASH_SECRET;
  const provided = request.headers.get('x-admin-secret') || 
                   new URL(request.url).searchParams.get('token');
  
  // Parse JWT token from cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const jwt = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith('admin_jwt='))
    ?.split('=', 2)[1];
  
  // Require both secret and valid JWT
  return !!(secret && provided === secret && jwt && verifyAdmin(jwt));
}

export async function GET(request: NextRequest) {
  // Verify authentication
  if (!requireAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get('endpoint');

    const monitor = getSecurityMonitor();

    switch (endpoint) {
      case 'metrics':
        return NextResponse.json(monitor.getMetrics());

      case 'health':
        return NextResponse.json(getSecurityHealthStatus());

      case 'events':
        const minutes = parseInt(searchParams.get('minutes') || '60', 10);
        const events = monitor.getRecentEvents(minutes);
        return NextResponse.json({ events, count: events.length });

      case 'report':
        const reportType = searchParams.get('type') || 'daily';
        
        if (reportType === 'daily') {
          const report = securityReportGenerator.generateDailyReport();
          return NextResponse.json({ report, type: 'daily' });
        } else if (reportType === 'trends') {
          const trends = securityReportGenerator.generateWeeklyTrends();
          return NextResponse.json({ trends, type: 'weekly' });
        } else {
          return NextResponse.json({ error: 'Invalid report type' }, { status: 400 });
        }

      case 'dashboard':
        // Return comprehensive dashboard data
        const [metrics, health, recentEvents] = [
          monitor.getMetrics(),
          getSecurityHealthStatus(),
          monitor.getRecentEvents(60),
        ];

        return NextResponse.json({
          metrics,
          health,
          recentEvents: recentEvents.slice(-20), // Last 20 events
          summary: {
            totalEvents: metrics.totalEvents,
            alertsTriggered: metrics.alertsTriggered,
            healthStatus: health.status,
            topThreats: Object.entries(metrics.eventsByType)
              .sort(([,a], [,b]) => b - a)
              .slice(0, 5)
              .map(([type, count]) => ({ type, count })),
          },
        });

      default:
        return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
    }
  } catch (error) {
    console.error('Security dashboard API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  // Verify authentication
  if (!requireAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action } = body;

    const monitor = getSecurityMonitor();

    switch (action) {
      case 'clear_metrics':
        monitor.clearMetrics();
        return NextResponse.json({ success: true, message: 'Metrics cleared' });

      case 'test_alert':
        // Trigger a test security event for testing alerts
        const testEvent = {
          type: 'suspicious_activity' as const,
          severity: 'medium' as const,
          timestamp: new Date().toISOString(),
          ip: getClientIP(request),
          userAgent: request.headers.get('user-agent') || undefined,
          url: request.url,
          details: {
            reason: 'Test alert triggered from admin dashboard',
            source: 'admin_dashboard',
          },
        };
        
        monitor.recordEvent(testEvent);
        return NextResponse.json({ 
          success: true, 
          message: 'Test alert triggered',
          event: testEvent,
        });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Security dashboard POST error:', error);
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    );
  }
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Secret',
    },
  });
}