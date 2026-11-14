import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { runtimeEnvSchema } from '../src/lib/runtime-env-schema.js';

const serverPath = process.argv[2];
if (!serverPath) {
  throw new Error('Standalone server path is required');
}

// This script only starts the production build, and the standalone server.js forces
// NODE_ENV=production itself. Validate the environment that will actually run: with
// NODE_ENV unset (`npm start`) the schema would default to development, accept placeholder
// peppers and not require ORIGIN_PROXY_SHARED_SECRET.
process.env.NODE_ENV = 'production';

try {
  runtimeEnvSchema.parse(process.env);
  console.log('Environment validation passed');
} catch (error) {
  console.error('Environment validation failed; server was not started');
  if (error instanceof z.ZodError) {
    for (const issue of error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exitCode = 78;
  } else {
    throw error;
  }
}

if (process.exitCode === undefined) {
  await import(pathToFileURL(resolve(serverPath)).href);
}
