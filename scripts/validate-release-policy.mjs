#!/usr/bin/env node

import { validateReleasePolicy } from './lib/release-policy.mjs';

const errors = await validateReleasePolicy();
if (errors.length > 0) {
  process.stderr.write(
    `Local release policy failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(
    'Local release policy passed (restricted static repository profile; no deployment was performed).\n',
  );
}
