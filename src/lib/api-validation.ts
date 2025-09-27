/**
 * API Validation Middleware
 * Request/Response validation against OpenAPI schemas
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Zod schemas derived from OpenAPI spec for runtime validation
export const ApiSchemas = {
  Category: z.object({
    id: z.string(),
    slug: z.string().regex(/^[a-z0-9\-_]+$/),
    title: z.string(),
    count: z.number().int().min(0),
  }),

  Item: z.object({
    id: z.string(),
    slug: z.string().regex(/^[a-z0-9\-_]+$/),
    name: z.string(),
    summary: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    location: z.object({
      lat: z.number(),
      lng: z.number(),
    }).optional(),
    categoryId: z.string(),
  }),

  AnalyticsEvent: z.object({
    path: z.string().max(200),
    ts: z.number().int().optional(),
    locale: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
    event: z.object({
      name: z.string(),
      props: z.record(z.string(), z.unknown()).optional(),
    }).optional(),
  }),

  WebVital: z.object({
    name: z.enum(['CLS', 'FCP', 'FID', 'INP', 'LCP', 'TTFB']),
    value: z.number().min(0),
    path: z.string(),
    ts: z.number().int().optional(),
    id: z.string().optional(),
  }),

  SecurityEvent: z.object({
    type: z.enum([
      'csp_violation',
      'rate_limit_exceeded', 
      'cors_violation',
      'auth_failure',
      'suspicious_activity',
      'api_security_violation',
      'sql_injection_attempt',
      'xss_attempt',
      'api_auth_failure'
    ]),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    timestamp: z.string().datetime(),
    ip: z.string(),
    userAgent: z.string().optional(),
    url: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),

  Error: z.object({
    error: z.string(),
    code: z.string().optional(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
};

// API validation configuration
interface ValidationConfig {
  enabled: boolean;
  validateRequests: boolean;
  validateResponses: boolean;
  logValidationErrors: boolean;
  throwOnValidationError: boolean;
}

class APIValidator {
  private config: ValidationConfig;

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = {
      enabled: true,
      validateRequests: true,
      validateResponses: process.env.NODE_ENV === 'development',
      logValidationErrors: true,
      throwOnValidationError: process.env.NODE_ENV === 'development',
      ...config,
    };
  }

  public validateRequest(
    request: NextRequest,
    schema: z.ZodSchema,
    options: { 
      validateParams?: boolean;
      validateQuery?: boolean;
      validateBody?: boolean;
    } = {}
  ): { success: boolean; data?: Record<string, unknown>; errors?: string[] } {
    if (!this.config.enabled || !this.config.validateRequests) {
      return { success: true };
    }

    const { validateParams = true, validateQuery = true, validateBody = true } = options;
    const errors: string[] = [];
    const validatedData: Record<string, unknown> = {};

    try {
      // Validate URL parameters
      if (validateParams) {
        const pathname = request.nextUrl.pathname;
        const pathParams = this.extractPathParams(pathname);
        
        if (Object.keys(pathParams).length > 0) {
          const paramResult = this.validateParams(pathParams);
          if (!paramResult.success) {
            errors.push(...paramResult.errors);
          } else {
            validatedData.params = paramResult.data;
          }
        }
      }

      // Validate query parameters
      if (validateQuery) {
        const queryParams = Object.fromEntries(request.nextUrl.searchParams.entries());
        
        if (Object.keys(queryParams).length > 0) {
          const queryResult = this.validateQuery(queryParams);
          if (!queryResult.success) {
            errors.push(...queryResult.errors);
          } else {
            validatedData.query = queryResult.data;
          }
        }
      }

      // Validate request body (for POST/PUT/PATCH)
      if (validateBody && ['POST', 'PUT', 'PATCH'].includes(request.method)) {
        // Note: Body validation would need to be done after reading the stream
        // This is a placeholder for the validation logic
        validatedData.bodyValidationRequired = true;
      }

      if (errors.length > 0) {
        if (this.config.logValidationErrors) {
          console.error('API Request Validation Errors:', {
            url: request.nextUrl.toString(),
            method: request.method,
            errors,
          });
        }

        return { success: false, errors };
      }

      return { success: true, data: validatedData };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';
      errors.push(errorMessage);

      if (this.config.logValidationErrors) {
        console.error('API Request Validation Exception:', {
          url: request.nextUrl.toString(),
          method: request.method,
          error: errorMessage,
        });
      }

      return { success: false, errors };
    }
  }

  public async validateRequestBody<T>(
    request: NextRequest,
    schema: z.ZodSchema<T>
  ): Promise<{ success: boolean; data?: T; errors?: string[] }> {
    try {
      const contentType = request.headers.get('content-type') || '';
      
      if (!contentType.includes('application/json')) {
        return {
          success: false,
          errors: ['Content-Type must be application/json'],
        };
      }

      const body = await request.json();
      const result = schema.safeParse(body);

      if (!result.success) {
        const errors = result.error.issues.map(err => 
          `${err.path.join('.')}: ${err.message}`
        );

        if (this.config.logValidationErrors) {
          console.error('API Request Body Validation Errors:', {
            url: request.nextUrl.toString(),
            method: request.method,
            errors,
          });
        }

        return { success: false, errors };
      }

      return { success: true, data: result.data };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Invalid JSON body';
      
      if (this.config.logValidationErrors) {
        console.error('API Request Body Parsing Error:', {
          url: request.nextUrl.toString(),
          method: request.method,
          error: errorMessage,
        });
      }

      return { success: false, errors: [errorMessage] };
    }
  }

  public validateResponse(
    response: unknown,
    schema: z.ZodSchema,
    context: { method: string; url: string; status: number }
  ): { success: boolean; errors?: string[] } {
    if (!this.config.enabled || !this.config.validateResponses) {
      return { success: true };
    }

    try {
      const result = schema.safeParse(response);

      if (!result.success) {
        const errors = result.error.issues.map(err => 
          `${err.path.join('.')}: ${err.message}`
        );

        if (this.config.logValidationErrors) {
          console.error('API Response Validation Errors:', {
            ...context,
            errors,
          });
        }

        if (this.config.throwOnValidationError) {
          throw new Error(`Response validation failed: ${errors.join(', ')}`);
        }

        return { success: false, errors };
      }

      return { success: true };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown validation error';

      if (this.config.logValidationErrors) {
        console.error('API Response Validation Exception:', {
          ...context,
          error: errorMessage,
        });
      }

      return { success: false, errors: [errorMessage] };
    }
  }

  private extractPathParams(pathname: string): Record<string, string> {
    // Extract dynamic parameters from Next.js route patterns
    const params: Record<string, string> = {};
    
    // Match patterns like /api/categories/[category]/items/[slug]
    const categoryMatch = pathname.match(/\/api\/categories\/([^\/]+)/);
    if (categoryMatch) {
      params.category = categoryMatch[1];
    }

    const itemMatch = pathname.match(/\/api\/categories\/[^\/]+\/items\/([^\/]+)/);
    if (itemMatch) {
      params.slug = itemMatch[1];
    }

    return params;
  }

  private validateParams(params: Record<string, string>): { success: boolean; data?: Record<string, string>; errors: string[] } {
    const errors: string[] = [];
    const validatedParams: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      // Validate parameter format based on OpenAPI spec
      if (key === 'category' || key === 'slug') {
        if (!/^[a-z0-9\-_]+$/.test(value)) {
          errors.push(`${key}: Must contain only lowercase letters, numbers, hyphens, and underscores`);
        } else if (value.length > 50) {
          errors.push(`${key}: Must be 50 characters or less`);
        } else {
          validatedParams[key] = value;
        }
      } else {
        validatedParams[key] = value;
      }
    }

    return {
      success: errors.length === 0,
      data: validatedParams,
      errors,
    };
  }

  private validateQuery(query: Record<string, string>): { success: boolean; data?: Record<string, string | number>; errors: string[] } {
    const errors: string[] = [];
    const validatedQuery: Record<string, string | number> = {};

    for (const [key, value] of Object.entries(query)) {
      switch (key) {
        case 'limit':
          const limit = parseInt(value, 10);
          if (isNaN(limit) || limit < 1 || limit > 100) {
            errors.push('limit: Must be a number between 1 and 100');
          } else {
            validatedQuery[key] = limit;
          }
          break;

        case 'minutes':
          const minutes = parseInt(value, 10);
          if (isNaN(minutes) || minutes < 1 || minutes > 10080) {
            errors.push('minutes: Must be a number between 1 and 10080');
          } else {
            validatedQuery[key] = minutes;
          }
          break;

        case 'endpoint':
          if (!['metrics', 'health', 'events', 'report', 'dashboard'].includes(value)) {
            errors.push('endpoint: Invalid endpoint value');
          } else {
            validatedQuery[key] = value;
          }
          break;

        case 'type':
          if (!['daily', 'trends'].includes(value)) {
            errors.push('type: Invalid type value');
          } else {
            validatedQuery[key] = value;
          }
          break;

        default:
          validatedQuery[key] = value;
      }
    }

    return {
      success: errors.length === 0,
      data: validatedQuery,
      errors,
    };
  }

  public createValidationErrorResponse(errors: string[]): NextResponse {
    return NextResponse.json(
      {
        error: 'validation_error',
        details: {
          message: 'Request validation failed',
          errors,
        },
      },
      { status: 400 }
    );
  }
}

// Create singleton instance
export const apiValidator = new APIValidator();

