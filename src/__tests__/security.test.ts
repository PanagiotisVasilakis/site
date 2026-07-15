/**
 * Security Framework Tests
 * Comprehensive tests for security middleware and configuration
 */

import { NextRequest } from 'next/server';
import {
  SecurityHeadersMiddleware,
  RateLimitMiddleware,
  CORSMiddleware,
  createSecurityMiddleware
} from '@/lib/security-middleware-edge';
import {
  APIInputValidationMiddleware,
  APIKeyAuthMiddleware,
  createAPISecurityMiddleware
} from '@/lib/api-security-middleware';
import {
  getSecurityConfig,
  buildCSPDirective,
  generateNonce,
  buildPermissionsPolicy
} from '@/lib/security-config';
import {
  getSecurityMonitor,
  recordSecurityEvent,
  handleCSPViolation,
  getSecurityHealthStatus
} from '@/lib/security-monitoring';

// Mock environment
vi.mock('process', () => ({
  env: {
    NODE_ENV: 'test',
    ADMIN_DASH_SECRET: 'test-secret',
    // Include the 32+ char key used in the test above
    VALID_API_KEYS: 'testkey123testkey123testkey12345,test-key-456',
  }
}));

describe('Security Configuration', () => {
  test('should load security config', () => {
    const config = getSecurityConfig();
    expect(config).toBeDefined();
    expect(config.csp.enabled).toBe(true);
    expect(config.headers).toBeDefined();
    expect(config.rateLimit).toBeDefined();
    expect(config.cors).toBeDefined();
    expect(config.monitoring).toBeDefined();
    expect(config.apiSecurity).toBeDefined();
  });

  test('should build CSP directive correctly', () => {
    const directives = {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    };

    const csp = buildCSPDirective(directives);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' https://fonts.googleapis.com");
  });

  test('should use exactly the request nonce for scripts', () => {
    const directives = getSecurityConfig().csp.directives;
    const csp = buildCSPDirective(directives, 'request-nonce');
    const scriptDirective = csp.split('; ').find((directive) => directive.startsWith('script-src'));

    expect(scriptDirective).toContain("'nonce-request-nonce'");
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(csp.match(/nonce-/g)).toHaveLength(1);
  });

  test('should generate valid nonce', () => {
    const nonce = generateNonce();
    expect(nonce).toBeDefined();
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(8);
  });

  test('should build permissions policy', () => {
    const permissions = {
      geolocation: ['self', 'https://maps.example.com'],
      microphone: ["'self'"],
      camera: [],
      payment: ['*'],
      accelerometer: [],
      gyroscope: [],
      magnetometer: [],
      usb: [],
    };

    const policy = buildPermissionsPolicy(permissions);
    expect(policy).toBe(
      'geolocation=(self "https://maps.example.com"), microphone=(self), camera=(), payment=(*), accelerometer=(), gyroscope=(), magnetometer=(), usb=()',
    );
  });
});

describe('Security Headers Middleware', () => {
  let middleware: SecurityHeadersMiddleware;

  beforeEach(() => {
    middleware = new SecurityHeadersMiddleware();
  });

  test('should add security headers to response', () => {
    const request = new NextRequest('https://example.com/test');
    const response = middleware.handle(request);

    expect(response.headers.get('X-Frame-Options')).toBeTruthy();
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Referrer-Policy')).toBeTruthy();
    expect(response.headers.get('Permissions-Policy')).toBeTruthy();
  });

  test('should skip security headers for excluded paths', () => {
    const middleware = new SecurityHeadersMiddleware({
      skipPaths: ['/api/health']
    });

    const request = new NextRequest('https://example.com/api/health');
    const response = middleware.handle(request);

    // Should return NextResponse.next() without additional headers
    expect(response.headers.get('X-Frame-Options')).toBeFalsy();
  });

  test('should add CSP headers when enabled', () => {
    const request = new NextRequest('https://example.com/test');
    const response = middleware.handle(request);

    const cspHeader = response.headers.get('Content-Security-Policy-Report-Only') ||
      response.headers.get('Content-Security-Policy');
    expect(cspHeader).toBeTruthy();
    expect(cspHeader).toContain("default-src 'self'");
  });
});

describe('Rate Limiting Middleware', () => {
  let middleware: RateLimitMiddleware;

  beforeEach(() => {
    middleware = new RateLimitMiddleware();
  });

  test('should allow requests within limit', async () => {
    const request = new NextRequest('https://example.com/api/test');
    const response = await middleware.handle(request);

    expect(response).toBeNull(); // No blocking response
  });

  test('should block requests exceeding limit', async () => {
    const strictMiddleware = new RateLimitMiddleware();
    (strictMiddleware as unknown as { config: Record<string, unknown> }).config = {
      enabled: true,
      windowMs: 60_000,
      maxRequests: 2,
      standardHeaders: true,
      legacyHeaders: false,
    };
    process.env.TRUST_PROXY_MODE = 'hops';
    process.env.TRUST_PROXY_HOPS = '1';

    const request = new NextRequest('https://example.com/api/test', {
      headers: { 'x-forwarded-for': '192.0.2.10' },
    });

    expect(await strictMiddleware.handle(request)).toBeNull();
    expect(await strictMiddleware.handle(request)).toBeNull();

    const response = await strictMiddleware.handle(request);
    expect(response?.status).toBe(429);
    delete process.env.TRUST_PROXY_MODE;
    delete process.env.TRUST_PROXY_HOPS;
  });
});

