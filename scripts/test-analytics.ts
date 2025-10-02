#!/usr/bin/env tsx
// Simple smoke-test for the analytics API
// Usage: npx tsx scripts/test-analytics.ts [HOST]
const host = process.argv[2] || process.env.OFFLINE_CHECK_HOST || 'http://localhost:3000';

async function main() {
  const url = new URL('/api/analytics', host).toString();
  const payload = {
    path: '/',
    ts: Date.now(),
    locale: 'en',
    event: { name: 'smoke-test', props: { env: 'local' } },
  };

  console.log(`POST ${url}`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log('status=', res.status, 'body=', text.slice(0, 200));
    if (res.status >= 200 && res.status < 300) {
      process.exit(0);
    }
    process.exit(1);
  } catch (err) {
    console.error('Request failed', err);
    process.exit(2);
  }
}

main();
