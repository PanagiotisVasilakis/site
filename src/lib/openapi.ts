/**
 * OpenAPI 3.0 Specification and utilities
 */

// OpenAPI 3.0 specification
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Site API',
    description: 'Comprehensive API for analytics, content management, and administration',
    version: '1.0.0',
    contact: {
      name: 'API Support',
      email: 'support@example.com',
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT',
    },
  },
  servers: [
    {
      url: 'https://yourdomain.com/api',
      description: 'Production server',
    },
    {
      url: 'http://localhost:3000/api',
      description: 'Development server',
    },
  ],
  security: [
    {
      ApiKeyAuth: [],
    },
    {
      AdminJWT: [],
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
        description: 'API key for authenticated requests',
      },
      AdminJWT: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token for admin authentication',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'string',
            description: 'Error message',
          },
          code: {
            type: 'string',
            description: 'Error code',
          },
          details: {
            type: 'object',
            description: 'Additional error details',
          },
        },
      },
      Category: {
        type: 'object',
        required: ['id', 'slug', 'title', 'count'],
        properties: {
          id: {
            type: 'string',
            description: 'Category identifier',
          },
          slug: {
            type: 'string',
            description: 'URL-friendly category slug',
            pattern: '^[a-z0-9\\-_]+$',
          },
          title: {
            type: 'string',
            description: 'Category display title',
          },
          count: {
            type: 'integer',
            minimum: 0,
            description: 'Number of items in category',
          },
        },
      },
      Item: {
        type: 'object',
        required: ['id', 'slug', 'name', 'categoryId'],
        properties: {
          id: {
            type: 'string',
            description: 'Item identifier',
          },
          slug: {
            type: 'string',
            description: 'URL-friendly item slug',
            pattern: '^[a-z0-9\\-_]+$',
          },
          name: {
            type: 'string',
            description: 'Item name',
          },
          summary: {
            type: 'string',
            description: 'Item summary',
          },
          address: {
            type: 'string',
            description: 'Item address',
          },
          phone: {
            type: 'string',
            description: 'Contact phone number',
          },
          location: {
            type: 'object',
            properties: {
              lat: { type: 'number' },
              lng: { type: 'number' },
            },
            description: 'Geographic coordinates',
          },
          categoryId: {
            type: 'string',
            description: 'Parent category identifier',
          },
        },
      },
      AnalyticsEvent: {
        type: 'object',
        required: ['path'],
        properties: {
          path: {
            type: 'string',
            description: 'Page path',
            maxLength: 200,
          },
          ts: {
            type: 'integer',
            description: 'Timestamp (Unix milliseconds)',
          },
          locale: {
            type: 'string',
            description: 'Page locale',
            pattern: '^[a-z]{2}(-[A-Z]{2})?$',
          },
          event: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Event name',
              },
              props: {
                type: 'object',
                description: 'Event properties',
              },
            },
          },
        },
      },
      WebVital: {
        type: 'object',
        required: ['name', 'value', 'path'],
        properties: {
          name: {
            type: 'string',
            enum: ['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB'],
            description: 'Web vital metric name',
          },
          value: {
            type: 'number',
            minimum: 0,
            description: 'Metric value',
          },
          path: {
            type: 'string',
            description: 'Page path where metric was recorded',
          },
          ts: {
            type: 'integer',
            description: 'Timestamp',
          },
          id: {
            type: 'string',
            description: 'Unique metric identifier',
          },
        },
      },
      SecurityEvent: {
        type: 'object',
        required: ['type', 'severity', 'timestamp', 'ip', 'url'],
        properties: {
          type: {
            type: 'string',
            enum: [
              'csp_violation',
              'rate_limit_exceeded',
              'cors_violation',
              'auth_failure',
              'suspicious_activity',
              'api_security_violation',
              'sql_injection_attempt',
              'xss_attempt',
              'api_auth_failure'
            ],
            description: 'Security event type',
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Event severity level',
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Event timestamp in ISO format',
          },
          ip: {
            type: 'string',
            description: 'Client IP address',
          },
          userAgent: {
            type: 'string',
            description: 'Client user agent',
          },
          url: {
            type: 'string',
            description: 'Request URL',
          },
          details: {
            type: 'object',
            description: 'Additional event details',
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request - invalid parameters',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: {
              error: 'invalid_params',
              details: { field: 'Expected string, received number' },
            },
          },
        },
      },
      Unauthorized: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Unauthorized' },
          },
        },
      },
      Forbidden: {
        description: 'Access forbidden',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Forbidden' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'not_found' },
          },
        },
      },
      TooManyRequests: {
        description: 'Rate limit exceeded',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'Too Many Requests' },
          },
        },
      },
      InternalServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
            example: { error: 'internal_server_error' },
          },
        },
      },
    },
  },
  paths: {
    '/categories': {
      get: {
        summary: 'Get all categories',
        description: 'Retrieve a list of all categories with item counts',
        tags: ['Content'],
        responses: {
          '200': {
            description: 'List of categories',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    categories: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Category' },
                    },
                  },
                },
                example: {
                  categories: [
                    {
                      id: 'restaurants',
                      slug: 'restaurants',
                      title: 'Restaurants',
                      count: 25,
                    },
                  ],
                },
              },
            },
            headers: {
              'Cache-Control': {
                schema: { type: 'string' },
                description: 'Cache control header',
              },
            },
          },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/categories/{category}/items': {
      get: {
        summary: 'Get items by category',
        description: 'Retrieve all items in a specific category',
        tags: ['Content'],
        parameters: [
          {
            name: 'category',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              pattern: '^[a-z0-9\\-_]+$',
            },
            description: 'Category slug',
          },
        ],
        responses: {
          '200': {
            description: 'List of items in category',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    items: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/Item' },
                    },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/categories/{category}/items/{slug}': {
      get: {
        summary: 'Get specific item',
        description: 'Retrieve details for a specific item',
        tags: ['Content'],
        parameters: [
          {
            name: 'category',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              pattern: '^[a-z0-9\\-_]+$',
            },
            description: 'Category slug',
          },
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: {
              type: 'string',
              pattern: '^[a-z0-9\\-_]+$',
            },
            description: 'Item slug',
          },
        ],
        responses: {
          '200': {
            description: 'Item details',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    item: { $ref: '#/components/schemas/Item' },
                  },
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '404': { $ref: '#/components/responses/NotFound' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/analytics': {
      post: {
        summary: 'Track analytics events',
        description: 'Submit analytics events for tracking',
        tags: ['Analytics'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  { $ref: '#/components/schemas/AnalyticsEvent' },
                  {
                    type: 'array',
                    items: { $ref: '#/components/schemas/AnalyticsEvent' },
                    maxItems: 50,
                  },
                ],
              },
              examples: {
                single: {
                  summary: 'Single event',
                  value: {
                    path: '/en/villa',
                    ts: 1695648000000,
                    locale: 'en',
                  },
                },
                batch: {
                  summary: 'Multiple events',
                  value: [
                    { path: '/en/villa', ts: 1695648000000 },
                    { path: '/en/amenities', ts: 1695648060000 },
                  ],
                },
              },
            },
          },
        },
        responses: {
          '204': {
            description: 'Events recorded successfully',
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '413': {
            description: 'Payload too large',
            content: {
              'text/plain': {
                schema: { type: 'string' },
                example: 'payload too large',
              },
            },
          },
          '429': { $ref: '#/components/responses/TooManyRequests' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
      get: {
        summary: 'Get analytics summary',
        description: 'Get basic analytics count',
        tags: ['Analytics'],
        responses: {
          '200': {
            description: 'Analytics summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    count: {
                      type: 'integer',
                      description: 'Total number of tracked events',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/vitals': {
      post: {
        summary: 'Track web vitals',
        description: 'Submit Core Web Vitals metrics',
        tags: ['Analytics'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/WebVital' },
              example: {
                name: 'LCP',
                value: 2500,
                path: '/en/villa',
                ts: 1695648000000,
                id: 'unique-metric-id',
              },
            },
          },
        },
        responses: {
          '204': { description: 'Web vital recorded successfully' },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
      get: {
        summary: 'Get web vitals summary',
        description: 'Get Core Web Vitals metrics summary',
        tags: ['Analytics'],
        responses: {
          '200': {
            description: 'Web vitals summary',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    summary: {
                      type: 'object',
                      description: 'Web vitals aggregated data',
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/admin/login': {
      post: {
        summary: 'Admin authentication',
        description: 'Authenticate admin user and receive JWT token',
        tags: ['Admin'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['secret'],
                properties: {
                  secret: {
                    type: 'string',
                    description: 'Admin secret key',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            headers: {
              'Set-Cookie': {
                schema: { type: 'string' },
                description: 'JWT token cookie',
              },
            },
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/security/dashboard': {
      get: {
        summary: 'Get security dashboard data',
        description: 'Retrieve security metrics and status (admin only)',
        tags: ['Security'],
        security: [{ AdminJWT: [] }],
        parameters: [
          {
            name: 'endpoint',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['metrics', 'health', 'events', 'report', 'dashboard'],
            },
            description: 'Specific data endpoint',
          },
          {
            name: 'minutes',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 10080 },
            description: 'Time window in minutes (for events endpoint)',
          },
          {
            name: 'type',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['daily', 'trends'],
            },
            description: 'Report type (for report endpoint)',
          },
        ],
        responses: {
          '200': {
            description: 'Security dashboard data',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'Response varies by endpoint parameter',
                },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
    '/security/csp-report': {
      post: {
        summary: 'Report CSP violations',
        description: 'Endpoint for Content Security Policy violation reports',
        tags: ['Security'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  'document-uri': { type: 'string' },
                  'violated-directive': { type: 'string' },
                  'blocked-uri': { type: 'string' },
                  'original-policy': { type: 'string' },
                  'source-file': { type: 'string' },
                  'line-number': { type: 'integer' },
                  'column-number': { type: 'integer' },
                },
              },
            },
          },
        },
        responses: {
          '204': { description: 'CSP violation recorded' },
          '500': { $ref: '#/components/responses/InternalServerError' },
        },
      },
    },
  },
  tags: [
    {
      name: 'Content',
      description: 'Content management and retrieval',
    },
    {
      name: 'Analytics',
      description: 'Analytics and performance tracking',
    },
    {
      name: 'Admin',
      description: 'Administrative operations',
    },
    {
      name: 'Security',
      description: 'Security monitoring and reporting',
    },
  ],
} as const;

// Validate OpenAPI spec (optional utility for tests/build scripts)
export function validateOpenAPISpec(): boolean {
  try {
    // Basic validation - ensure required fields exist
    const required = ['openapi', 'info', 'paths'] as const;
    for (const field of required) {
      if (!(field in openApiSpec)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate version format
    if (!openApiSpec.openapi.match(/^3\.\d+\.\d+$/)) {
      throw new Error('Invalid OpenAPI version format');
    }

    // eslint-disable-next-line no-console
    console.log('✅ OpenAPI specification validated successfully');
    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ OpenAPI specification validation failed:', error);
    return false;
  }
}
