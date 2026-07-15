/** OpenAPI contract for the HTTP surface that is supported outside the UI. */
export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Guest Guide API',
    description: 'Public content, booking, guest portal, privacy, analytics, health, and operator endpoints.',
    version: '2.0.0',
  },
  servers: [{ url: '/api', description: 'Current deployment' }],
  components: {
    securitySchemes: {
      AdminCookie: { type: 'apiKey', in: 'cookie', name: 'admin_jwt' },
      GuestCookie: { type: 'apiKey', in: 'cookie', name: 'guest_session' },
      ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-API-Key' },
      CronBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque' },
      WebhookBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque' },
    },
    schemas: {
      Error: {
        type: 'object',
        description: 'Routes using the shared handler return a structured error object; small ingestion routes may return a string message.',
        properties: {
          success: { type: 'boolean', enum: [false] },
          error: {
            oneOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                  details: { type: 'object', additionalProperties: true },
                  correlationId: { type: 'string' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            ],
          },
        },
      },
      Category: {
        type: 'object',
        required: ['id', 'slug'],
        properties: {
          id: { type: 'string' },
          slug: { type: 'string', pattern: '^[a-z0-9_-]+$' },
          title: { type: 'string' },
          count: { type: 'integer', minimum: 0 },
        },
      },
      Item: {
        type: 'object',
        required: ['id', 'slug', 'name'],
        properties: {
          id: { type: 'string' },
          slug: { type: 'string' },
          name: { type: 'string' },
          summary: { type: 'string' },
          address: { type: 'string' },
          phone: { type: 'string' },
          categoryId: { type: 'string' },
          location: {
            type: 'object',
            properties: { lat: { type: 'number' }, lng: { type: 'number' } },
          },
        },
      },
      AnalyticsEvent: {
        type: 'object',
        required: ['path'],
        properties: {
          path: { type: 'string', maxLength: 2048, description: 'Query and fragment are discarded before storage.' },
          locale: { type: 'string', pattern: '^[a-z]{2}(-[A-Z]{2})?$' },
          event: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                enum: [
                  'portal_opened', 'origin_selected', 'form_submitted', 'auth_mode_changed',
                  'no_booking_cta_clicked', 'checkin_viewed', 'checkin_completed',
                  'booking_submitted', 'booking_check_availability',
                  'mobile_nav_house', 'mobile_nav_book', 'mobile_nav_booking_details',
                  'mobile_nav_about', 'mobile_nav_favorites', 'mobile_nav_moments',
                  'mobile_nav_phones', 'mobile_nav_checkin',
                ],
              },
              props: { type: 'object', additionalProperties: true, description: 'Only per-event allowlisted properties are retained.' },
            },
          },
        },
      },
      WebVital: {
        type: 'object',
        required: ['name', 'value'],
        additionalProperties: false,
        properties: {
          name: { type: 'string', enum: ['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB'] },
          value: { type: 'number', minimum: 0, maximum: 1000000000 },
          id: { type: 'string', maxLength: 100 },
          path: { type: 'string', maxLength: 2048 },
        },
      },
      PortalClaim: {
        type: 'object',
        required: ['claimToken', 'origin', 'phone', 'password', 'acceptTerms'],
        properties: {
          claimToken: { type: 'string', minLength: 32, maxLength: 256 },
          origin: { type: 'string', enum: ['GR', 'ABROAD'] },
          phone: { type: 'string', minLength: 8, maxLength: 32 },
          password: { type: 'string', minLength: 8, maxLength: 128, format: 'password' },
          remember: { type: 'boolean', default: false },
          acceptTerms: { type: 'boolean', enum: [true] },
        },
      },
      PortalSession: {
        type: 'object',
        required: ['phone', 'password'],
        properties: {
          phone: { type: 'string', minLength: 8, maxLength: 32 },
          password: { type: 'string', minLength: 8, maxLength: 128, format: 'password' },
          remember: { type: 'boolean', default: false },
        },
      },
      BookingRequest: {
        type: 'object',
        required: ['propertyName', 'locale', 'dateRange', 'guest'],
        properties: {
          propertyName: { type: 'string', maxLength: 200 },
          locale: { type: 'string', maxLength: 8 },
          dateRange: {
            type: 'object', required: ['from', 'to'],
            properties: { from: { type: 'string', format: 'date-time' }, to: { type: 'string', format: 'date-time' } },
          },
          guest: {
            type: 'object', required: ['firstName', 'lastName', 'email', 'phone'],
            properties: {
              firstName: { type: 'string', maxLength: 100 },
              lastName: { type: 'string', maxLength: 100 },
              email: { type: 'string', format: 'email', maxLength: 320 },
              phone: { type: 'string', maxLength: 32 },
              arrivalTime: { type: 'string', maxLength: 40 },
              specialRequests: { type: 'string', maxLength: 1000 },
            },
          },
        },
      },
    },
    responses: {
      BadRequest: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Unauthorized: { description: 'Authentication required or credentials invalid', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Forbidden: { description: 'Authenticated principal is not authorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      NotFound: { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Conflict: { description: 'Request conflicts with current state', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      RateLimited: { description: 'Rate limit exceeded', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
      Unavailable: { description: 'Required database or delivery dependency is unavailable', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
    },
  },
  paths: {
    '/health': {
      get: { summary: 'Process health', tags: ['Health'], responses: { '200': { description: 'Process is alive' } } },
      head: { summary: 'Process health without a body', tags: ['Health'], responses: { '200': { description: 'Process is alive' } } },
    },
    '/health/live': {
      get: { summary: 'Liveness probe', tags: ['Health'], responses: { '200': { description: 'Process is alive' } } },
      head: { summary: 'Liveness probe without a body', tags: ['Health'], responses: { '200': { description: 'Process is alive' } } },
    },
    '/health/ready': {
      get: { summary: 'Database and migration readiness probe', tags: ['Health'], responses: { '200': { description: 'Ready' }, '503': { $ref: '#/components/responses/Unavailable' } } },
      head: { summary: 'Readiness probe without a body', tags: ['Health'], responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } } },
    },
    '/categories': {
      get: { summary: 'List public categories', tags: ['Content'], responses: { '200': { description: 'Category list', content: { 'application/json': { schema: { type: 'object', properties: { categories: { type: 'array', items: { $ref: '#/components/schemas/Category' } } } } } } } } },
    },
    '/categories/{category}/items': {
      get: {
        summary: 'List public items in a category', tags: ['Content'],
        parameters: [{ name: 'category', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Item list' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/categories/{category}/items/{slug}': {
      get: {
        summary: 'Read a public item', tags: ['Content'],
        parameters: [
          { name: 'category', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'slug', in: 'path', required: true, schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Item detail' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/booking-requests': {
      post: {
        summary: 'Create a durable booking request', tags: ['Booking'],
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 16, maxLength: 128 } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BookingRequest' } } } },
        responses: {
          '200': { description: 'Existing idempotent request' }, '202': { description: 'Request durably queued' },
          '400': { $ref: '#/components/responses/BadRequest' }, '422': { $ref: '#/components/responses/BadRequest' },
          '429': { $ref: '#/components/responses/RateLimited' }, '503': { $ref: '#/components/responses/Unavailable' },
        },
      },
    },
    '/portal/claims': {
      post: {
        summary: 'Consume a one-time host-issued booking claim', tags: ['Portal'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PortalClaim' } } } },
        responses: { '200': { description: 'Guest and refresh cookies issued' }, '401': { $ref: '#/components/responses/Unauthorized' }, '409': { $ref: '#/components/responses/Conflict' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/portal/sessions': {
      get: {
        summary: 'Probe the current guest portal session', tags: ['Portal'], security: [{ GuestCookie: [] }],
        responses: { '200': { description: 'Guest session is valid' }, '401': { $ref: '#/components/responses/Unauthorized' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
      post: {
        summary: 'Sign in to an eligible claimed booking', tags: ['Portal'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PortalSession' } } } },
        responses: { '200': { description: 'Guest and refresh cookies issued' }, '401': { $ref: '#/components/responses/Unauthorized' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/portal/refresh': {
      post: { summary: 'Rotate the refresh token family', tags: ['Portal'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Session refreshed' }, '401': { $ref: '#/components/responses/Unauthorized' }, '409': { $ref: '#/components/responses/Conflict' } } },
    },
    '/portal/logout': {
      post: { summary: 'Revoke the refresh family and clear guest cookies', tags: ['Portal'], security: [{ GuestCookie: [] }], responses: { '204': { description: 'Signed out' } } },
    },
    '/portal/start': {
      post: { summary: 'Read the current host-issued claim form schema', tags: ['Portal'], responses: { '200': { description: 'Claim flow schema' }, '404': { $ref: '#/components/responses/NotFound' } } },
    },
    '/portal/verify': {
      post: {
        deprecated: true,
        summary: 'Compatibility sign-in endpoint; public lookup signup is gone',
        description: 'Requests with mode=signin are forwarded to /portal/sessions. All former signup modes return 410.',
        tags: ['Portal'],
        responses: { '200': { description: 'Sign-in completed' }, '401': { $ref: '#/components/responses/Unauthorized' }, '410': { description: 'Host-issued claim grant required' } },
      },
    },
    '/portal/onsite/confirm': {
      post: { deprecated: true, summary: 'Removed legacy onsite confirmation endpoint', tags: ['Portal'], responses: { '410': { description: 'Host-issued claim grant required' } } },
    },
    '/check-in': {
      get: { summary: 'Read the verified booking and check-in state', tags: ['Guest'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Booking state' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
    },
    '/check-in/preferences': {
      get: { summary: 'Read guest preferences and time-gated Wi-Fi details', tags: ['Guest'], security: [{ GuestCookie: [] }, { AdminCookie: [] }], responses: { '200': { description: 'Preferences' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
      post: { summary: 'Update preferences as an administrator', tags: ['Guest'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Preferences updated' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/check-in/arrival-request': {
      get: { summary: 'Read the guest latest requested arrival time', tags: ['Guest'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Latest request or null' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
      post: { summary: 'Create a durable arrival-time request', tags: ['Guest'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Request stored; delivery state is sent, queued, or skipped' }, '401': { $ref: '#/components/responses/Unauthorized' }, '422': { $ref: '#/components/responses/BadRequest' } } },
    },
    '/check-in/complete': {
      post: { summary: 'Persist check-in completion details', tags: ['Guest'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Completion stored' }, '401': { $ref: '#/components/responses/Unauthorized' }, '422': { $ref: '#/components/responses/BadRequest' } } },
    },
    '/check-in/complete/get': {
      get: { summary: 'Read persisted check-in completion details', tags: ['Guest'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Completion or null' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
    },
    '/dsar/export': {
      get: { summary: 'Export the authenticated subject data', tags: ['Privacy'], security: [{ GuestCookie: [] }, { AdminCookie: [] }], responses: { '200': { description: 'Personal data JSON attachment' }, '401': { $ref: '#/components/responses/Unauthorized' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/dsar/requests': {
      get: { summary: 'List the guest privacy requests', tags: ['Privacy'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Privacy requests' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
      post: { summary: 'Submit a verified erasure request', tags: ['Privacy'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Existing open request' }, '202': { description: 'Request accepted for operator review' }, '429': { $ref: '#/components/responses/RateLimited' } } },
    },
    '/analytics': {
      post: {
        summary: 'Ingest privacy-minimized analytics', tags: ['Analytics'],
        requestBody: { required: true, content: { 'application/json': { schema: { oneOf: [{ $ref: '#/components/schemas/AnalyticsEvent' }, { type: 'array', maxItems: 50, items: { $ref: '#/components/schemas/AnalyticsEvent' } }] } } } },
        responses: { '201': { description: 'Events stored' }, '413': { $ref: '#/components/responses/BadRequest' }, '422': { $ref: '#/components/responses/BadRequest' }, '429': { $ref: '#/components/responses/RateLimited' }, '503': { $ref: '#/components/responses/Unavailable' } },
      },
      get: { summary: 'Read recent analytics as an administrator', tags: ['Analytics'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Recent analytics' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/analytics/stats': {
      get: { summary: 'Read hourly and daily analytics buckets', tags: ['Analytics'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Analytics buckets' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/analytics/top': {
      get: { summary: 'Read top query-free paths', tags: ['Analytics'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Top paths' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/analytics/export.csv': {
      get: { summary: 'Export privacy-minimized analytics as formula-safe CSV', tags: ['Analytics'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'CSV attachment', content: { 'text/csv': { schema: { type: 'string' } } } }, '401': { $ref: '#/components/responses/Unauthorized' } } },
    },
    '/vitals': {
      post: { summary: 'Ingest a Core Web Vital', tags: ['Analytics'], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/WebVital' } } } }, responses: { '201': { description: 'Vital stored' }, '422': { $ref: '#/components/responses/BadRequest' }, '429': { $ref: '#/components/responses/RateLimited' } } },
      get: { summary: 'Read vital aggregates as an administrator', tags: ['Analytics'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Vital aggregates' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/vitals/export.csv': {
      get: { summary: 'Export Core Web Vitals as formula-safe CSV', tags: ['Analytics'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'CSV attachment', content: { 'text/csv': { schema: { type: 'string' } } } }, '401': { $ref: '#/components/responses/Unauthorized' } } },
    },
    '/admin/login': {
      post: { summary: 'Create an administrator session', tags: ['Admin'], responses: { '200': { description: 'Admin cookie issued' }, '401': { $ref: '#/components/responses/Unauthorized' }, '429': { $ref: '#/components/responses/RateLimited' } } },
    },
    '/admin/logout': {
      post: { summary: 'Revoke the current administrator session and clear its cookie', tags: ['Admin'], responses: { '200': { description: 'Signed out' } } },
    },
    '/admin/refresh': {
      post: { summary: 'Rotate the administrator JWT for an active server-side session', tags: ['Admin'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Session refreshed' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
    },
    '/admin/flags': {
      get: { summary: 'Read persisted runtime feature flags', tags: ['Admin'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Feature flags' }, '403': { $ref: '#/components/responses/Forbidden' } } },
      post: { summary: 'Update persisted runtime feature flags', tags: ['Admin'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Updated flags' }, '403': { $ref: '#/components/responses/Forbidden' }, '422': { $ref: '#/components/responses/BadRequest' } } },
    },
    '/admin/guests': {
      get: { summary: 'Query or export booking and guest records', tags: ['Admin'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Requested administrator data view' }, '403': { $ref: '#/components/responses/Forbidden' }, '422': { $ref: '#/components/responses/BadRequest' } } },
    },
    '/admin/check-in-requests': {
      get: { summary: 'List check-in arrival-time requests', tags: ['Admin'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Requests and status counts' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/admin/check-in-requests/{id}': {
      patch: {
        summary: 'Approve or reject a check-in arrival-time request', tags: ['Admin'], security: [{ AdminCookie: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Status changed transactionally; notification delivery state included' }, '403': { $ref: '#/components/responses/Forbidden' }, '404': { $ref: '#/components/responses/NotFound' }, '422': { $ref: '#/components/responses/BadRequest' } },
      },
    },
    '/admin/stay-requests': {
      get: { summary: 'List durable booking requests and latest delivery state', tags: ['Admin', 'Booking'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Stay requests' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/admin/stay-requests/{id}': {
      patch: {
        summary: 'Retry dead booking delivery or close a completed request', tags: ['Admin', 'Booking'], security: [{ AdminCookie: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Requested action applied transactionally' }, '403': { $ref: '#/components/responses/Forbidden' }, '404': { $ref: '#/components/responses/NotFound' }, '422': { $ref: '#/components/responses/BadRequest' } },
      },
    },
    '/admin/bookings/{id}/claim-grants': {
      post: {
        summary: 'Issue a one-time booking claim token', tags: ['Admin'], security: [{ AdminCookie: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '201': { description: 'Plaintext token returned once' }, '403': { $ref: '#/components/responses/Forbidden' }, '404': { $ref: '#/components/responses/NotFound' }, '409': { $ref: '#/components/responses/Conflict' } },
      },
    },
    '/admin/privacy-requests': {
      get: { summary: 'List privacy requests', tags: ['Admin', 'Privacy'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Privacy requests' }, '403': { $ref: '#/components/responses/Forbidden' } } },
      post: { summary: 'Complete/reject erasure or manage a privacy hold', tags: ['Admin', 'Privacy'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Action completed' }, '201': { description: 'Hold created' }, '409': { $ref: '#/components/responses/Conflict' } } },
    },
    '/alerts': {
      get: { summary: 'Read operational alerts or managed rules', tags: ['Operations'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Alerts or rules' }, '403': { $ref: '#/components/responses/Forbidden' } } },
      post: { summary: 'Acknowledge an operational alert', tags: ['Operations'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Alert acknowledged' }, '404': { $ref: '#/components/responses/NotFound' } } },
      put: { summary: 'Update a managed alert rule', tags: ['Operations'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Rule updated' }, '404': { $ref: '#/components/responses/NotFound' } } },
      delete: { summary: 'Reject deletion of built-in rules; disable them instead', tags: ['Operations'], security: [{ AdminCookie: [] }], responses: { '405': { description: 'Built-in rules cannot be deleted' } } },
    },
    '/alerts/webhook': {
      get: { summary: 'Read the external alert receiver capability status', tags: ['Operations'], responses: { '200': { description: 'Receiver capability status' } } },
      post: { summary: 'Store an authenticated external alert', tags: ['Operations'], security: [{ WebhookBearer: [] }], responses: { '200': { description: 'Alert stored' }, '401': { $ref: '#/components/responses/Unauthorized' }, '429': { $ref: '#/components/responses/RateLimited' }, '503': { $ref: '#/components/responses/Unavailable' } } },
    },
    '/errors': {
      post: { summary: 'Ingest a bounded and redacted client error report', tags: ['Operations'], responses: { '201': { description: 'Report stored' }, '413': { description: 'Report exceeds 16 KiB' }, '415': { description: 'JSON content type required' }, '422': { $ref: '#/components/responses/BadRequest' }, '429': { $ref: '#/components/responses/RateLimited' } } },
    },
    '/metrics': {
      get: { summary: 'Read in-process metrics', tags: ['Operations'], security: [{ AdminCookie: [] }, { ApiKeyAuth: [] }], responses: { '200': { description: 'Metrics snapshot' }, '403': { $ref: '#/components/responses/Forbidden' } } },
      post: { summary: 'Submit a bounded custom in-process metric', tags: ['Operations'], security: [{ AdminCookie: [] }, { ApiKeyAuth: [] }], responses: { '200': { description: 'Metric accepted' }, '403': { $ref: '#/components/responses/Forbidden' }, '422': { $ref: '#/components/responses/BadRequest' } } },
    },
    '/security/csp-report': {
      post: { summary: 'Store a bounded browser CSP violation report', tags: ['Operations'], responses: { '204': { description: 'Report accepted' }, '400': { $ref: '#/components/responses/BadRequest' }, '413': { description: 'Report exceeds 16 KiB' }, '429': { $ref: '#/components/responses/RateLimited' } } },
      options: { summary: 'CSP reporting preflight', tags: ['Operations'], responses: { '204': { description: 'Preflight accepted' } } },
    },
    '/security/dashboard': {
      get: { summary: 'Read persisted security events, alerts, health, or reports', tags: ['Operations'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Requested security view' }, '400': { $ref: '#/components/responses/BadRequest' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
    },
    '/internal/cache-metrics': {
      get: { summary: 'Read internal cache and dataset-version diagnostics', description: 'Requires an API key from INTERNAL_API_KEYS.', tags: ['Operations'], security: [{ ApiKeyAuth: [] }], responses: { '200': { description: 'Internal cache diagnostics' }, '401': { $ref: '#/components/responses/Unauthorized' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/internal/booking-outbox': {
      post: { summary: 'Drain durable booking and check-in webhook deliveries', tags: ['Operations'], security: [{ CronBearer: [] }], responses: { '200': { description: 'Drain result' }, '404': { description: 'Hidden when the bearer secret is invalid' } } },
    },
  },
  tags: [
    { name: 'Health' }, { name: 'Content' }, { name: 'Booking' }, { name: 'Portal' },
    { name: 'Guest' }, { name: 'Privacy' }, { name: 'Analytics' }, { name: 'Admin' }, { name: 'Operations' },
  ],
} as const;
