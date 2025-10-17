import { topPaths, hourBuckets, dayBuckets, dailyNewPaths } from '@/lib/analyticsStore';
import { verifyAdmin } from '@/lib/auth/admin';
import { NextRequest } from 'next/server';
import { logger } from '@/lib/logger-enterprise';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    // Extract JWT token from cookies
    const token = req.cookies.get('admin_jwt')?.value;
    if (!token) {
      logger.warn('Analytics export attempt without token', { 
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown'
      });
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Verify admin authentication
    const adminPayload = verifyAdmin(token);
    if (!adminPayload || adminPayload.role !== 'admin') {
      logger.warn('Invalid admin token for analytics export', { 
        ip: req.headers.get('x-forwarded-for') || 'unknown'
      });
      return new Response('Unauthorized', { status: 401 });
    }
    
    const top = topPaths(100);
    const hours = hourBuckets();
    const days = dayBuckets();
    const newPaths = dailyNewPaths();
    
    let csv = 'section,type,value,count\n';
    
    // Sanitize data to prevent CSV injection
    for (const r of top) {
      const sanitizedPath = String(r.path).replace(/[",\r\n]/g, '').substring(0, 200);
      csv += `top,path,"${sanitizedPath}",${r.count}\n`;
    }
    
    for (const h of hours) {
      csv += `hour,start,${new Date(h.start).toISOString()},${h.count}\n`;
    }
    
    for (const d of days) {
      csv += `day,start,${new Date(d.start).toISOString()},${d.count}\n`;
    }
    
    for (const n of newPaths) {
      csv += `new_paths,start,${new Date(n.start).toISOString()},${n.new}\n`;
    }
    
    logger.info('Analytics export accessed by admin', { 
      admin: adminPayload.role,
      jti: adminPayload.jti
    });
    
    return new Response(csv, { 
      headers: { 
        'content-type': 'text/csv', 
        'cache-control': 'no-store, private',
        'content-disposition': `attachment; filename="analytics-export-${new Date().toISOString().split('T')[0]}.csv"`
      } 
    });
    
  } catch (error) {
    logger.error('Analytics export failed', { 
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    return new Response('Internal Server Error', { status: 500 });
  }
}