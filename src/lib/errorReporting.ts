/**
 * Client-side error reporting utility
 * Captures and sends errors to the server for monitoring and analysis
 */

interface ErrorContext {
  url: string;
  timestamp: string;
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
  category?: string;
}

interface ErrorLocation {
  fileName?: string;
  lineNumber?: number;
  columnNumber?: number;
}

interface ReportOptions {
  category?: string;
  /** Location reported by the browser (e.g. ErrorEvent); preferred over the stack-derived one. */
  location?: ErrorLocation;
}

class ErrorReporter {
  private reportingEndpoint = '/api/errors';

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupGlobalErrorHandlers();
    }
  }

  private setupGlobalErrorHandlers(): void {
    // Handle JavaScript errors
    window.addEventListener('error', (event) => {
      void this.reportError(event.error || new Error(event.message), {
        location: {
          fileName: event.filename || undefined,
          lineNumber: event.lineno || undefined,
          columnNumber: event.colno || undefined,
        },
      });
    });

    // Handle unhandled Promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      const error = event.reason instanceof Error ? event.reason : new Error(String(event.reason));
      void this.reportError(error, { category: 'unhandledRejection' });
    });
  }

  private getErrorContext(): ErrorContext {
    return {
      url: window.location.href,
      timestamp: new Date().toISOString(),
      buildVersion: process.env.NEXT_PUBLIC_BUILD_VERSION,
      environment: process.env.NODE_ENV as 'development' | 'staging' | 'production',
    };
  }

  async reportError(error: Error, options: ReportOptions = {}): Promise<boolean> {
    try {
      const truncate = (value: string | undefined, max: number): string | undefined => {
        if (typeof value !== 'string') return value;
        return value.length > max ? value.slice(0, max) : value;
      };

      // Prepare context with length bounds matching server schema
      const rawContext = this.getErrorContext();
      const boundedContext = {
        ...rawContext,
        url: truncate(rawContext.url, 500) || rawContext.url,
        buildVersion: truncate(rawContext.buildVersion, 50),
      };

      const location = options.location;
      const report: ErrorReport = {
        error: {
          name: truncate(error.name, 100) || error.name,
          message: truncate(error.message, 500) || error.message,
          // The server keeps the first 5 lines and rejects stacks over 2,000 characters.
          stack: truncate(error.stack?.split('\n').slice(0, 5).join('\n'), 2000),
          fileName: truncate(location?.fileName ?? this.extractFileFromStack(error.stack), 200),
          lineNumber: location?.lineNumber ?? this.extractLineFromStack(error.stack),
          columnNumber: location?.columnNumber ?? this.extractColumnFromStack(error.stack),
        },
        context: boundedContext,
        category: truncate(options.category, 50),
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
}

// Create global instance
export const errorReporter = new ErrorReporter();
