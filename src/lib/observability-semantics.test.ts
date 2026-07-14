import { NextRequest, NextResponse } from 'next/server';
import { AlertingSystem } from './alerting-system';
import { withErrorHandler } from './apiErrorHandler';
import { metrics } from './metrics-collector';

describe('HTTP observability semantics', () => {
  it('separates client failures from server errors', async () => {
    const since = Date.now() - 1;
    const clientRoute = withErrorHandler(async () => new NextResponse(null, { status: 404 }), {
      enableErrorLogging: false,
      enablePerformanceLogging: false,
    });
    const serverRoute = withErrorHandler(async () => new NextResponse(null, { status: 503 }), {
      enableErrorLogging: false,
      enablePerformanceLogging: false,
    });
    const context = { params: Promise.resolve({}) };

    await clientRoute(new NextRequest('http://localhost/api/semantic-client'), context);
    await serverRoute(new NextRequest('http://localhost/api/semantic-server'), context);

    expect(metrics.getMetrics('http.client_errors', since).some(
      (metric) => metric.tags?.route === '/api/semantic-client' && metric.tags.status === '404',
    )).toBe(true);
    expect(metrics.getMetrics('http.errors', since).some(
      (metric) => metric.tags?.route === '/api/semantic-client',
    )).toBe(false);
    expect(metrics.getMetrics('http.errors', since).some(
      (metric) => metric.tags?.route === '/api/semantic-server' && metric.tags.status === '503',
    )).toBe(true);
  });

  it('uses a summed, non-zero threshold for the server-error alert', () => {
    const system = new AlertingSystem({ autoStart: false });
    expect(system.getRule('high-error-rate')).toEqual(expect.objectContaining({
      metric: 'http.errors',
      aggregation: 'sum',
      threshold: 5,
    }));
    system.destroy();
  });
});
