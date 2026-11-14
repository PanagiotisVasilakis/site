import { prisma } from '@/lib/prisma';

// Close the pool explicitly: this is what lets the run exit, since idle pg
// connections would otherwise keep the process alive for up to 300 s.
async function disconnect(worker: string) {
  // No client was created: src/lib/prisma.ts only builds one when DATABASE_URL is set.
  if (!process.env.DATABASE_URL) return;
  try {
    await prisma.$disconnect();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ worker, status: 'disconnect_failed', error: error instanceof Error ? error.message : String(error) })}\n`);
  }
}

export function runWorker(worker: string, main: () => Promise<void>): void {
  void main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ worker, status: 'failed', error: error instanceof Error ? error.message : String(error) })}\n`);
    process.exitCode = 1;
  }).finally(() => disconnect(worker));
}
