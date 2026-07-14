import { drainOutbox } from '@/lib/bookingOutbox';

async function main() {
  const result = await drainOutbox(50);
  process.stdout.write(`${JSON.stringify({ worker: 'outbox', ...result, at: new Date().toISOString() })}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ worker: 'outbox', status: 'failed', error: message })}\n`);
  process.exitCode = 1;
});
