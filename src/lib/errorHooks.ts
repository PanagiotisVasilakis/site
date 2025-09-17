/**
 * React hooks for error handling and reporting integration
 * Provides convenient hooks for components to handle errors gracefully
 */

import { useCallback, useEffect, useRef } from 'react';
import { useErrorReporting } from './errorReporting';
import { useErrorHandler } from './errorBoundary';

// Hook for API error handling
export function useAPIErrorHandler() {
  const { reportAPIError, addBreadcrumb } = useErrorReporting();
  const { handleError } = useErrorHandler();

  const handleAPIError = useCallback(async (
    endpoint: string,
    error: Error,
    response?: Response
  ) => {
    const status = response?.status || 0;
    
    // Add breadcrumb for API call
    addBreadcrumb('api', `API call failed: ${endpoint}`, 'error', {
      endpoint,
      status,
      errorMessage: error.message,
    });

    // Report the error
    await reportAPIError(endpoint, status, error);

    // Handle error with boundary system
    handleError(error, `api-error-${endpoint}`, {
      endpoint,
      status,
      timestamp: new Date().toISOString(),
    });

    return {
      error,
      status,
      reported: true,
    };
  }, [reportAPIError, addBreadcrumb, handleError]);

  return { handleAPIError };
}

// Hook for user action error handling
export function useUserActionErrorHandler() {
  const { reportUserAction, addBreadcrumb, trackUserInteraction } = useErrorReporting();
  const { handleError } = useErrorHandler();

  const handleUserActionError = useCallback(async (
    action: string,
    error: Error,
    element?: string,
    data?: Record<string, unknown>
  ) => {
    // Track the user interaction that led to the error
    if (element) {
      trackUserInteraction(element, action, data);
    }

    // Add breadcrumb for the action
    addBreadcrumb('user', `User action failed: ${action}`, 'error', {
      action,
      element,
      errorMessage: error.message,
      ...data,
    });

    // Report the error
    await reportUserAction(action, error, data);

    // Handle error with boundary system
    handleError(error, `user-action-${action}`, {
      action,
      element,
      data,
      timestamp: new Date().toISOString(),
    });

    return {
      error,
      action,
      reported: true,
    };
  }, [reportUserAction, addBreadcrumb, trackUserInteraction, handleError]);

  return { handleUserActionError };
}

// Hook for async operation error handling
export function useAsyncErrorHandler() {
  const { reportError, addBreadcrumb } = useErrorReporting();
  const { handleError } = useErrorHandler();

  const handleAsyncError = useCallback(async (
    operation: string,
    error: Error,
    context?: Record<string, unknown>
  ) => {
    // Add breadcrumb for async operation
    addBreadcrumb('async', `Async operation failed: ${operation}`, 'error', {
      operation,
      errorMessage: error.message,
      ...context,
    });

    // Report the error
    await reportError(error, {
      operation,
      category: 'async',
      ...context,
    });

    // Handle error with boundary system
    handleError(error, `async-${operation}`, {
      operation,
      context,
      timestamp: new Date().toISOString(),
    });

    return {
      error,
      operation,
      reported: true,
    };
  }, [reportError, addBreadcrumb, handleError]);

  return { handleAsyncError };
}

// Hook for form error handling
export function useFormErrorHandler() {
  const { reportUserAction, addBreadcrumb } = useErrorReporting();
  const errorStateRef = useRef<Record<string, string>>({});

  const handleFieldError = useCallback((
    fieldName: string,
    error: string | Error,
    formName?: string
  ) => {
    const errorMessage = error instanceof Error ? error.message : error;
    
    // Store field error
    errorStateRef.current[fieldName] = errorMessage;

    // Add breadcrumb for field error
    addBreadcrumb('form', `Form field error: ${fieldName}`, 'warn', {
      fieldName,
      formName,
      errorMessage,
    });

    return errorMessage;
  }, [addBreadcrumb]);

  const handleFormSubmitError = useCallback(async (
    formName: string,
    error: Error,
    formData?: Record<string, unknown>
  ) => {
    // Add breadcrumb for form submission
    addBreadcrumb('form', `Form submission failed: ${formName}`, 'error', {
      formName,
      errorMessage: error.message,
      fieldErrors: { ...errorStateRef.current },
    });

    // Report the error
    await reportUserAction(`submit-${formName}`, error, {
      formName,
      formData,
      fieldErrors: { ...errorStateRef.current },
    });

    return {
      error,
      formName,
      fieldErrors: { ...errorStateRef.current },
      reported: true,
    };
  }, [reportUserAction, addBreadcrumb]);

  const clearFieldError = useCallback((fieldName: string) => {
    delete errorStateRef.current[fieldName];
  }, []);

  const clearAllErrors = useCallback(() => {
    errorStateRef.current = {};
  }, []);

  const getFieldError = useCallback((fieldName: string) => {
    return errorStateRef.current[fieldName];
  }, []);

  const hasErrors = useCallback(() => {
    return Object.keys(errorStateRef.current).length > 0;
  }, []);

  return {
    handleFieldError,
    handleFormSubmitError,
    clearFieldError,
    clearAllErrors,
    getFieldError,
    hasErrors,
  };
}

