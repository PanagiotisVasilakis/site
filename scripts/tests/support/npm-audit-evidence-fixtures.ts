import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  type NpmAuditProcessOptions,
  type NpmAuditProcessResult,
  type NpmAuditRunner,
} from '../../lib/npm-audit-evidence';

const temporaryRoots: string[] = [];

export function createAuditEvidenceTemporaryRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'npm-audit-evidence-test-'));
  temporaryRoots.push(root);
  return root;
}

export function cleanupAuditEvidenceTemporaryRoots(): void {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
}

export function createAuditFixtureRunner(
  stdout: Buffer | string,
  result: NpmAuditProcessResult,
  stderr: Buffer | string = Buffer.alloc(0),
  inspect?: (command: string, args: readonly string[], options: NpmAuditProcessOptions) => void,
): NpmAuditRunner {
  return (command, args, options) => {
    inspect?.(command, args, options);
    writeFileSync(options.stdoutPath, stdout);
    writeFileSync(options.stderrPath, stderr);
    return Promise.resolve(result);
  };
}

export function readAuditFixtureFile(filename: string): Buffer {
  return readFileSync(filename);
}

export function auditFixtureMode(filename: string): number {
  return statSync(filename).mode & 0o777;
}
