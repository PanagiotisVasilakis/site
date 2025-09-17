/**
 * Enterprise-grade React Error Boundary with recovery strategies
 * Features: Granular boundaries, retry mechanisms, error reporting, fallback UIs
 */

'use client';

import React, { Component, ErrorInfo } from 'react';
import { logger } from './logger-enterprise';
import { errorReporter } from './errorReporting';

// Error boundary configuration
export interface ErrorBoundaryConfig {
  fallback?: ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: ErrorInfo, context?: string) => void;
  enableRetry?: boolean;
  maxRetries?: number;
  retryDelay?: number;
  level?: 'page' | 'section' | 'component';
  context?: string;
}

export interface ErrorFallbackProps {
  error: Error;
  errorInfo?: ErrorInfo;
  retry?: () => void;
  canRetry?: boolean;
  retryCount?: number;
  level?: 'page' | 'section' | 'component';
  context?: string;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
  isRetrying: boolean;
}

type ComponentType<P = Record<string, unknown>> = React.ComponentType<P> | React.FC<P>;

/**
 * Default error fallback components for different boundary levels
 */
export const ErrorFallbacks = {
  page: ({ error, retry, canRetry, context }: ErrorFallbackProps) => (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md w-full text-center space-y-6 bg-white rounded-lg shadow-lg p-8">
        <div className="text-red-500 mb-4">
          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Something went wrong</h1>
        <p className="text-gray-600">
          We encountered an unexpected error while loading this page. 
          {context && ` (${context})`}
        </p>
        <div className="space-y-3">
          {canRetry && (
            <button
              onClick={retry}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Try Again
            </button>
          )}
          <button
            onClick={() => window.location.href = '/'}
            className="w-full px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Go to Homepage
          </button>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <details className="text-left text-xs text-gray-500 bg-gray-50 p-3 rounded">
            <summary className="cursor-pointer font-medium">Error Details</summary>
            <pre className="mt-2 whitespace-pre-wrap">{error.stack}</pre>
          </details>
        )}
      </div>
    </div>
  ),

  section: ({ retry, canRetry, context }: Omit<ErrorFallbackProps, 'error'>) => (
    <div className="w-full p-6 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-red-800">Section Error</h3>
          <p className="mt-1 text-sm text-red-700">
            This section failed to load properly.
            {context && ` (${context})`}
          </p>
          {canRetry && (
            <button
              onClick={retry}
              className="mt-3 text-sm bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  ),

  component: ({ retry, canRetry, context }: Omit<ErrorFallbackProps, 'error'>) => (
    <div className="w-full p-4 bg-yellow-50 border border-yellow-200 rounded">
      <div className="flex items-center space-x-2">
        <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
        </svg>
        <span className="text-sm text-yellow-800">
          Component error {context && `(${context})`}
        </span>
        {canRetry && (
          <button
            onClick={retry}
            className="text-xs bg-yellow-600 text-white px-2 py-1 rounded hover:bg-yellow-700 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  ),
} as const;

/**
 * Enterprise Error Boundary Component
 */
export class ErrorBoundary extends Component<
  React.PropsWithChildren<ErrorBoundaryConfig>,
  ErrorBoundaryState
> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: React.PropsWithChildren<ErrorBoundaryConfig>) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, context, level = 'component' } = this.props;

    // Log error with context
    logger.error('React Error Boundary caught error', {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      errorInfo: {
        componentStack: errorInfo.componentStack,
      },
      context,
      level,
      retryCount: this.state.retryCount,
    }, error);

    // Report to error tracking service
    errorReporter.reportError(error, {
      boundaryLevel: level,
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount,
      context,
      category: 'reactBoundary',
    });

    // Call custom error handler
    onError?.(error, errorInfo, context);

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Report to external error tracking services
    this.reportError(error, errorInfo);
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  private reportError = (_error: Error, _errorInfo: ErrorInfo): void => {
    void _error;
    void _errorInfo;
    // Integration points for error reporting services
    try {
      // Example: Sentry integration
      // if (typeof window !== 'undefined' && window.Sentry) {
      //   window.Sentry.withScope((scope) => {
      //     scope.setTag('errorBoundary', true);
      //     scope.setContext('errorInfo', errorInfo);
      //     scope.setContext('props', this.props);
      //     window.Sentry.captureException(error);
      //   });
      // }

      // Example: Custom error reporting
      // if (typeof window !== 'undefined') {
      //   fetch('/api/errors', {
      //     method: 'POST',
      //     headers: { 'Content-Type': 'application/json' },
      //     body: JSON.stringify({
      //       error: {
      //         name: error.name,
      //         message: error.message,
      //         stack: error.stack,
      //       },
      //       errorInfo,
      //       context: this.props.context,
      //       level: this.props.level,
      //       url: window.location.href,
      //       userAgent: navigator.userAgent,
      //       timestamp: new Date().toISOString(),
      //     }),
      //   }).catch(() => {
      //     // Silently fail error reporting to prevent infinite loops
      //   });
      // }
    } catch (reportingError) {
      logger.warn('Error reporting failed', { reportingError });
    }
  };

  private handleRetry = () => {
    const { maxRetries = 3, retryDelay = 1000 } = this.props;
    
    if (this.state.retryCount >= maxRetries) {
      logger.warn('Max retry attempts reached', {
        context: this.props.context,
        retryCount: this.state.retryCount,
        maxRetries,
      });
      return;
    }

    this.setState({ isRetrying: true });

    logger.info('Retrying error boundary', {
      context: this.props.context,
      retryCount: this.state.retryCount + 1,
      maxRetries,
    });

    this.retryTimeoutId = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: this.state.retryCount + 1,
        isRetrying: false,
      });
    }, retryDelay);
  };

  render() {
    const { 
      children, 
      fallback: CustomFallback, 
      enableRetry = true, 
      maxRetries = 3,
      level = 'component',
      context 
    } = this.props;

    if (this.state.hasError && this.state.error) {
      const canRetry = enableRetry && this.state.retryCount < maxRetries;
      const FallbackComponent = CustomFallback || ErrorFallbacks[level];

      return (
        <FallbackComponent
          error={this.state.error}
          errorInfo={this.state.errorInfo || undefined}
          retry={this.handleRetry}
          canRetry={canRetry}
          retryCount={this.state.retryCount}
          level={level}
          context={context}
        />
      );
    }

    return children;
  }
}

