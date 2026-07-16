import { execFileSync } from 'node:child_process';

const DISPOSABLE_LABEL = 'com.qr-city-guide.integration.disposable=true';

function dockerContainerIds() {
  try {
    return execFileSync(
      'docker',
      ['ps', '-aq', '--filter', `label=${DISPOSABLE_LABEL}`],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
      .split(/\r?\n/u)
      .map((value) => value.trim())
      .filter(Boolean);
  } catch {
    throw new Error('Could not inspect disposable integration containers.');
  }
}

const containerIds = dockerContainerIds();
if (containerIds.length > 0) {
  throw new Error(
    `Found ${containerIds.length} disposable integration container(s): ${containerIds.join(', ')}`,
  );
}

process.stdout.write('No disposable integration containers remain.\n');
