# Error Handling & Logging Framework Documentation

## Overview

This framework provides enterprise-grade error handling, structured logging, and error reporting capabilities for the Next.js application. It consists of multiple integrated components that work together to capture, log, report, and recover from errors across the entire application stack.

## Architecture Components

### 1. Enterprise Logger (`src/lib/logger-enterprise.ts`)

**Purpose**: Structured logging with correlation tracking and performance monitoring.

**Key Features**:
- Correlation ID tracking using AsyncLocalStorage
- Structured log formatting with metadata
- Performance timing and metrics
- Log level management (debug, info, warn, error)
- Data sanitization and redaction
- External service integration points

**Usage**:
```typescript
import { logger } from '@/lib/logger-enterprise';

// Basic logging
logger.info('User logged in', { userId: '123', timestamp: Date.now() });
logger.error('Database connection failed', { host: 'db.example.com' }, error);

// With correlation context
logger.withContext({ userId: '123', requestId: 'req-456' }, () => {
  logger.info('Processing user request');
  // All logs within this context will include userId and requestId
});

// Performance timing
const timer = logger.startTimer('database-query');
await performDatabaseQuery();
timer.end({ query: 'SELECT * FROM users' });
```

### 2. Error Boundaries (`src/lib/errorBoundary.tsx`)

**Purpose**: React error boundaries with granular recovery strategies and retry mechanisms.

**Components**:
- `ErrorBoundary`: Main boundary component with configurable levels
- `PageErrorBoundary`: Page-level error boundary
- `SectionErrorBoundary`: Section-level error boundary  
- `ComponentErrorBoundary`: Component-level error boundary
- `withErrorBoundary`: HOC for wrapping components

**Usage**:
```tsx
import { ErrorBoundary, withErrorBoundary } from '@/lib/errorBoundary';

// Wrap components with error boundaries
<ErrorBoundary 
  level="page" 
  maxRetries={3}
  onError={(error, errorInfo, context) => {
    // Custom error handling
  }}
>
  <YourComponent />
</ErrorBoundary>

// Using HOC
const SafeComponent = withErrorBoundary(YourComponent, {
  level: 'component',
  maxRetries: 2,
});

// Programmatic error handling
function MyComponent() {
  const { reportError, handleError } = useErrorHandler();
  
  const handleClick = async () => {
    try {
      await riskyOperation();
    } catch (error) {
      handleError(error, 'user-action', { action: 'button-click' });
    }
  };
}
```

### 3. API Error Handler (`src/lib/apiErrorHandler.ts`)

**Purpose**: API route error handling middleware with structured responses and validation.

**Features**:
- Structured error types and responses
- Request validation with Zod integration
- Correlation tracking for API requests
- Rate limiting and timeout handling
- Success response utilities

**Usage**:
```typescript
import { withErrorHandler, validateRequestBody, ApiError } from '@/lib/apiErrorHandler';

// API route with error handling
export const POST = withErrorHandler(async (request: NextRequest) => {
  const validateBody = validateRequestBody(UserSchema);
  const userData = await validateBody(request);
  
  if (!userData.email) {
    throw new ApiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Email is required',
      { field: 'email' }
    );
  }
  
  const user = await createUser(userData);
  return createSuccessResponse(user, 201);
});

// Health check endpoint
export const GET = withErrorHandler(async () => {
  const health = await checkSystemHealth();
  return createSuccessResponse(health);
}, {
  enablePerformanceLogging: true,
  requestTimeoutMs: 5000,
});
```

### 4. Error Reporting (`src/lib/errorReporting.ts`)

**Purpose**: Client-side error capture and reporting to server.

**Features**:
- Global error event listeners
- Breadcrumb tracking for error context
- Rate limiting for error reports
- Automatic error categorization
- Session and user tracking

**Usage**:
```typescript
import { errorReporter, useErrorReporting } from '@/lib/errorReporting';

// Global setup (done automatically)
errorReporter.setUserId('user-123');

// Manual error reporting
await errorReporter.reportError(error, {
  context: 'payment-flow',
  step: 'credit-card-validation',
});

// Add breadcrumbs for context
errorReporter.addBreadcrumb('user', 'Clicked checkout button', 'info');
errorReporter.trackNavigation('/cart', '/checkout');

// React hook usage
function PaymentForm() {
  const { reportError, reportAPIError, addBreadcrumb } = useErrorReporting();
  
  const handleSubmit = async () => {
    try {
      addBreadcrumb('form', 'Submitting payment form', 'info');
      await submitPayment();
    } catch (error) {
      await reportError(error, { form: 'payment', step: 'submit' });
    }
  };
}
```

### 5. Error Reporting API (`src/app/api/errors/route.ts`)

**Purpose**: Server endpoint for receiving and processing client error reports.

**Features**:
- Error report validation and sanitization
- Rate limiting per IP address
- Integration with external monitoring services
- Structured error storage and analysis

