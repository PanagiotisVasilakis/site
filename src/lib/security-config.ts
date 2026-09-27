/**
 * Enterprise Security Configuration Framework
 * Centralized security configuration with environment-specific settings
 */

type SourceList = string[];

// Static, per-environment security settings. Plain types: the values are
// constants in this file, so they are checked at compile time, not per request.
export interface SecurityConfig {
  csp: {
    reportOnly: boolean;
    directives: {
      defaultSrc: SourceList;
      scriptSrc: SourceList;
      styleSrc: SourceList;
      imgSrc: SourceList;
      fontSrc: SourceList;
      connectSrc: SourceList;
      frameSrc: SourceList;
      manifestSrc: SourceList;
      workerSrc: SourceList;
      frameAncestors: SourceList;
      baseUri: SourceList;
      formAction: SourceList;
    };
    useNonce: boolean;
    reportUri?: string;
  };
  headers: {
    hsts: {
      enabled: boolean;
      maxAge: number;
      includeSubDomains: boolean;
      preload: boolean;
    };
    frameOptions: 'DENY' | 'SAMEORIGIN' | 'ALLOW-FROM';
    contentTypeOptions: boolean;
    referrerPolicy:
      | 'no-referrer'
      | 'no-referrer-when-downgrade'
      | 'origin'
      | 'origin-when-cross-origin'
      | 'same-origin'
      | 'strict-origin'
      | 'strict-origin-when-cross-origin'
      | 'unsafe-url';
    permissionsPolicy: {
      geolocation: SourceList;
      microphone: SourceList;
      camera: SourceList;
      payment: SourceList;
      accelerometer: SourceList;
      gyroscope: SourceList;
      magnetometer: SourceList;
      usb: SourceList;
    };
    crossOriginEmbedderPolicy: 'unsafe-none' | 'require-corp' | 'credentialless';
    crossOriginOpenerPolicy: 'unsafe-none' | 'same-origin-allow-popups' | 'same-origin';
    crossOriginResourcePolicy: 'same-site' | 'same-origin' | 'cross-origin';
  };
  cors: {
    origins: string[];
    methods: string[];
    allowedHeaders: string[];
    credentials: boolean;
    maxAge: number;
  };
  apiSecurity: {
    inputValidation: {
      maxPayloadSize: number;
      allowedContentTypes: string[];
    };
  };
}

// The map's routing client (LeafletMap) calls NEXT_PUBLIC_OSRM_BASE_URL with the
// same default; the environment schema rejects a malformed value at startup.
const osrmOrigin = new URL(process.env.NEXT_PUBLIC_OSRM_BASE_URL || 'https://router.project-osrm.org').origin;

// Environment-specific configurations
const developmentConfig: SecurityConfig = {
  csp: {
    reportOnly: true, // Report-only mode in development
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", osrmOrigin, "wss:", "ws:"],
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
    origins: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400,
  },
  apiSecurity: {
    inputValidation: {
      maxPayloadSize: 1024 * 1024, // 1MB
      allowedContentTypes: ['application/json'],
    },
  },
};

const productionConfig: SecurityConfig = {
  csp: {
    reportOnly: false, // Enforce in production
    directives: {
      defaultSrc: ["'self'"],
      // unsafe-inline remains as fallback for static localized pages that cannot
      // receive a per-request nonce. Nonce-enabled routes strip it in buildCSPDirective.
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", osrmOrigin],
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
    // require-corp would block the no-CORS OpenStreetMap/Carto tiles (no CORP header).
    crossOriginEmbedderPolicy: 'unsafe-none',
    crossOriginOpenerPolicy: 'same-origin',
    crossOriginResourcePolicy: 'same-origin',
  },
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) || [],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-API-Key'],
    credentials: true,
    maxAge: 86400,
  },
  apiSecurity: {
    inputValidation: {
      maxPayloadSize: 512 * 1024, // 512KB in production (more restrictive)
      allowedContentTypes: ['application/json'],
    },
  },
};

// Get configuration based on environment
export function getSecurityConfig(): SecurityConfig {
  const env = process.env.NODE_ENV || 'development';

  return env === 'production' ? productionConfig : developmentConfig;
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
  return crypto.randomUUID().replace(/-/g, '');
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
  type: 'csp_violation' | 'cors_violation' | 'api_security_violation';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  ip: string;
  userAgent?: string;
  url: string;
  details: Record<string, unknown>;
}
