/**
 * Centralized environment variable validation
 * Validates all required env vars at startup to fail fast
 */

import { z } from 'zod';
import { runtimeEnvSchema } from './runtime-env-schema.js';

type Env = z.infer<typeof runtimeEnvSchema>;

/**
 * Validate environment variables
 * Call this at application startup to fail fast if config is invalid
 */
export function validateEnv(): Env {
  try {
    return runtimeEnvSchema.parse(process.env);
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
