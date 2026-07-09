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
} from '@/lib/security-middleware';
import {
  APIInputValidationMiddleware,
  SQLInjectionProtectionMiddleware,
  XSSProtectionMiddleware,
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

    expect(csp).toMatch(/script-src [^;]*'nonce-request-nonce'/);
    expect(csp).not.toContain("'unsafe-inline'");
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
      geolocation: [],
      microphone: ["'self'"],
      camera: [],
      payment: [],
      accelerometer: [],
      gyroscope: [],
      magnetometer: [],
      usb: [],
    };

    const policy = buildPermissionsPolicy(permissions);
    expect(policy).toContain('geolocation=()');
    expect(policy).toContain('microphone=("\'self\'")');
    expect(policy).toContain('camera=()');
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

  test.skip('should block requests exceeding limit', async () => {
    // Temporarily set NODE_ENV to production for stricter limits (100 req/min)
    vi.stubEnv('NODE_ENV', 'production');
    const strictMiddleware = new RateLimitMiddleware();
    vi.unstubAllEnvs();

    const request = new NextRequest('https://example.com/api/test');

    // Simulate multiple requests exceeding the production limit
    for (let i = 0; i < 101; i++) {
      await strictMiddleware.handle(request);
    }

    const response = await strictMiddleware.handle(request);
    expect(response?.status).toBe(429);
  });
});

describe('CORS Middleware', () => {
  let middleware: CORSMiddleware;

  beforeEach(() => {
    middleware = new CORSMiddleware();
  });

  test('should handle preflight requests', () => {
    const request = new NextRequest('https://example.com/api/test', {
      method: 'OPTIONS',
      headers: {
        'origin': 'http://localhost:3000',
      },
    });

    const response = middleware.handle(request);
    expect(response?.status).toBe(200);
    expect(response?.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });

  test('should block disallowed origins', () => {
    const request = new NextRequest('https://example.com/api/test', {
      method: 'GET',
      headers: {
        'origin': 'https://malicious-site.com',
      },
    });

    const response = middleware.handle(request);
    expect(response?.status).toBe(403);
  });
});

describe('API Security Middleware', () => {
  test('should validate input payload size', () => {
    const middleware = new APIInputValidationMiddleware();
    const request = new NextRequest('https://example.com/api/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': '999999999', // Exceeds limit
      },
    });

    const response = middleware.validateRequest(request);
    expect(response?.status).toBe(413);
  });

  test('should validate content types', () => {
    const middleware = new APIInputValidationMiddleware();
    const request = new NextRequest('https://example.com/api/test', {
      method: 'POST',
      headers: {
        'content-type': 'text/html', // Invalid for API
      },
    });

    const response = middleware.validateRequest(request);
    expect(response?.status).toBe(415);
  });
});

describe('SQL Injection Protection', () => {
  let middleware: SQLInjectionProtectionMiddleware;

  beforeEach(() => {
    middleware = new SQLInjectionProtectionMiddleware();
  });

  test('should detect SQL injection in URL parameters', () => {
    const request = new NextRequest(
      'https://example.com/api/users?id=1 OR 1=1'
    );

    const response = middleware.validateRequest(request);
    expect(response?.status).toBe(400);
  });

  test('should detect SQL injection patterns', () => {
    const request = new NextRequest(
      'https://example.com/api/test?query=SELECT * FROM users'
    );

    const response = middleware.validateRequest(request);
    expect(response?.status).toBe(400);
  });

  test('should allow safe parameters', () => {
    const request = new NextRequest(
      'https://example.com/api/users?name=john&age=25'
    );

    const response = middleware.validateRequest(request);
    expect(response).toBeNull();
  });
});