describe('CORS Middleware', () => {
  let middleware: CORSMiddleware;

  beforeEach(() => {
    middleware = new CORSMiddleware();
  });

  test('should handle preflight requests', async () => {
    const request = new NextRequest('https://example.com/api/test', {
      method: 'OPTIONS',
      headers: {
        'origin': 'http://localhost:3000',
      },
    });

    const response = await middleware.handle(request);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  test('should block disallowed origins', async () => {
    const request = new NextRequest('https://example.com/api/test', {
      method: 'GET',
      headers: {
        'origin': 'https://malicious-site.com',
      },
    });

    const response = await middleware.handle(request);
    expect(response?.status).toBe(403);
  });

  test('does not perform CORS enforcement or persistence for non-API pages', async () => {
    const request = new NextRequest('https://example.com/en', {
      method: 'GET',
      headers: { origin: 'https://malicious-site.com' },
    });

    expect(await middleware.handle(request)).toBeNull();
  });

  test('should always allow the request own origin', async () => {
    const request = new NextRequest('https://same-origin.example/api/test', {
      method: 'POST',
      headers: { origin: 'https://same-origin.example' },
    });

    expect(await middleware.handle(request)).toBeNull();
  });

  test('uses the contacted Host header when Next normalizes the request URL origin', async () => {
    const request = new NextRequest('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        host: '127.0.0.1:3000',
        origin: 'http://127.0.0.1:3000',
      },
    });

    expect(await middleware.handle(request)).toBeNull();
  });

  test('does not treat a Host match with a different protocol as same-origin', async () => {
    const request = new NextRequest('https://example.com/api/test', {
      method: 'POST',
      headers: {
        host: 'example.com',
        origin: 'http://example.com',
      },
    });

    expect((await middleware.handle(request))?.status).toBe(403);
  });
});

describe('API Security Middleware', () => {
  test('should validate input payload size', async () => {
    const middleware = new APIInputValidationMiddleware();
    const request = new NextRequest('https://example.com/api/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '999999999', // Exceeds limit
      },
    });

    const response = await middleware.validateRequest(request);
    expect(response?.status).toBe(413);
  });

  test('should validate content types', async () => {
    const middleware = new APIInputValidationMiddleware();
    const request = new NextRequest('https://example.com/api/test', {
      method: 'POST',
      headers: {
        'content-type': 'text/html', // Invalid for API
      },
    });

    const response = await middleware.validateRequest(request);
    expect(response?.status).toBe(415);
  });

  test('should require an exact media type match', async () => {
    const middleware = new APIInputValidationMiddleware();
    const request = new NextRequest('https://example.com/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json-malicious' },
    });

    expect((await middleware.validateRequest(request))?.status).toBe(415);
  });
});

describe('API Key Authentication', () => {
  let middleware: APIKeyAuthMiddleware;
  beforeEach(() => {
    // Enable API key auth for tests by setting NODE_ENV to production temporarily
    vi.stubEnv('NODE_ENV', 'production');
    middleware = new APIKeyAuthMiddleware();
  });

  afterEach(() => {
    // Restore original NODE_ENV
    vi.unstubAllEnvs();
  });

  test('should require API key when enabled', async () => {
    const request = new NextRequest('https://example.com/api/protected');

    const response = await middleware.validateRequest(request);
    expect(response?.status).toBe(401);
  });

  test('should accept valid API key in header', async () => {
    const validKey = 'testkey123testkey123testkey12345';
    vi.stubEnv('VALID_API_KEYS', validKey);
    const localMiddleware = new APIKeyAuthMiddleware();
    const request = new NextRequest('https://example.com/api/protected', {
      headers: {
        // Use a 32-char alphanumeric key to satisfy format and be included via env
        'authorization': `Bearer ${validKey}`,
      },
    });

    const response = await localMiddleware.validateRequest(request);
    expect(response).toBeNull();
    // restore handled by afterEach if needed, but here we can just leave it since we're inside a test method
    // actually unstubAllEnvs in afterEach might be too late if others depend on it, 
    // but typically stubEnv is test-scoped
  });

  test('should reject invalid API key format', async () => {
    const request = new NextRequest('https://example.com/api/protected', {
      headers: {
        'authorization': 'Bearer invalid-key',
      },
    });

    const response = await middleware.validateRequest(request);
    expect(response?.status).toBe(401);
  });

  test('should enforce internal scope with a dedicated key', async () => {
    const readKey = '0123456789abcdef0123456789abcdef';
    const internalKey = 'fedcba9876543210fedcba9876543210';
    vi.stubEnv('VALID_API_KEYS', readKey);
    vi.stubEnv('INTERNAL_API_KEYS', internalKey);
    const localMiddleware = new APIKeyAuthMiddleware();

    const readRequest = new NextRequest('https://example.com/api/internal/cache-metrics', {
      headers: { 'x-api-key': readKey },
    });
    expect((await localMiddleware.validateRequest(readRequest, ['internal']))?.status).toBe(403);

    const internalRequest = new NextRequest('https://example.com/api/internal/cache-metrics', {
      headers: { 'x-api-key': internalKey },
    });
    expect(await localMiddleware.validateRequest(internalRequest, ['internal'])).toBeNull();
  });

  test('should not accept API keys from query parameters', async () => {
    const validKey = '0123456789abcdef0123456789abcdef';
    vi.stubEnv('VALID_API_KEYS', validKey);
    const localMiddleware = new APIKeyAuthMiddleware();
    const request = new NextRequest(`https://example.com/api/protected?api_key=${validKey}`);

    expect((await localMiddleware.validateRequest(request))?.status).toBe(401);
  });
});