**Error Report Schema**:
```typescript
{
  error: {
    name: string;
    message: string;
    stack?: string;
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  context: {
    url: string;
    userAgent: string;
    timestamp: string;
    userId?: string;
    sessionId?: string;
    buildVersion?: string;
    environment?: 'development' | 'staging' | 'production';
  };
  metadata?: Record<string, unknown>;
  breadcrumbs?: Array<{
    timestamp: string;
    category: string;
    message: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    data?: Record<string, unknown>;
  }>;
}
```

### 6. Specialized Error Hooks (`src/lib/errorHooks.ts`)

**Purpose**: Specialized React hooks for different error scenarios.

**Available Hooks**:

#### `useAPIErrorHandler()`
```typescript
const { handleAPIError } = useAPIErrorHandler();

const fetchData = async () => {
  try {
    const response = await fetch('/api/users');
    if (!response.ok) throw new Error('Failed to fetch');
    return response.json();
  } catch (error) {
    return handleAPIError('/api/users', error, response);
  }
};
```

#### `useUserActionErrorHandler()`
```typescript
const { handleUserActionError } = useUserActionErrorHandler();

const handleButtonClick = async () => {
  try {
    await performAction();
  } catch (error) {
    await handleUserActionError('checkout', error, 'checkout-button', {
      productId: '123',
      amount: 99.99,
    });
  }
};
```

#### `useFormErrorHandler()`
```typescript
const { 
  handleFieldError, 
  handleFormSubmitError, 
  getFieldError,
  clearAllErrors 
} = useFormErrorHandler();

const validateField = (field: string, value: string) => {
  if (!value) {
    return handleFieldError(field, 'This field is required', 'registration');
  }
  return null;
};
```

#### `useComponentErrorHandler(componentName)`
```typescript
const { handleComponentError } = useComponentErrorHandler('UserProfile');

useEffect(() => {
  loadUserData().catch(error => 
    handleComponentError(error, 'mount', { userId })
  );
}, []);
```

#### `usePerformanceErrorHandler()`
```typescript
const { measureAndReport } = usePerformanceErrorHandler();

const loadData = async () => {
  const { result, duration, thresholdExceeded } = await measureAndReport(
    'user-data-load',
    () => fetchUserData(),
    2000 // 2 second threshold
  );
  
  if (thresholdExceeded) {
    console.warn(`Slow data load: ${duration}ms`);
  }
  
  return result;
};
```

## Integration Patterns

### 1. Global Setup

Add to your root layout or app component:

```tsx
// app/layout.tsx
import { ErrorBoundary } from '@/lib/errorBoundary';
import { errorReporter } from '@/lib/errorReporting';

export default function RootLayout({ children }) {
  useEffect(() => {
    // Configure error reporting
    errorReporter.setUserId(user?.id);
    errorReporter.addBreadcrumb('app', 'Application started', 'info');
  }, [user]);

  return (
    <ErrorBoundary level="page" maxRetries={3}>
      <html>
        <body>
          <ErrorBoundary level="section">
            {children}
          </ErrorBoundary>
        </body>
      </html>
    </ErrorBoundary>
  );
}
```

### 2. API Route Pattern

```typescript
// app/api/example/route.ts
import { withErrorHandler, validateRequestBody, createSuccessResponse } from '@/lib/apiErrorHandler';

const RequestSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
  const validateBody = validateRequestBody(RequestSchema);
  const data = await validateBody(request);
  
  const result = await processData(data);
  return createSuccessResponse(result, 201);
}, {
  enableErrorLogging: true,
  enablePerformanceLogging: true,
  maxRequestBodySize: 1024 * 1024, // 1MB
  requestTimeoutMs: 30000, // 30 seconds
});
```

### 3. Component Error Handling

```tsx
// components/UserDashboard.tsx
import { withErrorBoundary } from '@/lib/errorBoundary';
import { useErrorReporting, useAPIErrorHandler } from '@/lib/errorHooks';

function UserDashboard({ userId }: { userId: string }) {
  const { handleAPIError } = useAPIErrorHandler();
  const { addBreadcrumb } = useErrorReporting();
  
  const loadDashboard = async () => {
    try {
      addBreadcrumb('dashboard', 'Loading user dashboard', 'info', { userId });
      const data = await fetch(`/api/users/${userId}/dashboard`);
      if (!data.ok) throw new Error('Failed to load dashboard');
      return data.json();
    } catch (error) {
      return handleAPIError(`/api/users/${userId}/dashboard`, error);
    }
  };

  // Component implementation...
}

export default withErrorBoundary(UserDashboard, {
  level: 'component',
  maxRetries: 2,
});
```

## Configuration

### Environment Variables

