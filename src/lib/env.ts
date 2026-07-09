/**
 * Centralized environment variable validation
 * Validates all required env vars at startup to fail fast
 */

import { z } from 'zod';

// Schema for all required environment variables
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url().min(1, 'DATABASE_URL is required'),

  // Security secrets (must be strong in production)
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
  ADMIN_DASH_SECRET: z.string().min(20, 'ADMIN_DASH_SECRET must be at least 20 characters'),
  GUEST_JWT_SECRET: z.string().min(32, 'GUEST_JWT_SECRET must be at least 32 characters'),
  SECURITY_ENC_KEY_HEX: z.string().length(64, 'SECURITY_ENC_KEY_HEX must be exactly 64 hex characters'),
  SECURITY_PEPPER: z.string().min(16, 'SECURITY_PEPPER must be at least 16 characters'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

  // API keys (optional but validated format if present)
  VALID_API_KEYS: z.string().optional(),
  INTERNAL_API_KEYS: z.string().optional(),
  
  // CORS and origins
  ALLOWED_ORIGINS: z.string().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),

  // Analytics and monitoring (optional)
  ENABLE_ANALYTICS: z.enum(['true', 'false']).optional().default('false'),
  
  // Rate limiting (optional with defaults)
  RATE_LIMIT_MAX_REQUESTS: z.string().regex(/^\d+$/).optional().default('100'),
  RATE_LIMIT_WINDOW_MS: z.string().regex(/^\d+$/).optional().default('60000'),

  // Testing (optional)
  TEST_DATABASE_URL: z.string().url().optional(),
});

type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

/**
 * Validate environment variables
 * Call this at application startup to fail fast if config is invalid
 */
export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  try {
    validatedEnv = envSchema.parse(process.env);
    return validatedEnv;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.issues.forEach((issue) => {
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
      throw new Error('Invalid environment configuration. Check the errors above.');
    }
    throw error;
  }
}