describe('Security Monitoring', () => {
  beforeEach(() => {
    // Clear metrics before each test
    const monitor = getSecurityMonitor();
    monitor.clearMetrics();
  });

  test('should record security events', async () => {
    const event = {
      type: 'suspicious_activity' as const,
      severity: 'medium' as const,
      timestamp: new Date().toISOString(),
      ip: '192.168.1.100',
      url: 'https://example.com/test',
      details: { test: true },
    };

    await recordSecurityEvent(event);

    const monitor = getSecurityMonitor();
    const metrics = monitor.getMetrics();

    expect(metrics.totalEvents).toBe(1);
    expect(metrics.eventsByType['suspicious_activity']).toBe(1);
    expect(metrics.eventsBySeverity['medium']).toBe(1);
  });

  test('should handle CSP violations', async () => {
    const violationReport = {
      'document-uri': 'https://example.com/page',
      'violated-directive': 'script-src',
      'blocked-uri': 'https://malicious.com/script.js',
      'original-policy': "default-src 'self'",
    };

    const clientInfo = {
      ip: '192.168.1.100',
      userAgent: 'Mozilla/5.0...',
    };

    await handleCSPViolation(violationReport, clientInfo);

    const monitor = getSecurityMonitor();
    const metrics = monitor.getMetrics();

    expect(metrics.eventsByType['csp_violation']).toBe(1);
  });

  test('should calculate security health status', () => {
    const health = getSecurityHealthStatus();

    expect(health.status).toBeDefined();
    expect(['healthy', 'warning', 'critical']).toContain(health.status);
    expect(health.checks).toBeDefined();
    expect(health.message).toBeDefined();
  });

  test('should track recent events', async () => {
    const monitor = getSecurityMonitor();

    // Record some events
    for (let i = 0; i < 5; i++) {
      await recordSecurityEvent({
        type: 'rate_limit_exceeded',
        severity: 'medium',
        timestamp: new Date().toISOString(),
        ip: `192.168.1.${100 + i}`,
        url: 'https://example.com/api',
        details: { attempt: i + 1 },
      });
    }

    const recentEvents = monitor.getRecentEvents(60);
    expect(recentEvents).toHaveLength(5);
  });

  test('deduplicates repeated threshold alerts during the cooldown window', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const monitor = getSecurityMonitor();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    for (let i = 0; i < 51; i++) {
      monitor.recordEvent({
        type: 'rate_limit_exceeded',
        severity: 'medium',
        timestamp: new Date().toISOString(),
        ip: '192.168.1.100',
        url: 'https://example.com/api',
        details: { attempt: i + 1 },
      });
    }

    expect(monitor.getMetrics().alertsTriggered).toBe(1);
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe('Combined Security Middleware', () => {
  test('should create combined security middleware', () => {
    const middleware = createSecurityMiddleware();
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  test('should apply all security checks in sequence', async () => {
    const middleware = createSecurityMiddleware();
    const request = new NextRequest('https://example.com/api/test');

    const response = await middleware(request);
    expect(response).toBeDefined();

    // Should have security headers
    expect(response.headers.get('X-Frame-Options')).toBeTruthy();
  });

  test('should create API security middleware', () => {
    const middleware = createAPISecurityMiddleware();
    expect(middleware).toBeDefined();
    expect(typeof middleware).toBe('function');
  });

  test('should not block SQL-like API query strings in logging-only mode', async () => {
    const middleware = createAPISecurityMiddleware();
    const request = new NextRequest(
      'https://example.com/api/test?query=SELECT * FROM users WHERE id=1 OR 1=1'
    );

    const response = await middleware(request);
    expect(response).toBeNull();
  });

  test('should enforce route-level API keys in every environment', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const middleware = createAPISecurityMiddleware({ requireAPIKey: true });
    const response = await middleware(new NextRequest('https://example.com/api/internal'));
    expect(response?.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