/**
 * HOC for wrapping components with error boundaries
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: ComponentType<P>,
  config?: ErrorBoundaryConfig
) {
  const WithErrorBoundaryComponent = (props: P) => (
    <ErrorBoundary {...config}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundaryComponent.displayName = 
    `withErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithErrorBoundaryComponent;
}

/**
 * Hook for manual error reporting
 */
export function useErrorHandler() {
  const reportError = React.useCallback((error: Error, context?: string, metadata?: Record<string, unknown>) => {
    logger.error('Manual error report', { context, ...metadata }, error);

    // Report to external services
    try {
      // Integration with error reporting services would go here
    } catch (reportingError) {
      logger.warn('Error reporting failed', { reportingError });
    }
  }, []);

  const handleError = React.useCallback((error: Error, context?: string, metadata?: Record<string, unknown>) => {
    // Log and report the error
    reportError(error, context, metadata);

    // You could trigger additional recovery actions here
    // For example, clearing localStorage, resetting state, etc.
  }, [reportError]);

  return { reportError, handleError };
}

/**
 * Async error boundary for handling Promise rejections
 */
export function useAsyncErrorHandler() {
  const { reportError } = useErrorHandler();

  const handleAsyncError = React.useCallback(
    function <T>(promiseFn: () => Promise<T>, context?: string): Promise<T | null> {
      return promiseFn().catch((error) => {
        reportError(
          error instanceof Error ? error : new Error(String(error)),
          context || 'async operation'
        );
        return null;
      });
    },
    [reportError]
  );

  return { handleAsyncError };
}