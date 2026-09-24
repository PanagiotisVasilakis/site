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
                  'portal_opened', 'form_submitted', 'auth_mode_changed', 'checkin_viewed',
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
        required: ['origin', 'phone', 'password', 'acceptTerms'],
        properties: {
          origin: { type: 'string', enum: ['GR', 'ABROAD'] },
          phone: { type: 'string', minLength: 8, maxLength: 32 },
          password: { type: 'string', minLength: 8, maxLength: 128, format: 'password' },
          remember: { type: 'boolean', default: false },
          acceptTerms: { type: 'boolean', enum: [true] },
        },
      },
      PortalClaimExchange: {
        type: 'object',
        required: ['claimToken'],
        properties: {
          claimToken: { type: 'string', minLength: 32, maxLength: 256 },
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
    '/health/live': {
      get: { summary: 'Liveness probe', tags: ['Health'], responses: { '200': { description: 'Process is alive' } } },
      head: { summary: 'Liveness probe without a body', tags: ['Health'], responses: { '200': { description: 'Process is alive' } } },
    },
    '/health/ready': {
      get: { summary: 'Database and migration readiness probe', tags: ['Health'], responses: { '200': { description: 'Ready' }, '503': { $ref: '#/components/responses/Unavailable' } } },
      head: { summary: 'Readiness probe without a body', tags: ['Health'], responses: { '200': { description: 'Ready' }, '503': { description: 'Not ready' } } },
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
        summary: 'Consume the short-lived server-controlled claim exchange', tags: ['Portal'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PortalClaim' } } } },
        responses: { '200': { description: 'Guest and refresh cookies issued' }, '401': { $ref: '#/components/responses/Unauthorized' }, '409': { $ref: '#/components/responses/Conflict' }, '429': { $ref: '#/components/responses/RateLimited' } },
      },
    },
    '/portal/claim-exchange': {
      post: {
        summary: 'Exchange a host-issued token for a short-lived HttpOnly claim cookie', tags: ['Portal'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PortalClaimExchange' } } } },
        responses: { '200': { description: 'Short-lived claim exchange cookie issued' }, '401': { $ref: '#/components/responses/Unauthorized' }, '429': { $ref: '#/components/responses/RateLimited' } },
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
    '/check-in/preferences': {
      get: { summary: 'Read guest preferences and time-gated Wi-Fi details', tags: ['Guest'], security: [{ GuestCookie: [] }, { AdminCookie: [] }], responses: { '200': { description: 'Preferences' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
      post: { summary: 'Update preferences as an administrator', tags: ['Guest'], security: [{ AdminCookie: [] }], responses: { '200': { description: 'Preferences updated' }, '403': { $ref: '#/components/responses/Forbidden' } } },
    },
    '/check-in/arrival-request': {
      get: { summary: 'Read the guest latest requested arrival time', tags: ['Guest'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Latest request or null' }, '401': { $ref: '#/components/responses/Unauthorized' } } },
      post: { summary: 'Create a durable arrival-time request', tags: ['Guest'], security: [{ GuestCookie: [] }], responses: { '200': { description: 'Request stored; delivery state is sent, queued, or skipped' }, '401': { $ref: '#/components/responses/Unauthorized' }, '422': { $ref: '#/components/responses/BadRequest' } } },
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
    '/vitals': {
      post: { summary: 'Ingest a Core Web Vital', tags: ['Analytics'], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/WebVital' } } } }, responses: { '201': { description: 'Vital stored' }, '422': { $ref: '#/components/responses/BadRequest' }, '429': { $ref: '#/components/responses/RateLimited' } } },
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
    '/errors': {
      post: { summary: 'Ingest a bounded and redacted client error report', tags: ['Operations'], responses: { '201': { description: 'Report stored' }, '413': { description: 'Report exceeds 16 KiB' }, '415': { description: 'JSON content type required' }, '422': { $ref: '#/components/responses/BadRequest' }, '429': { $ref: '#/components/responses/RateLimited' } } },
    },
    '/security/csp-report': {
      post: { summary: 'Store a bounded browser CSP violation report', tags: ['Operations'], responses: { '204': { description: 'Report accepted' }, '400': { $ref: '#/components/responses/BadRequest' }, '413': { description: 'Report exceeds 16 KiB' }, '429': { $ref: '#/components/responses/RateLimited' } } },
    },
  },
  tags: [
    { name: 'Health' }, { name: 'Booking' }, { name: 'Portal' },
    { name: 'Guest' }, { name: 'Privacy' }, { name: 'Analytics' }, { name: 'Admin' }, { name: 'Operations' },
  ],
} as const;
