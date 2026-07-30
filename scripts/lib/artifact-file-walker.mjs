import { createHash } from 'node:crypto';
import {
  lstat,
  opendir,
  readlink,
  realpath,
} from 'node:fs/promises';
import path from 'node:path';

const SAFE_PATH_COMPONENT = /^[A-Za-z0-9._@+-]{1,128}$/u;
const MAX_DIAGNOSTIC_PATH_LENGTH = 512;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function pathFingerprint(value) {
  return sha256(value).slice(0, 16);
}

export function safeArtifactDiagnosticPath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  const components = normalized.split('/');
  if (
    normalized.length > 0
    && normalized.length <= MAX_DIAGNOSTIC_PATH_LENGTH
    && components.every((component) => SAFE_PATH_COMPONENT.test(component))
  ) {
    return normalized;
  }
  return `path-fingerprint:${pathFingerprint(normalized)}`;
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === ''
    || (
      !path.isAbsolute(relative)
      && relative !== '..'
      && !relative.startsWith(`..${path.sep}`)
    )
  );
}

function traversalError(code, relativePath) {
  const safePath = safeArtifactDiagnosticPath(relativePath);
  const fingerprint = pathFingerprint(`${safePath}\0${code}`);
  return new Error(
    `Artifact traversal rejected path=${safePath} reason=${code} `
      + `classification=unsafe-artifact-entry fingerprint=${fingerprint}`,
  );
}

async function requiredLstat(candidate, diagnosticPath) {
  try {
    return await lstat(candidate);
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') {
      throw traversalError('DANGLING_SYMLINK', diagnosticPath);
    }
    throw traversalError('ARTIFACT_ENTRY_UNREADABLE', diagnosticPath);
  }
}

async function resolveInsideArtifact(
  canonicalRoot,
  lexicalCandidate,
  diagnosticPath,
  activeLinks = new Set(),
) {
  if (!isInside(canonicalRoot, lexicalCandidate)) {
    throw traversalError('OUT_OF_ROOT_SYMLINK', diagnosticPath);
  }

  const relative = path.relative(canonicalRoot, lexicalCandidate);
  const components = relative === '' ? [] : relative.split(path.sep);
  let current = canonicalRoot;

  for (let index = 0; index < components.length; index += 1) {
    const candidate = path.join(current, components[index]);
    const metadata = await requiredLstat(candidate, diagnosticPath);
    if (metadata.isSymbolicLink()) {
      if (activeLinks.has(candidate)) {
        throw traversalError('CYCLIC_SYMLINK', diagnosticPath);
      }
      let declaredTarget;
      try {
        declaredTarget = await readlink(candidate);
      } catch {
        throw traversalError('ARTIFACT_ENTRY_UNREADABLE', diagnosticPath);
      }
      if (path.isAbsolute(declaredTarget)) {
        throw traversalError('ABSOLUTE_SYMLINK', diagnosticPath);
      }
      const target = path.resolve(path.dirname(candidate), declaredTarget);
      if (!isInside(canonicalRoot, target)) {
        throw traversalError('OUT_OF_ROOT_SYMLINK', diagnosticPath);
      }
      const remaining = components.slice(index + 1);
      const nextCandidate = path.join(target, ...remaining);
      const nextActiveLinks = new Set(activeLinks);
      nextActiveLinks.add(candidate);
      return resolveInsideArtifact(
        canonicalRoot,
        nextCandidate,
        diagnosticPath,
        nextActiveLinks,
      );
    }
    if (index < components.length - 1 && !metadata.isDirectory()) {
      throw traversalError('DANGLING_SYMLINK', diagnosticPath);
    }
    current = candidate;
  }

  let canonicalTarget;
  try {
    canonicalTarget = await realpath(current);
  } catch {
    throw traversalError('DANGLING_SYMLINK', diagnosticPath);
  }
  if (!isInside(canonicalRoot, canonicalTarget)) {
    throw traversalError('OUT_OF_ROOT_SYMLINK', diagnosticPath);
  }
  const metadata = await requiredLstat(canonicalTarget, diagnosticPath);
  return { canonicalTarget, metadata };
}

function compareEntries(left, right) {
  if (left.name < right.name) return -1;
  if (left.name > right.name) return 1;
  return 0;
}

