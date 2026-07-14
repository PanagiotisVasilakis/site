import { topPaths, hourBuckets, dayBuckets, dailyNewPaths } from '@/lib/analyticsRepository';
import { verifyAdminSession } from '@/lib/auth/admin';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger-enterprise';
import { csvRow } from '@/lib/csv';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Extract JWT token from cookies
    const token = req.cookies.get('admin_jwt')?.value;
    if (!token) {
      logger.warn('Analytics export attempt without token');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Verify admin authentication
    const adminPayload = await verifyAdminSession(token);
    if (!adminPayload || adminPayload.role !== 'admin') {
      logger.warn('Invalid admin token for analytics export');
      return new Response('Unauthorized', { status: 401 });
    }
    
    const [top, hours, days, newPaths] = await Promise.all([
      topPaths(100),
      hourBuckets(),
      dayBuckets(),
      dailyNewPaths(),
    ]);
    
    let csv = csvRow(['section', 'type', 'value', 'count']);
    
    // Sanitize data to prevent CSV injection
    for (const r of top) {
      csv += csvRow(['top', 'path', String(r.path).slice(0, 200), r.count]);
    }
    
    for (const h of hours) {
      csv += csvRow(['hour', 'start', new Date(h.start).toISOString(), h.count]);
    }
    
    for (const d of days) {
      csv += csvRow(['day', 'start', new Date(d.start).toISOString(), d.count]);
    }
    
    for (const n of newPaths) {
      csv += csvRow(['new_paths', 'start', new Date(n.start).toISOString(), n.new]);
    }
    
    logger.info('Analytics export accessed by admin', { admin: adminPayload.role });
    
    return new Response(csv, { 
      headers: { 
        'content-type': 'text/csv', 
        'cache-control': 'no-store, private',
        'content-disposition': `attachment; filename="analytics-export-${new Date().toISOString().split('T')[0]}.csv"`
      } 
    });
    
  } catch (error) {
    logger.error('Analytics export failed', {}, error instanceof Error ? error : new Error(String(error)));
    return new Response('Internal Server Error', { status: 500 });
  }
}
