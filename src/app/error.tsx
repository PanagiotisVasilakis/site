"use client";

import React, { useEffect } from 'react';
import { useErrorHandler } from '@/lib/errorBoundary';
import { useErrorReporting } from '@/lib/errorReporting';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const { reportError: boundaryReportError } = useErrorHandler();
  const { reportError, addBreadcrumb } = useErrorReporting();

  useEffect(() => {
    // Report error with full context
    console.error('Global unhandled UI error', {
      errorDetails: {
        name: error.name,
        message: error.message,
        digest: error.digest,
        stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      },
      context: 'global-error-boundary',
      route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'unknown',
    }, error);

    // Report to error tracking service
    reportError(error, {
      errorDigest: error.digest,
      context: 'globalErrorPage',
      route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      category: 'globalError',
    });

    // Add breadcrumb for error page display
    addBreadcrumb('ui', 'Global error page displayed', 'error', {
      errorName: error.name,
      errorDigest: error.digest,
    });

    // Report to external error tracking
    // Report using boundary error handler
    boundaryReportError(error, 'global-error-boundary', {
      digest: error.digest,
      route: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    });
  }, [error, reportError, addBreadcrumb, boundaryReportError]);

  const handleReset = () => {
    console.info('Global error recovery attempted', {
      errorDigest: error.digest,
      context: 'global-error-boundary',
    });
    reset();
  };

  const handleReload = () => {
    console.info('Page reload requested from global error', {
      errorDigest: error.digest,
      context: 'global-error-boundary',
    });
    window.location.reload();
  };

  const handleGoHome = () => {
    console.info('Homepage navigation from global error', {
      errorDigest: error.digest,
      context: 'global-error-boundary',
    });
    window.location.href = '/';
  };

  return (
    <html>
      <body>
        <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--sand-50)' }}>
          <div className="max-w-md w-full text-center space-y-6 surface-card rounded-lg shadow-lg p-8">
            {/* Error Icon */}
            <div className="text-red-500 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold page-title">Oops! Something went wrong</h1>
              <p className="text-body">
                We encountered an unexpected error. Our team has been notified and is working on a fix.
              </p>
              {error.digest && (
                <p className="text-xs text-subtle font-mono surface-subtle p-2 rounded">
                  Error ID: {error.digest}
                </p>
              )}
            </div>

            {/* Recovery Actions */}
            <div className="space-y-3">
              <button
                onClick={handleReset}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Try Again
              </button>

              <button
                onClick={handleReload}
                className="w-full px-6 py-3 border border-gray-300 text-body surface-interactive rounded-lg transition-colors"
                style={{ borderColor: 'var(--border-soft)' }}
              >
                Reload Page
              </button>

              <button
                onClick={handleGoHome}
                className="w-full px-6 py-3 border border-gray-300 text-body surface-interactive rounded-lg transition-colors"
                style={{ borderColor: 'var(--border-soft)' }}
              >
                Go to Homepage
              </button>
            </div>

            {/* Development Error Details */}
            {process.env.NODE_ENV === 'development' && (
              <details className="text-left text-xs text-subtle surface-subtle p-3 rounded">
                <summary className="cursor-pointer font-medium mb-2">Error Details (Development)</summary>
                <div className="space-y-2">
                  <div>
                    <strong>Name:</strong> {error.name}
                  </div>
                  <div>
                    <strong>Message:</strong> {error.message}
                  </div>
                  {error.digest && (
                    <div>
                      <strong>Digest:</strong> {error.digest}
                    </div>
                  )}
                  {error.stack && (
                    <div>
                      <strong>Stack Trace:</strong>
                      <pre className="mt-1 whitespace-pre-wrap text-xs bg-white p-2 rounded border overflow-auto max-h-40">
                        {error.stack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Contact Support */}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-subtle">
                Need help? Contact our{' '}
                <a href="mailto:support@villa-app.com" className="text-blue-600 hover:underline">
                  support team
                </a>
                {error.digest && (
                  <span> and include error ID: <code className="font-mono">{error.digest}</code></span>
                )}
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
