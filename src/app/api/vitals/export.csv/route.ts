import { vitalsSummary, vitalsRecent } from '@/lib/analyticsRepository';
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
      logger.warn('Vitals export attempt without token');
      return new Response('Unauthorized', { status: 401 });
    }
    
    // Verify admin authentication
    const adminPayload = await verifyAdminSession(token);
    if (!adminPayload || adminPayload.role !== 'admin') {
      logger.warn('Invalid admin token for vitals export');
      return new Response('Unauthorized', { status: 401 });
    }
    
    const [summary, recent] = await Promise.all([
      vitalsSummary(),
      vitalsRecent(100),
    ]); // up to 100 recent per metric
    
    let csv = csvRow(['metric', 'avg', 'p90', 'count']);
    for (const v of summary) {
      csv += csvRow([String(v.name).slice(0, 50), v.avg.toFixed(3), v.p90?.toFixed(3) ?? 'N/A', v.count]);
    }
    
    csv += `\n${csvRow(['metric', 'id', 'timestamp', 'value'])}`;
    for (const [name, list] of Object.entries(recent)) {
      for (const v of list) {
        csv += csvRow([
          String(name).slice(0, 50),
          String(v.id).slice(0, 100),
          new Date(v.ts).toISOString(),
          v.value,
        ]);
      }
    }
    
    logger.info('Vitals export accessed by admin', { admin: adminPayload.role });
    
    return new Response(csv, { 
      headers: { 
        'content-type': 'text/csv', 
        'cache-control': 'no-store, private',
        'content-disposition': `attachment; filename="vitals-export-${new Date().toISOString().split('T')[0]}.csv"`
      } 
    });
    
  } catch (error) {
    logger.error('Vitals export failed', {}, error instanceof Error ? error : new Error(String(error)));
    return new Response('Internal Server Error', { status: 500 });
  }
}
