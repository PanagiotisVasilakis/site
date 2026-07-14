/**
 * Centralized environment variable validation
 * Validates all required env vars at startup to fail fast
 */

import { z } from 'zod';
import { runtimeEnvSchema } from './runtime-env-schema.js';

type Env = z.infer<typeof runtimeEnvSchema>;

let validatedEnv: Env | null = null;

export function parseEnv(input: Record<string, string | undefined>): Env {
  return runtimeEnvSchema.parse(input);
}

/**
 * Validate environment variables
 * Call this at application startup to fail fast if config is invalid
 */
export function validateEnv(): Env {
  if (validatedEnv) {
    return validatedEnv;
  }

  try {
    validatedEnv = parseEnv(process.env);
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
