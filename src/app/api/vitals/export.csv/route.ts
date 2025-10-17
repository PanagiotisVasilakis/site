import { vitalsSummary, vitalsRecent } from '@/lib/analyticsStore';
import { verifyAdmin } from '@/lib/auth';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger-enterprise';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Extract JWT token from cookies
    const token = req.cookies.get('admin_jwt')?.value;
    if (!token) {
      logger.warn('Vitals export attempt without token', { 
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown'
      });
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Verify admin authentication
    const adminPayload = verifyAdmin(token);
    if (!adminPayload || adminPayload.role !== 'admin') {
      logger.warn('Invalid admin token for vitals export', { 
        ip: req.headers.get('x-forwarded-for') || 'unknown'
      });
      return new Response('Unauthorized', { status: 401 });
    }
    
    const summary = vitalsSummary();
    const recent = vitalsRecent(100); // up to 100 recent per metric
    
    let csv = 'metric,avg,p90,count\n';
    for (const v of summary) {
      // Sanitize metric names to prevent CSV injection
      const sanitizedName = String(v.name).replace(/[",\r\n]/g, '').substring(0, 50);
      csv += `"${sanitizedName}",${v.avg.toFixed(3)},${v.p90?.toFixed(3) || 'N/A'},${v.count}\n`;
    }
    
    csv += '\nmetric,id,timestamp,value\n';
    for (const [name, list] of Object.entries(recent)) {
      const sanitizedMetricName = String(name).replace(/[",\r\n]/g, '').substring(0, 50);
      for (const v of list) {
        const sanitizedId = String(v.id).replace(/[",\r\n]/g, '').substring(0, 100);
        csv += `"${sanitizedMetricName}","${sanitizedId}",${new Date(v.ts).toISOString()},${v.value}\n`;
      }
    }
    
    logger.info('Vitals export accessed by admin', { 
      admin: adminPayload.role,
      jti: adminPayload.jti
    });
    
    return new Response(csv, { 
      headers: { 
        'content-type': 'text/csv', 
        'cache-control': 'no-store, private',
        'content-disposition': `attachment; filename="vitals-export-${new Date().toISOString().split('T')[0]}.csv"`
      } 
    });
    
  } catch (error) {
    logger.error('Vitals export failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return new Response('Internal Server Error', { status: 500 });
  }
}
