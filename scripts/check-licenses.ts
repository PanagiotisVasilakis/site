import Arborist from '@npmcli/arborist';
import spdxParse from 'spdx-expression-parse';
import spdxSatisfies from 'spdx-satisfies';

const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'Unlicense',
  'WTFPL',
];

const ALLOWED_EXPRESSION = ALLOWED_LICENSES.join(' OR ');

type LicenseIssue = {
  name: string;
  version: string;
  reason: string;
};

type ManifestLike = {
  name?: string;
  version?: string;
  private?: boolean;
  license?: unknown;
  licenses?: unknown;
};

const arborist = new Arborist({ path: process.cwd() });

(async () => {
  const tree = await arborist.loadActual();
  const rootPath = tree.path;
  const issues: LicenseIssue[] = [];
  const seen = new Set<string>();

  for (const node of tree.inventory.values()) {
    const manifest = node.package as ManifestLike | undefined;

    if (!manifest) {
      continue;
    }

    if (!manifest.name || !manifest.version) {
      continue;
    }

    if (manifest.private) {
      continue;
    }

    if (node.path === rootPath) {
      continue;
    }

    const key = `${manifest.name}@${manifest.version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const licenses = extractLicenses(manifest);

    if (licenses.length === 0) {
      issues.push({
        name: manifest.name,
        version: manifest.version,
        reason: 'missing license metadata',
      });
      continue;
    }

    if (licenses.every((value) => !isAllowedLicense(value))) {
      issues.push({
        name: manifest.name,
        version: manifest.version,
        reason: `disallowed license: ${licenses.join(', ')}`,
      });
    }
  }

  if (issues.length > 0) {
    console.error('License policy violations detected:');
    for (const issue of issues) {
      console.error(`  - ${issue.name}@${issue.version} (${issue.reason})`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('All package licenses comply with the allowlist.');
})().catch((error: unknown) => {
  console.error('Failed to validate licenses.');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});

function extractLicenses(manifest: ManifestLike): string[] {
  const results = new Set<string>();

  const pushValue = (input: unknown) => {
    if (!input) {
      return;
    }

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (trimmed) {
        results.add(trimmed);
      }
      return;
    }

    if (typeof input === 'object' && 'type' in input) {
      const type = (input as { type?: unknown }).type;
      if (typeof type === 'string' && type.trim()) {
        results.add(type.trim());
      }
    }
  };

  pushValue(manifest.license);

  if (Array.isArray(manifest.licenses)) {
    for (const entry of manifest.licenses) {
      pushValue(entry);
    }
  }

  return Array.from(results);
}

function isAllowedLicense(value: string): boolean {
  const normalized = value.trim();

  if (!normalized) {
    return false;
  }

  if (ALLOWED_LICENSES.includes(normalized)) {
    return true;
  }

  try {
    spdxParse(normalized);
    return spdxSatisfies(normalized, ALLOWED_EXPRESSION);
  } catch {
    if (normalized.toLowerCase().startsWith('see license in')) {
      return false;
    }

    if (normalized === 'UNLICENSED') {
      return false;
    }

    return false;
  }
}