describe('XSS Protection', () => {
  let middleware: XSSProtectionMiddleware;

  beforeEach(() => {
    middleware = new XSSProtectionMiddleware();
  });

  test('should detect script tags', () => {
    const request = new NextRequest(
      'https://example.com/api/test?input=<script>alert("xss")</script>'
    );

    const response = middleware.validateRequest(request);
    expect(response?.status).toBe(400);
  });

  test('should detect event handlers', () => {
    const request = new NextRequest(
      'https://example.com/api/test?input=<img src=x onerror=alert(1)>'
    );

    const response = middleware.validateRequest(request);
    expect(response?.status).toBe(400);
  });

  test('should allow safe content', () => {
    const request = new NextRequest(
      'https://example.com/api/test?message=Hello World'
    );

    const response = middleware.validateRequest(request);
    expect(response).toBeNull();
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

  test('should require API key when enabled', () => {
    const request = new NextRequest('https://example.com/api/protected');

    const response = middleware.validateRequest(request);
    expect(response?.status).toBe(401);
  });

  test('should accept valid API key in header', () => {
    const validKey = 'testkey123testkey123testkey12345';
    vi.stubEnv('VALID_API_KEYS', validKey);
    const localMiddleware = new APIKeyAuthMiddleware();
    const request = new NextRequest('https://example.com/api/protected', {
      headers: {
        // Use a 32-char alphanumeric key to satisfy format and be included via env
        'authorization': `Bearer ${validKey}`,
      },
    });

    const response = localMiddleware.validateRequest(request);
    expect(response).toBeNull();
    // restore handled by afterEach if needed, but here we can just leave it since we're inside a test method
    // actually unstubAllEnvs in afterEach might be too late if others depend on it, 
    // but typically stubEnv is test-scoped
  });

  test('should reject invalid API key format', () => {
    const request = new NextRequest('https://example.com/api/protected', {
      headers: {
        'authorization': 'Bearer invalid-key',
      },
    });

    const response = middleware.validateRequest(request);
    expect(response?.status).toBe(401);
  });

  test('should enforce internal scope with a dedicated key', () => {
    const readKey = '0123456789abcdef0123456789abcdef';
    const internalKey = 'fedcba9876543210fedcba9876543210';
    vi.stubEnv('VALID_API_KEYS', readKey);
    vi.stubEnv('INTERNAL_API_KEYS', internalKey);
    const localMiddleware = new APIKeyAuthMiddleware();

    const readRequest = new NextRequest('https://example.com/api/internal/cache-metrics', {
      headers: { 'x-api-key': readKey },
    });
    expect(localMiddleware.validateRequest(readRequest, ['internal'])?.status).toBe(403);

    const internalRequest = new NextRequest('https://example.com/api/internal/cache-metrics', {
      headers: { 'x-api-key': internalKey },
    });
    expect(localMiddleware.validateRequest(internalRequest, ['internal'])).toBeNull();
  });

  test('should not accept API keys from query parameters', () => {
    const validKey = '0123456789abcdef0123456789abcdef';
    vi.stubEnv('VALID_API_KEYS', validKey);
    const localMiddleware = new APIKeyAuthMiddleware();
    const request = new NextRequest(`https://example.com/api/protected?api_key=${validKey}`);

    expect(localMiddleware.validateRequest(request)?.status).toBe(401);
  });
});

describe('Security Monitoring', () => {
  beforeEach(() => {
    // Clear metrics before each test
    const monitor = getSecurityMonitor();
    monitor.clearMetrics();
  });

  test('should record security events', () => {
    const event = {
      type: 'suspicious_activity' as const,
      severity: 'medium' as const,
      timestamp: new Date().toISOString(),
      ip: '192.168.1.100',
      url: 'https://example.com/test',
      details: { test: true },
    };

    recordSecurityEvent(event);

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

  test('should track recent events', () => {
    const monitor = getSecurityMonitor();

    // Record some events
    for (let i = 0; i < 5; i++) {
      recordSecurityEvent({
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

  test('should block malicious API requests', () => {
    const middleware = createAPISecurityMiddleware();
    const request = new NextRequest(
      'https://example.com/api/test?query=SELECT * FROM users WHERE id=1 OR 1=1'
    );

    const response = middleware(request);
    expect(response?.status).toBe(400);
  });
});