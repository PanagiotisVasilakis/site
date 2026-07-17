/**
 * Enterprise Security Configuration Framework
 * Centralized security configuration with environment-specific settings
 */

import { z } from 'zod';

// Security configuration schema
const SecurityConfigSchema = z.object({
  csp: z.object({
    enabled: z.boolean(),
    reportOnly: z.boolean(),
    directives: z.object({
      defaultSrc: z.array(z.string()),
      scriptSrc: z.array(z.string()),
      styleSrc: z.array(z.string()),
      imgSrc: z.array(z.string()),
      fontSrc: z.array(z.string()),
      connectSrc: z.array(z.string()),
      frameSrc: z.array(z.string()),
      manifestSrc: z.array(z.string()),
      workerSrc: z.array(z.string()),
      frameAncestors: z.array(z.string()),
      baseUri: z.array(z.string()),
      formAction: z.array(z.string()),
    }),
    useNonce: z.boolean(),
    reportUri: z.string().optional(),
  }),
  headers: z.object({
    hsts: z.object({
      enabled: z.boolean(),
      maxAge: z.number(),
      includeSubDomains: z.boolean(),
      preload: z.boolean(),
    }),
    frameOptions: z.enum(['DENY', 'SAMEORIGIN', 'ALLOW-FROM']),
    contentTypeOptions: z.boolean(),
    referrerPolicy: z.enum([
      'no-referrer',
      'no-referrer-when-downgrade',
      'origin',
      'origin-when-cross-origin',
      'same-origin',
      'strict-origin',
      'strict-origin-when-cross-origin',
      'unsafe-url'
    ]),
    permissionsPolicy: z.object({
      geolocation: z.array(z.string()),
      microphone: z.array(z.string()),
      camera: z.array(z.string()),
      payment: z.array(z.string()),
      accelerometer: z.array(z.string()),
      gyroscope: z.array(z.string()),
      magnetometer: z.array(z.string()),
      usb: z.array(z.string()),
    }),
    crossOriginEmbedderPolicy: z.enum(['unsafe-none', 'require-corp', 'credentialless']),
    crossOriginOpenerPolicy: z.enum(['unsafe-none', 'same-origin-allow-popups', 'same-origin']),
    crossOriginResourcePolicy: z.enum(['same-site', 'same-origin', 'cross-origin']),
  }),
  cors: z.object({
    enabled: z.boolean(),
    origins: z.array(z.string()),
    methods: z.array(z.string()),
    allowedHeaders: z.array(z.string()),
    credentials: z.boolean(),
    maxAge: z.number(),
  }),
  monitoring: z.object({
    enabled: z.boolean(),
    logSecurityEvents: z.boolean(),
    alertOnViolations: z.boolean(),
  }),
  apiSecurity: z.object({
    inputValidation: z.object({
      enabled: z.boolean(),
      maxPayloadSize: z.number(),
      allowedContentTypes: z.array(z.string()),
    }),
  }),
});

export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

// Environment-specific configurations
const developmentConfig: SecurityConfig = {
  csp: {
    enabled: true,
    reportOnly: true, // Report-only mode in development
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://vercel.live"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  connectSrc: ["'self'", "https://vercel.live", "https://router.project-osrm.org", "wss:", "ws:"],
      frameSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    useNonce: false,
    reportUri: '/api/security/csp-report',
  },
  headers: {
    hsts: {
      enabled: false, // Disabled in development (no HTTPS)
      maxAge: 0,
      includeSubDomains: false,
      preload: false,
    },
    frameOptions: 'SAMEORIGIN',
    contentTypeOptions: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      geolocation: ['self'],
      microphone: [],
      camera: [],
      payment: [],
      accelerometer: [],
      gyroscope: [],
      magnetometer: [],
      usb: [],
    },
    crossOriginEmbedderPolicy: 'unsafe-none',
    crossOriginOpenerPolicy: 'same-origin-allow-popups',
    crossOriginResourcePolicy: 'cross-origin',
  },
  cors: {
    enabled: true,
    origins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400,
  },
  monitoring: {
    enabled: true,
    logSecurityEvents: true,
    alertOnViolations: false,
  },
  apiSecurity: {
    inputValidation: {
      enabled: true,
      maxPayloadSize: 1024 * 1024, // 1MB
      allowedContentTypes: ['application/json'],
    },
  },
};

