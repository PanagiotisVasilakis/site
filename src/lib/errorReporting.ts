/**
 * Client-side error reporting utility
 * Captures and sends errors to the server for monitoring and analysis
 */

type ErrorLevel = 'debug' | 'info' | 'warn' | 'error';

interface ErrorBreadcrumb {
  timestamp: string;
  category: string;
  message: string;
  level: ErrorLevel;
  data?: Record<string, unknown>;
}

interface ErrorContext {
  url: string;
  userAgent: string;
  timestamp: string;
  userId?: string;
  sessionId?: string;
  buildVersion?: string;
  environment?: 'development' | 'staging' | 'production';
}

interface ErrorReport {
  error: {
    name: string;
    message: string;
    stack?: string;
    fileName?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  context: ErrorContext;
  metadata?: Record<string, unknown>;
  breadcrumbs?: ErrorBreadcrumb[];
}

class ErrorReporter {
  private breadcrumbs: ErrorBreadcrumb[] = [];
  private maxBreadcrumbs = 20;
  private sessionId: string;
  private userId?: string;
  private isEnabled = true;
  private reportingEndpoint = '/api/errors';

  constructor() {
    this.sessionId = this.generateSessionId();
    this.setupGlobalErrorHandlers();
    this.addBreadcrumb('session', 'Session started', 'info');
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private setupGlobalErrorHandlers(): void {
    // Only set up window event listeners in browser environment
    if (typeof window === 'undefined') {
      return;
    }

    // Handle JavaScript errors
    window.addEventListener('error', (event) => {
      this.reportError(event.error || new Error(event.message), {
        fileName: event.filename,
        lineNumber: event.lineno,
        columnNumber: event.colno,
      });
    });

    // Handle unhandled Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      this.reportError(error, { category: 'unhandledRejection' });
    });

    // Handle React error boundary errors (if using our error boundary)
    window.addEventListener('react-error', ((event: CustomEvent) => {
      this.reportError(event.detail.error, { 
        category: 'reactError',
        componentStack: event.detail.componentStack,
      });
    }) as EventListener);
  }

