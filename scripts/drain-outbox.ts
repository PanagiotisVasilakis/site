import { drainOutbox } from '@/lib/bookingOutbox';
import { runWorker } from './lib/run-worker';

async function main() {
  const result = await drainOutbox(50);
  process.stdout.write(`${JSON.stringify({ worker: 'outbox', ...result, at: new Date().toISOString() })}\n`);
}

runWorker('outbox', main);
