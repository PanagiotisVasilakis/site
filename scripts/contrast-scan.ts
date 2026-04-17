#!/usr/bin/env tsx
/**
 * Compatibility shim.
 * Contrast checks are maintained in axe-contrast.ts.
 */

export {};

async function main() {
  console.warn('[contrast-scan] Deprecated entrypoint. Forwarding to scripts/axe-contrast.ts.');
  await import('./axe-contrast');
}

main().catch((error) => {
  console.error('[contrast-scan] Failed to run axe-contrast flow.', error);
  process.exit(1);
});
