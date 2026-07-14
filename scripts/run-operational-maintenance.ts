import { evaluateOperationalAlerts, runRetention } from '@/lib/operationalMonitor';

async function main() {
  const [alerts, retention] = await Promise.all([
    evaluateOperationalAlerts(),
    runRetention(),
  ]);
  process.stdout.write(`${JSON.stringify({ worker: 'operations', alerts, retention, at: new Date().toISOString() })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    worker: 'operations',
    status: 'failed',
    error: error instanceof Error ? error.message : String(error),
  })}\n`);
  process.exitCode = 1;
});
