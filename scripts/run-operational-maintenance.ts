import { syncAirbnbCalendar } from '@/lib/availability/calendarSync';
import { evaluateOperationalAlerts, runRetention } from '@/lib/operationalMonitor';
import { prisma } from '@/lib/prisma';

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

// Wait for every step to settle before failing, so disconnect() never races a
// step that is still running and the results of the other steps are still logged.
async function main() {
  const steps = await Promise.allSettled([
    evaluateOperationalAlerts(),
    runRetention(),
    syncAirbnbCalendar({ trigger: 'scheduled' }),
  ]);
  const [alerts, retention, calendar] = steps.map((step) => (
    step.status === 'fulfilled' ? step.value : { error: errorMessage(step.reason) }
  ));
  process.stdout.write(`${JSON.stringify({ worker: 'operations', alerts, retention, calendar, at: new Date().toISOString() })}\n`);
  const failures = steps.flatMap((step) => (step.status === 'rejected' ? [step.reason] : []));
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} operations worker step(s) failed: ${failures.map(errorMessage).join('; ')}`);
  }
}

// Close the pool explicitly: this is what lets the run exit, since idle pg
// connections would otherwise keep the process alive for up to 300 s.
async function disconnect() {
  // No client was created: src/lib/prisma.ts only builds one when DATABASE_URL is set.
  if (!process.env.DATABASE_URL) return;
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
