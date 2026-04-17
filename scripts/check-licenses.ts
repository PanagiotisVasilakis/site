import { readFile } from 'node:fs/promises';
import path from 'node:path';
import spdxParse from 'spdx-expression-parse';

const ALLOWED_LICENSES = [
  '0BSD',
  'MIT',
  'MIT-0',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'CC-BY-3.0',
  'CC-BY-4.0',
  'CC0-1.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'LGPL-3.0-or-later',
  'MPL-2.0',
  'Python-2.0',
  'Unlicense',
  'WTFPL',
];

// Some packages ship LICENSE files but omit package.json license fields.
const PACKAGE_LICENSE_FALLBACKS: Record<string, string[]> = {
  atomically: ['MIT'],
  'stubborn-fs': ['MIT'],
};

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

type PackageLockLike = {
  packages?: Record<string, (ManifestLike & { version?: unknown }) | undefined>;
};

type SpdxLeafNode = {
  license: string;
  plus?: boolean;
  exception?: string;
};

type SpdxExpressionNode =
  | SpdxLeafNode
  | {
      left: SpdxExpressionNode;
      right: SpdxExpressionNode;
      conjunction: 'and' | 'or';
    };

(async () => {
  const packageLockPath = path.join(process.cwd(), 'package-lock.json');
  const packageLockContent = await readFile(packageLockPath, 'utf8');
  const lockfile = JSON.parse(packageLockContent) as PackageLockLike;

  if (!lockfile.packages || typeof lockfile.packages !== 'object') {
    throw new Error('package-lock.json does not include a packages map.');
  }

  const issues: LicenseIssue[] = [];
  const seen = new Set<string>();

  for (const packagePath of Object.keys(lockfile.packages)) {
    if (packagePath === '') {
      continue;
    }

    const manifest = await readInstalledManifest(packagePath);
    if (!manifest) {
      continue;
    }

    const version = typeof manifest.version === 'string' ? manifest.version : '';
    const name =
      typeof manifest.name === 'string' && manifest.name.trim()
        ? manifest.name.trim()
        : inferPackageName(packagePath);

    if (!name || !version) {
      continue;
    }

    if (manifest.private) {
      continue;
    }

    const key = `${name}@${version}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const licenses = extractLicenses(manifest, name);

    if (licenses.length === 0) {
      issues.push({
        name,
        version,
        reason: 'missing license metadata',
      });
      continue;
    }

    if (licenses.every((value) => !isAllowedLicense(value))) {
      issues.push({
        name,
        version,
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

async function readInstalledManifest(packagePath: string): Promise<ManifestLike | null> {
  const manifestPath = path.join(process.cwd(), packagePath, 'package.json');

  try {
    const content = await readFile(manifestPath, 'utf8');
    return JSON.parse(content) as ManifestLike;
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      return null;
    }

    throw error;
  }
}

function inferPackageName(packagePath: string): string | null {
  const segments = packagePath.split('node_modules/');
  const inferred = segments[segments.length - 1]?.trim();

  if (!inferred) {
    return null;
  }

  return inferred;
}

function extractLicenses(manifest: ManifestLike, packageName: string): string[] {
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

  if (results.size === 0 && PACKAGE_LICENSE_FALLBACKS[packageName]) {
    for (const fallbackLicense of PACKAGE_LICENSE_FALLBACKS[packageName]) {
      results.add(fallbackLicense);
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
    const expression = spdxParse(normalized) as SpdxExpressionNode;
    return isAllowedSpdxExpression(expression);
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

function isAllowedSpdxExpression(node: SpdxExpressionNode): boolean {
  if ('license' in node) {
    const normalizedLeaf = node.license.trim();

    if (!normalizedLeaf) {
      return false;
    }

    if (ALLOWED_LICENSES.includes(normalizedLeaf)) {
      return true;
    }

    const plusVariant = node.plus ? `${normalizedLeaf}+` : null;
    if (plusVariant && ALLOWED_LICENSES.includes(plusVariant)) {
      return true;
    }

    const exceptionVariant = node.exception
      ? `${normalizedLeaf} WITH ${node.exception}`
      : null;
    if (exceptionVariant && ALLOWED_LICENSES.includes(exceptionVariant)) {
      return true;
    }

    return false;
  }

  return isAllowedSpdxExpression(node.left) && isAllowedSpdxExpression(node.right);
}
