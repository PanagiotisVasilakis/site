import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';
import { verifyAdmin } from '@/lib/auth';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

function parseLcovSummary(lcovPath: string) {
  try {
    // Validate that the path is within expected directory to prevent path traversal
    const normalizedPath = path.normalize(lcovPath);
    const expectedDir = path.join(process.cwd(), 'coverage');
    if (!normalizedPath.startsWith(expectedDir)) {
      logger.warn('Invalid lcov path attempted', { path: lcovPath });
      return null;
    }
    
    if (!fs.existsSync(normalizedPath)) return null;
    const data = fs.readFileSync(normalizedPath, 'utf-8');
    
    // Look for end_of_record groups with lines coverage: LH: x, LF: y
    let linesPct: number | null = null;
    const lines = data.split(/\n+/);
    let metrics: Record<string, number> = {};
    for (const line of lines) {
      if (/^end_of_record/.test(line)) {
        if (metrics.LH != null && metrics.LF) {
          linesPct = Math.round((metrics.LH / metrics.LF) * 100);
        }
        metrics = {};
      } else if (line.includes(':')) {
        const [k,v] = line.split(':');
        const num = parseInt(v, 10);
        if (!isNaN(num)) metrics[k] = num;
      }
    }
    return linesPct;
  } catch (err) { 
    logger.error('LCOV parsing failed', { error: String(err) });
    return null; 
  }
}

export async function GET(req: NextRequest) {
  try {
    // Disable coverage endpoint in production for security
    if (process.env.NODE_ENV === 'production') {
      return new Response('Not Available', { status: 404 });
    }
    
    // Require admin authentication in development
    const token = req.cookies.get('admin_jwt')?.value;
    if (token) {
      const adminPayload = verifyAdmin(token);
      if (!adminPayload || adminPayload.role !== 'admin') {
        return new Response('Unauthorized', { status: 401 });
      }
    } else {
      // In development without auth, add warning header
      logger.warn('Coverage endpoint accessed without authentication');
    }
    
    const pct = parseLcovSummary(path.join(process.cwd(), 'coverage', 'lcov.info'));
    const value = pct != null ? `${pct}%` : 'n/a';
    const badge = {
      schemaVersion: 1,
      label: 'coverage',
      message: value,
      color: pct == null ? 'lightgrey' : pct > 85 ? 'brightgreen' : pct > 70 ? 'yellowgreen' : 'orange'
    };
    
    return new Response(JSON.stringify(badge), { 
      headers: { 
        'content-type': 'application/json', 
        'cache-control': 'no-store, private',
        'x-content-type-options': 'nosniff'
      } 
    });
    
  } catch (error) {
    logger.error('Coverage endpoint failed', { 
      error: error instanceof Error ? error.message : String(error)
    });
    return new Response('Internal Server Error', { status: 500 });
  }
}