```bash
# Error reporting configuration
NEXT_PUBLIC_BUILD_VERSION=1.0.0
NODE_ENV=production

# External service integration
SENTRY_DSN=your-sentry-dsn
DATADOG_API_KEY=your-datadog-key
```

### Logging Levels

```typescript
// Set log level in logger-enterprise.ts
const LOG_LEVEL = process.env.NODE_ENV === 'production' ? 'warn' : 'debug';
```

### Error Boundary Configuration

```typescript
// Customize error boundary behavior
const errorBoundaryConfig = {
  level: 'page' as const,
  maxRetries: 3,
  retryDelay: 1000,
  enableRetry: true,
  onError: (error, errorInfo, context) => {
    // Custom error handling logic
  },
};
```

## External Service Integration

### Sentry Integration

```typescript
// In logger-enterprise.ts or errorReporting.ts
import * as Sentry from '@sentry/nextjs';

// Add to error reporting
const reportToSentry = (error: Error, context: Record<string, unknown>) => {
  Sentry.withScope(scope => {
    scope.setContext('errorContext', context);
    Sentry.captureException(error);
  });
};
```

### Datadog Integration

```typescript
// In logger-enterprise.ts
import { datadogLogs } from '@datadog/browser-logs';

// Add to logging
const reportToDatadog = (level: string, message: string, context: Record<string, unknown>) => {
  datadogLogs.logger.log(message, context, level);
};
```

## Testing

### Unit Tests

```typescript
// __tests__/errorBoundary.test.tsx
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '@/lib/errorBoundary';

const ThrowError = () => {
  throw new Error('Test error');
};

test('catches and displays error', () => {
  render(
    <ErrorBoundary level="component">
      <ThrowError />
    </ErrorBoundary>
  );
  
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();
});
```

### Integration Tests

```typescript
// __tests__/api/errors.test.ts
import { POST } from '@/app/api/errors/route';

test('handles error reports', async () => {
  const errorReport = {
    error: { name: 'TestError', message: 'Test message' },
    context: { url: 'http://test.com', userAgent: 'test', timestamp: new Date().toISOString() },
  };
  
  const request = new Request('http://localhost/api/errors', {
    method: 'POST',
    body: JSON.stringify(errorReport),
    headers: { 'Content-Type': 'application/json' },
  });
  
  const response = await POST(request);
  expect(response.status).toBe(201);
});
```

## Monitoring & Observability

### Key Metrics to Monitor

1. **Error Rate**: Number of errors per minute/hour
2. **Error Distribution**: Breakdown by error type, component, page
3. **Performance**: API response times, component render times
4. **Recovery Rate**: How often retry mechanisms succeed
5. **User Impact**: Errors by user session, geographic region

### Dashboard Queries

```sql
-- Error rate by endpoint
SELECT 
  endpoint,
  COUNT(*) as error_count,
  DATE_TRUNC('hour', timestamp) as hour
FROM error_logs 
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY endpoint, hour
ORDER BY error_count DESC;

-- Top error types
SELECT 
  error_name,
  COUNT(*) as occurrences,
  COUNT(DISTINCT session_id) as affected_sessions
FROM error_reports
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY error_name
ORDER BY occurrences DESC;
```

## Best Practices

### 1. Error Boundary Placement
- Use page-level boundaries for navigation errors
- Use section-level boundaries for feature areas
- Use component-level boundaries for complex widgets

### 2. Error Reporting
- Include sufficient context without sensitive data
- Rate limit error reports to prevent spam
- Categorize errors for better analysis

### 3. Performance Monitoring
- Set appropriate thresholds for different operations
- Monitor trends, not just absolute values
- Include user experience metrics

### 4. Error Recovery
- Implement graceful degradation
- Provide meaningful fallback UIs
- Allow users to retry failed operations

### 5. Privacy & Security
- Sanitize error messages in production
- Redact sensitive information from logs
- Implement proper access controls for error data

## Troubleshooting

### Common Issues

1. **Correlation IDs not appearing in logs**
   - Ensure AsyncLocalStorage is properly set up
   - Check that context is being established in API routes

2. **Error boundaries not catching errors**
   - Verify boundaries are placed correctly in component tree
   - Check that errors are being thrown during render phase

3. **Error reports not reaching server**
   - Check network connectivity and CORS settings
   - Verify API endpoint is properly configured
   - Check rate limiting settings

4. **Performance overhead**
   - Review logging levels in production
   - Optimize error reporting frequency
   - Consider sampling for high-volume operations

### Debug Mode

Enable debug logging:

```typescript
// Set in environment or configuration
process.env.DEBUG_ERROR_HANDLING = 'true';

// Enable in logger
logger.setLevel('debug');

// Enable in error reporter
errorReporter.setEnabled(true);
```

This framework provides comprehensive error handling and monitoring capabilities while maintaining performance and user experience. It's designed to be incrementally adoptable and easily extensible for specific business requirements.