// Hook for component lifecycle error handling
export function useComponentErrorHandler(componentName: string) {
  const { reportError, addBreadcrumb } = useErrorReporting();
  const { handleError } = useErrorHandler();

  // Track component mount
  useEffect(() => {
    addBreadcrumb('component', `Component mounted: ${componentName}`, 'debug');

    // Track component unmount
    return () => {
      addBreadcrumb('component', `Component unmounted: ${componentName}`, 'debug');
    };
  }, [componentName, addBreadcrumb]);

  const handleComponentError = useCallback(async (
    error: Error,
    phase: 'mount' | 'update' | 'unmount' | 'event',
    context?: Record<string, unknown>
  ) => {
    // Add breadcrumb for component error
    addBreadcrumb('component', `Component error in ${componentName} during ${phase}`, 'error', {
      componentName,
      phase,
      errorMessage: error.message,
      ...context,
    });

    // Report the error
    await reportError(error, {
      componentName,
      phase,
      category: 'component',
      ...context,
    });

    // Handle error with boundary system
    handleError(error, `component-${componentName}-${phase}`, {
      componentName,
      phase,
      context,
      timestamp: new Date().toISOString(),
    });

    return {
      error,
      componentName,
      phase,
      reported: true,
    };
  }, [componentName, reportError, addBreadcrumb, handleError]);

  return { handleComponentError };
}

// Hook for performance monitoring and error reporting
export function usePerformanceErrorHandler() {
  const { reportPerformanceIssue, addBreadcrumb } = useErrorReporting();

  const handlePerformanceIssue = useCallback(async (
    metric: string,
    value: number,
    threshold: number,
    context?: Record<string, unknown>
  ) => {
    if (value <= threshold) return false;

    // Add breadcrumb for performance issue
    addBreadcrumb('performance', `Performance threshold exceeded: ${metric}`, 'warn', {
      metric,
      value,
      threshold,
      exceedBy: value - threshold,
      ...context,
    });

    // Create performance error
    const error = new Error(`Performance threshold exceeded: ${metric} = ${value}ms (threshold: ${threshold}ms)`);
    error.name = 'PerformanceError';

    // Report the performance issue
    await reportPerformanceIssue(metric, value, error);

    return {
      error,
      metric,
      value,
      threshold,
      reported: true,
    };
  }, [reportPerformanceIssue, addBreadcrumb]);

  const measureAndReport = useCallback(async <T>(
    operation: string,
    fn: () => Promise<T> | T,
    threshold = 1000, // 1 second default
    context?: Record<string, unknown>
  ): Promise<{ result: T; duration: number; thresholdExceeded: boolean }> => {
    const startTime = performance.now();
    
    try {
      const result = await fn();
      const duration = performance.now() - startTime;
      
      const thresholdExceeded = await handlePerformanceIssue(
        operation,
        duration,
        threshold,
        context
      );

      return {
        result,
        duration,
        thresholdExceeded: Boolean(thresholdExceeded),
      };
    } catch (error) {
      const duration = performance.now() - startTime;
      
      // Report both the error and performance if it was slow
      if (duration > threshold) {
        await handlePerformanceIssue(operation, duration, threshold, {
          ...context,
          errorOccurred: true,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }

      throw error; // Re-throw the original error
    }
  }, [handlePerformanceIssue]);

  return { handlePerformanceIssue, measureAndReport };
}