const productionConfig: SecurityConfig = {
  csp: {
    enabled: true,
    reportOnly: false, // Enforce in production
    directives: {
      defaultSrc: ["'self'"],
      // unsafe-inline remains as fallback for static localized pages that cannot
      // receive a per-request nonce. Nonce-enabled routes strip it in buildCSPDirective.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
  connectSrc: ["'self'", "https://router.project-osrm.org", "https://maps.geoapify.com"],
      frameSrc: ["'none'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'", "blob:"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
    useNonce: true,
    reportUri: '/api/security/csp-report',
  },
  headers: {
    hsts: {
      enabled: true,
      maxAge: 63072000, // 2 years
      includeSubDomains: true,
      preload: true,
    },
    frameOptions: 'DENY',
    contentTypeOptions: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
    permissionsPolicy: {
      geolocation: ['self'],
      microphone: [],
      camera: [],
      payment: [],
      accelerometer: [],
      gyroscope: [],
      magnetometer: [],
      usb: [],
    },
    crossOriginEmbedderPolicy: 'require-corp',
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'same-origin',
  },
  cors: {
    enabled: true,
    origins: process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) || [],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-API-Key'],
    credentials: true,
    maxAge: 86400,
  },
  monitoring: {
    enabled: true,
    logSecurityEvents: true,
    alertOnViolations: true,
  },
  apiSecurity: {
    inputValidation: {
      enabled: true,
      maxPayloadSize: 512 * 1024, // 512KB in production (more restrictive)
      allowedContentTypes: ['application/json'],
    },
  },
};

// Get configuration based on environment
export function getSecurityConfig(): SecurityConfig {
  const env = process.env.NODE_ENV || 'development';

  const config = env === 'production' ? productionConfig : developmentConfig;
  
  // Validate configuration
  const result = SecurityConfigSchema.safeParse(config);
  if (!result.success) {
    console.error('Invalid security configuration:', result.error);
    throw new Error('Security configuration validation failed');
  }
  
  return result.data;
}

// CSP directive builders
export function buildCSPDirective(
  directives: SecurityConfig['csp']['directives'],
  nonce?: string,
): string {
  const cspParts: string[] = [];
  
  Object.entries(directives).forEach(([directive, sources]) => {
    const kebabDirective = directive.replace(/([A-Z])/g, '-$1').toLowerCase();
    const sourcesWithNonce = directive === 'scriptSrc' && nonce
      ? [...sources.filter((source) => source !== "'unsafe-inline'"), `'nonce-${nonce}'`]
      : sources;
    
    cspParts.push(`${kebabDirective} ${sourcesWithNonce.join(' ')}`);
  });
  
  return cspParts.join('; ');
}

// Nonce generation for CSP
export function generateNonce(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  
  // Fallback for environments without crypto.randomUUID
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

// Permission Policy builder
export function buildPermissionsPolicy(permissions: SecurityConfig['headers']['permissionsPolicy']): string {
  const policies: string[] = [];

  const serializeAllowlistItem = (item: string): string | null => {
    const trimmed = item.trim();
    const hasMatchingQuotes = trimmed.length >= 2
      && ((trimmed.startsWith("'") && trimmed.endsWith("'"))
        || (trimmed.startsWith('"') && trimmed.endsWith('"')));
    const normalized = hasMatchingQuotes ? trimmed.slice(1, -1) : trimmed;

    // Permissions-Policy keywords are structured-field tokens, not origins.
    if (normalized === 'self' || normalized === 'src' || normalized === '*') {
      return normalized;
    }

    // An empty allowlist is the valid representation of the legacy `none` value.
    if (!normalized || normalized === 'none') {
      return null;
    }

    // Origins are quoted strings in the Permissions-Policy grammar. JSON
    // stringification supplies the required escaping for quotes/backslashes.
    return JSON.stringify(normalized);
  };
  
  Object.entries(permissions).forEach(([feature, allowlist]) => {
    const serializedAllowlist = allowlist
      .map(serializeAllowlistItem)
      .filter((item): item is string => item !== null);
    const policy = serializedAllowlist.length > 0
      ? `${feature}=(${serializedAllowlist.join(' ')})`
      : `${feature}=()`;
    policies.push(policy);
  });
  
  return policies.join(', ');
}

// Security event types
export interface SecurityEvent {
  type: 'csp_violation' | 'rate_limit_exceeded' | 'cors_violation' | 'auth_failure' | 'suspicious_activity' | 'api_security_violation' | 'sql_injection_attempt' | 'xss_attempt' | 'api_auth_failure';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  ip: string;
  userAgent?: string;
  url: string;
  details: Record<string, unknown>;
}

// Security monitoring utilities
//
// Keep this API awaitable: request handlers must not finish while the durable
// audit write is still only queued in the JavaScript microtask queue. The
// dynamic import still avoids the configuration/monitoring module cycle and
// keeps the browser bundle free of the server-only persistence code.
export async function logSecurityEvent(event: SecurityEvent): Promise<void> {
  const config = getSecurityConfig();
  
  if (!config.monitoring.enabled || !config.monitoring.logSecurityEvents) {
    return;
  }

  // Use dynamic import to avoid circular dependency
  if (typeof window === 'undefined') { // Server-side only
    try {
      const { recordSecurityEvent } = await import('./security-monitoring');
      await recordSecurityEvent(event);
    } catch (error) {
      console.error('Failed to record security event:', error);
      console.warn('Security event recording unavailable', { type: event.type, severity: event.severity });
    }
  }
}
