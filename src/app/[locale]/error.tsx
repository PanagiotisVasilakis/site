"use client";
import { useEffect } from 'react';
import { logger } from '@/lib/logger-enterprise';

export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    logger.error('Unhandled UI error (locale segment)', { message: error.message, stack: error.stack, digest: error.digest });
  }, [error]);
  return (
    <div className="min-h-svh flex items-center justify-center p-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-sm opacity-80">An unexpected error occurred. You can try to recover.</p>
        <button className="btn-tint" onClick={() => reset()}>Try again</button>
      </div>
    </div>
  );
}


