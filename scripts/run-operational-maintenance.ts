import { evaluateOperationalAlerts, runRetention } from '@/lib/operationalMonitor';
import { prisma } from '@/lib/prisma';

async function main() {
  const [alerts, retention] = await Promise.all([
    evaluateOperationalAlerts(),
    runRetention(),
  ]);
  process.stdout.write(`${JSON.stringify({ worker: 'operations', alerts, retention, at: new Date().toISOString() })}\n`);
}

// Close the pool explicitly: with PRISMA_AUTO_DISCONNECT=false (.env.example)
// the idle pg connections would keep the process alive for up to 300 s.
async function disconnect() {
  try {
    await prisma.$disconnect();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ worker: 'operations', status: 'disconnect_failed', error: error instanceof Error ? error.message : String(error) })}\n`);
  }
}

void main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    worker: 'operations',
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
}).finally(disconnect);
