export {};

const rawUrl = process.argv[2];
const timeoutMs = Number(process.argv[3] ?? '120000');

if (!rawUrl) {
  console.error('Usage: tsx scripts/wait-for-http.ts <url> [timeout-ms]');
  process.exit(2);
}

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  console.error('timeout-ms must be a positive number');
  process.exit(2);
}

const deadline = Date.now() + timeoutMs;
let lastStatus = 'no response';

while (Date.now() < deadline) {
  try {
    const response = await fetch(rawUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(5_000),
    });
    lastStatus = `HTTP ${response.status}`;
    if (response.ok) {
      console.log(`Ready: ${rawUrl} (${lastStatus})`);
      process.exit(0);
    }
  } catch (error) {
    lastStatus = error instanceof Error ? error.message : String(error);
  }

  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.error(`Timed out waiting for ${rawUrl}: ${lastStatus}`);
process.exit(1);