  setUserId(userId: string): void {
    this.userId = userId;
    this.addBreadcrumb('user', `User set: ${userId}`, 'info');
  }

  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    this.addBreadcrumb('config', `Error reporting ${enabled ? 'enabled' : 'disabled'}`, 'info');
  }

  addBreadcrumb(category: string, message: string, level: ErrorLevel = 'info', data?: Record<string, unknown>): void {
    if (!this.isEnabled) return;

    const breadcrumb: ErrorBreadcrumb = {
      timestamp: new Date().toISOString(),
      category,
      message,
      level,
      data,
    };

    this.breadcrumbs.push(breadcrumb);

    // Keep only the most recent breadcrumbs
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs = this.breadcrumbs.slice(-this.maxBreadcrumbs);
    }
  }

  private getErrorContext(): ErrorContext {
    return {
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      userId: this.userId,
      sessionId: this.sessionId,
      buildVersion: process.env.NEXT_PUBLIC_BUILD_VERSION,
      environment: process.env.NODE_ENV as 'development' | 'staging' | 'production',
    };
  }

  async reportError(
    error: Error, 
    metadata?: Record<string, unknown>,
    options: { 
      skipBreadcrumb?: boolean;
      category?: string;
    } = {}
  ): Promise<boolean> {
    if (!this.isEnabled) return false;

    try {
      // Add breadcrumb for this error unless skipped
      if (!options.skipBreadcrumb) {
        this.addBreadcrumb(
          options.category || 'error',
          `Error: ${error.name}: ${error.message}`,
          'error',
          metadata
        );
      }

      const report: ErrorReport = {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
          // Extract file info from stack if available
          fileName: this.extractFileFromStack(error.stack),
          lineNumber: this.extractLineFromStack(error.stack),
          columnNumber: this.extractColumnFromStack(error.stack),
        },
        context: this.getErrorContext(),
        metadata,
        breadcrumbs: [...this.breadcrumbs], // Send copy
      };

      const response = await fetch(this.reportingEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(report),
      });

      if (!response.ok) {
        console.warn('Failed to report error:', response.status, response.statusText);
        return false;
      }

      return true;
    } catch (reportingError) {
      console.warn('Error while reporting error:', reportingError);
      return false;
    }
  }

  private extractFileFromStack(stack?: string): string | undefined {
    if (!stack) return undefined;
    const match = stack.match(/at.*\((.+):\d+:\d+\)/);
    return match?.[1];
  }

  private extractLineFromStack(stack?: string): number | undefined {
    if (!stack) return undefined;
    const match = stack.match(/at.*\(.+:(\d+):\d+\)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  private extractColumnFromStack(stack?: string): number | undefined {
    if (!stack) return undefined;
    const match = stack.match(/at.*\(.+:\d+:(\d+)\)/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  // Convenience methods for different error types
  reportAPIError(endpoint: string, status: number, error: Error): Promise<boolean> {
    return this.reportError(error, {
      endpoint,
      status,
      category: 'api',
    }, { category: 'api' });
  }

  reportUserAction(action: string, error: Error, data?: Record<string, unknown>): Promise<boolean> {
    return this.reportError(error, {
      action,
      ...data,
      category: 'userAction',
    }, { category: 'userAction' });
  }

  reportPerformanceIssue(metric: string, value: number, error?: Error): Promise<boolean> {
    const perfError = error || new Error(`Performance issue: ${metric} = ${value}`);
    return this.reportError(perfError, {
      metric,
      value,
      category: 'performance',
    }, { category: 'performance' });
  }

  // Navigation tracking for better error context
  trackNavigation(from: string, to: string): void {
    this.addBreadcrumb('navigation', `Navigated from ${from} to ${to}`, 'info', {
      from,
      to,
    });
  }

  // UI interaction tracking
  trackUserInteraction(element: string, action: string, data?: Record<string, unknown>): void {
    this.addBreadcrumb('ui', `${action} on ${element}`, 'info', {
      element,
      action,
      ...data,
    });
  }

  // Clear breadcrumbs (useful for privacy or debugging)
  clearBreadcrumbs(): void {
    this.breadcrumbs = [];
    this.addBreadcrumb('system', 'Breadcrumbs cleared', 'info');
  }

  // Get current state for debugging
  getState(): {
    sessionId: string;
    userId?: string;
    breadcrumbsCount: number;
    isEnabled: boolean;
  } {
    return {
      sessionId: this.sessionId,
      userId: this.userId,
      breadcrumbsCount: this.breadcrumbs.length,
      isEnabled: this.isEnabled,
    };
  }
}

// Create global instance
export const errorReporter = new ErrorReporter();

// Convenience exports
export const reportError = errorReporter.reportError.bind(errorReporter);
export const addBreadcrumb = errorReporter.addBreadcrumb.bind(errorReporter);
export const setUserId = errorReporter.setUserId.bind(errorReporter);
export const trackNavigation = errorReporter.trackNavigation.bind(errorReporter);
export const trackUserInteraction = errorReporter.trackUserInteraction.bind(errorReporter);

// React integration
export function useErrorReporting() {
  return {
    reportError: errorReporter.reportError.bind(errorReporter),
    reportAPIError: errorReporter.reportAPIError.bind(errorReporter),
    reportUserAction: errorReporter.reportUserAction.bind(errorReporter),
    reportPerformanceIssue: errorReporter.reportPerformanceIssue.bind(errorReporter),
    addBreadcrumb: errorReporter.addBreadcrumb.bind(errorReporter),
    trackUserInteraction: errorReporter.trackUserInteraction.bind(errorReporter),
  };
}

// Types export
export type { ErrorLevel, ErrorBreadcrumb, ErrorContext, ErrorReport };