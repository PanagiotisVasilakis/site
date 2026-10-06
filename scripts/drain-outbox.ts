import { drainOutbox } from '@/lib/bookingOutbox';
import { prisma } from '@/lib/prisma';

async function main() {
  const result = await drainOutbox(50);
  process.stdout.write(`${JSON.stringify({ worker: 'outbox', ...result, at: new Date().toISOString() })}\n`);
}

// Close the pool explicitly: this is what lets the run exit, since idle pg
// connections would otherwise keep the process alive for up to 300 s.
async function disconnect() {
  // No client was created: src/lib/prisma.ts only builds one when DATABASE_URL is set.
  if (!process.env.DATABASE_URL) return;
  try {
    await prisma.$disconnect();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ worker: 'outbox', status: 'disconnect_failed', error: error instanceof Error ? error.message : String(error) })}\n`);
  }
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ worker: 'outbox', status: 'failed', error: message })}\n`);
  process.exitCode = 1;
}).finally(disconnect);