export async function enumerateArtifactFiles(root) {
  const canonicalRoot = await realpath(root);
  const rootMetadata = await lstat(canonicalRoot);
  if (!rootMetadata.isDirectory()) {
    throw traversalError('ARTIFACT_ROOT_NOT_DIRECTORY', '.');
  }

  const files = [];
  const symlinks = [];
  const visitedFiles = new Set();
  const visitedDirectories = new Set();
  const activeDirectories = new Set();

  async function addFile(canonicalFile, logicalPath, viaSymlink) {
    if (visitedFiles.has(canonicalFile)) return;
    visitedFiles.add(canonicalFile);
    files.push({
      relative: logicalPath,
      source: canonicalFile,
      canonicalRoot,
      viaSymlink,
    });
  }

  async function walkDirectory(canonicalDirectory, logicalDirectory, viaSymlink = false) {
    if (activeDirectories.has(canonicalDirectory)) {
      throw traversalError('CYCLIC_SYMLINK', logicalDirectory || '.');
    }
    if (visitedDirectories.has(canonicalDirectory)) return;
    visitedDirectories.add(canonicalDirectory);
    activeDirectories.add(canonicalDirectory);

    try {
      let directory;
      try {
        directory = await opendir(canonicalDirectory);
      } catch {
        throw traversalError(
          'ARTIFACT_ENTRY_UNREADABLE',
          logicalDirectory || '.',
        );
      }
      const entries = [];
      for await (const entry of directory) entries.push(entry);
      entries.sort(compareEntries);

      for (const entry of entries) {
        const logicalPath = logicalDirectory
          ? `${logicalDirectory}/${entry.name}`
          : entry.name;
        const lexicalPath = path.join(canonicalDirectory, entry.name);
        const metadata = await requiredLstat(lexicalPath, logicalPath);

        if (metadata.isSymbolicLink()) {
          let declaredTarget;
          try {
            declaredTarget = await readlink(lexicalPath);
          } catch {
            throw traversalError('ARTIFACT_ENTRY_UNREADABLE', logicalPath);
          }
          if (path.isAbsolute(declaredTarget)) {
            throw traversalError('ABSOLUTE_SYMLINK', logicalPath);
          }
          const lexicalTarget = path.resolve(path.dirname(lexicalPath), declaredTarget);
          if (!isInside(canonicalRoot, lexicalTarget)) {
            throw traversalError('OUT_OF_ROOT_SYMLINK', logicalPath);
          }
          const resolved = await resolveInsideArtifact(
            canonicalRoot,
            lexicalPath,
            logicalPath,
          );
          const canonicalRelative = path.relative(
            canonicalRoot,
            resolved.canonicalTarget,
          ).split(path.sep).join('/');
          symlinks.push({
            relative: logicalPath,
            target: canonicalRelative,
            targetType: resolved.metadata.isDirectory()
              ? 'directory'
              : resolved.metadata.isFile()
                ? 'file'
                : 'unsupported',
          });

          if (resolved.metadata.isDirectory()) {
            if (activeDirectories.has(resolved.canonicalTarget)) {
              throw traversalError('CYCLIC_SYMLINK', logicalPath);
            }
            await walkDirectory(resolved.canonicalTarget, logicalPath, true);
          } else if (resolved.metadata.isFile()) {
            await addFile(resolved.canonicalTarget, logicalPath, true);
          } else {
            throw traversalError('UNSUPPORTED_SYMLINK_TARGET', logicalPath);
          }
        } else if (metadata.isDirectory()) {
          let canonicalDirectory;
          try {
            canonicalDirectory = await realpath(lexicalPath);
          } catch {
            throw traversalError('ARTIFACT_ENTRY_UNREADABLE', logicalPath);
          }
          if (!isInside(canonicalRoot, canonicalDirectory)) {
            throw traversalError('OUT_OF_ROOT_ARTIFACT_ENTRY', logicalPath);
          }
          await walkDirectory(
            canonicalDirectory,
            logicalPath,
            viaSymlink,
          );
        } else if (metadata.isFile()) {
          let canonicalFile;
          try {
            canonicalFile = await realpath(lexicalPath);
          } catch {
            throw traversalError('ARTIFACT_ENTRY_UNREADABLE', logicalPath);
          }
          if (!isInside(canonicalRoot, canonicalFile)) {
            throw traversalError('OUT_OF_ROOT_ARTIFACT_ENTRY', logicalPath);
          }
          await addFile(canonicalFile, logicalPath, viaSymlink);
        } else {
          throw traversalError('UNSUPPORTED_ARTIFACT_ENTRY', logicalPath);
        }
      }
    } finally {
      activeDirectories.delete(canonicalDirectory);
    }
  }

  await walkDirectory(canonicalRoot, '');
  files.sort((left, right) => (
    left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0
  ));
  symlinks.sort((left, right) => (
    left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0
  ));
  return { canonicalRoot, files, symlinks };
}
