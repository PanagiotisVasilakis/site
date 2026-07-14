/**
 * Next.js Instrumentation Hook
 * Runs once when the server starts (Node.js runtime only)
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_PHASE === 'phase-production-build' || process.env.NEXT_PHASE === 'phase-export') {
    return;
  }
  // Only run in Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME === 'nodejs' || !process.env.NEXT_RUNTIME) {
    const { validateEnv } = await import('@/lib/env');
    
    try {
      // Validate environment variables at startup
      validateEnv();
      console.log('✅ Environment validation passed');
    } catch (error) {
      console.error('❌ Environment validation failed - server will not start properly');
      throw error;
    }
  }
}
