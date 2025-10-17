/**
 * Manual error handling utilities for React components.
 * Provides a lightweight hook to log and forward errors to the reporter.
 */

'use client';

import { useCallback } from 'react';
import { errorReporter } from './errorReporting';

/**
 * Hook for manual error reporting
 */
export function useErrorHandler() {
  const reportError = useCallback((error: Error, context?: string, metadata?: Record<string, unknown>) => {
    console.error('Manual error report', { context, ...metadata }, error);

    try {
      void errorReporter.reportError(error, {
        context,
        source: 'useErrorHandler',
        metadata,
      });
    } catch (reportingError) {
      console.warn('Error reporting failed', { reportingError });
    }
  }, []);

  const handleError = useCallback((error: Error, context?: string, metadata?: Record<string, unknown>) => {
    reportError(error, context, metadata);
  }, [reportError]);

  return { reportError, handleError };
}

