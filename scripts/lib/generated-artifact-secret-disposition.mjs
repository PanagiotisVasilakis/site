import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SUPPORTED_NEXT_VERSION = '16.3.6';
const SERVER_REFERENCE_KEYS = Object.freeze(['edge', 'encryptionKey', 'node']);
const PREVIEW_KEYS = Object.freeze([
  'previewModeEncryptionKey',
  'previewModeId',
  'previewModeSigningKey',
]);
const INTERNAL_CLASSIFICATION = 'INTENTIONAL_FRAMEWORK_INTERNAL_KEY';
const IDENTIFIER_CLASSIFICATION = 'KNOWN_NON_SECRET_BUILD_IDENTIFIER';
const SOURCEGRAPH_PREFIX = /^sgp_/u;
const UNPREFIXED_40_HEX = /^[a-f0-9]{40}$/iu;
const TOKEN_CONTEXT =
  /(?:sourcegraph|authorization|bearer|credential|access[_-]?token|api[_-]?key)/iu;

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function exactKeys(value, expected) {
  return (
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function isCanonicalBase64Key(value) {
  if (typeof value !== 'string' || value.length !== 44) return false;
  if (!/^[A-Za-z0-9+/]{43}=$/u.test(value)) return false;
  const decoded = Buffer.from(value, 'base64');
  return decoded.length === 32 && decoded.toString('base64') === value;
}

function isHex(value, length) {
  return typeof value === 'string' && value.length === length && /^[a-f0-9]+$/iu.test(value);
}

function normalizedRelative(repositoryRoot, filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join('/');
}

function countOccurrences(content, needle) {
  let count = 0;
  let offset = 0;
  while (offset <= content.length) {
    const index = content.indexOf(needle, offset);
    if (index < 0) break;
    count += 1;
    offset = index + needle.length;
  }
  return count;
}

function valueOccurrences(files, value) {
  const needle = Buffer.from(value, 'utf8');
  return new Map(
    files
      .map((file) => [file.relative, countOccurrences(readFileSync(file.source), needle)])
      .filter(([, count]) => count > 0),
  );
}

function assertExpectedOccurrences(files, value, expectedPaths) {
  const occurrences = valueOccurrences(files, value);
  if (
    occurrences.size !== expectedPaths.length
    || expectedPaths.some((entry) => occurrences.get(entry) !== 1)
  ) {
    throw new Error('Generated Next internal material appeared outside its supported server contract.');
  }
}

function collectActionIds(value, destination) {
  if (!value || typeof value !== 'object') return;
  for (const [key, nested] of Object.entries(value)) {
    if (UNPREFIXED_40_HEX.test(key)) destination.add(key);
    collectActionIds(nested, destination);
  }
}

function localContexts(source, value) {
  const contexts = [];
  let offset = 0;
  while (offset <= source.length) {
    const index = source.indexOf(value, offset);
    if (index < 0) break;
    contexts.push(source.slice(Math.max(0, index - 128), index + value.length + 128));
    offset = index + value.length;
  }
  return contexts;
}

function deriveNextFrameworkIdentifiers(repositoryRoot) {
  const sourceMapPaths = [
    'node_modules/next/dist/client/app-dir/link.js.map',
    'node_modules/next/dist/esm/client/app-dir/link.js.map',
  ];
  const identifiers = new Set();
  for (const relative of sourceMapPaths) {
    const sourceMap = readJson(path.join(repositoryRoot, relative));
    let supportedSourceFound = false;
    for (let index = 0; index < (sourceMap.sources ?? []).length; index += 1) {
      const sourceName = String(sourceMap.sources[index] ?? '');
      if (!sourceName.endsWith('/client/app-dir/link.tsx')) continue;
      supportedSourceFound = true;
      const source = String(sourceMap.sourcesContent?.[index] ?? '');
      for (const match of source.matchAll(
        /https:\/\/github\.com\/vercel\/next\.js\/commit\/([a-f0-9]{40})/giu,
      )) {
        identifiers.add(match[1]);
      }
    }
    if (!supportedSourceFound) {
      throw new Error('The supported Next identifier source schema was unavailable.');
    }
  }
  if (identifiers.size !== 1) {
    throw new Error('The supported Next identifier source was ambiguous.');
  }
  return identifiers;
}

function identifierOccurrenceIsSupported(kind, relativePath, source, identifier) {
  if (TOKEN_CONTEXT.test(localContexts(source, identifier).join('\n'))) return false;
  if (kind === 'next-framework-commit') {
    if (!relativePath.startsWith('.next/server/') || !relativePath.endsWith('.js.map')) {
      return false;
    }
    let sourceMap;
    try {
      sourceMap = JSON.parse(source);
    } catch {
      return false;
    }
    const semanticOccurrences = [];
    for (let index = 0; index < (sourceMap.sources ?? []).length; index += 1) {
      const sourceName = String(sourceMap.sources[index] ?? '');
      const sourceContent = String(sourceMap.sourcesContent?.[index] ?? '');
      if (!sourceName.endsWith('/node_modules/next/src/client/app-dir/link.tsx')) continue;
      semanticOccurrences.push(
        ...sourceContent.matchAll(
          /https:\/\/github\.com\/vercel\/next\.js\/commit\/([a-f0-9]{40})/giu,
        ),
      );
    }
    return (
      semanticOccurrences.length === 1
      && semanticOccurrences[0][1] === identifier
      && localContexts(source, identifier).length === 1
    );
  }
  if (kind === 'next-action-id') {
    return (
      /server-reference-manifest|server\/(?:app|chunks)\//u.test(relativePath)
      && localContexts(source, identifier).length > 0
    );
  }
  if (kind === 'git-commit' || kind === 'next-build-id') {
    return (
      relativePath.startsWith('.next/server/')
      && localContexts(source, identifier).length > 0
    );
  }
  return false;
}

export function buildGeneratedArtifactDispositionContext({
  repositoryRoot,
  artifactFiles,
  environment = process.env,
  incidentBaseline,
}) {
  const nextPackage = readJson(path.join(repositoryRoot, 'node_modules/next/package.json'));
  if (nextPackage.version !== SUPPORTED_NEXT_VERSION) {
    throw new Error('Generated-artifact dispositions do not support the installed Next version.');
  }

  const serverReferencePath = path.join(
    repositoryRoot,
    '.next/server/server-reference-manifest.json',
  );
  const standaloneServerReferencePath = path.join(
    repositoryRoot,
    '.next/standalone/.next/server/server-reference-manifest.json',
  );
  const prerenderPath = path.join(repositoryRoot, '.next/prerender-manifest.json');
  const standalonePrerenderPath = path.join(
    repositoryRoot,
    '.next/standalone/.next/prerender-manifest.json',
  );
  const serverReference = readJson(serverReferencePath);
  const standaloneServerReference = readJson(standaloneServerReferencePath);
  const prerender = readJson(prerenderPath);
  const standalonePrerender = readJson(standalonePrerenderPath);

  if (
    !exactKeys(serverReference, SERVER_REFERENCE_KEYS)
    || !exactKeys(standaloneServerReference, SERVER_REFERENCE_KEYS)
    || !plainObject(serverReference.node)
    || !plainObject(serverReference.edge)
    || JSON.stringify(serverReference) !== JSON.stringify(standaloneServerReference)
  ) {
    throw new Error('The supported Next server-reference manifest schema was invalid.');
  }
  const validPrerender = (manifest) => (
    exactKeys(manifest, ['dynamicRoutes', 'notFoundRoutes', 'preview', 'routes', 'version'])
    && manifest.version === 4
    && exactKeys(manifest.preview, PREVIEW_KEYS)
    && manifest.routes
    && typeof manifest.routes === 'object'
    && manifest.dynamicRoutes
    && typeof manifest.dynamicRoutes === 'object'
    && Array.isArray(manifest.notFoundRoutes)
  );
  if (
    !validPrerender(prerender)
    || !validPrerender(standalonePrerender)
    || JSON.stringify(prerender.preview) !== JSON.stringify(standalonePrerender.preview)
  ) {
    throw new Error('The supported Next prerender manifest schema was invalid.');
  }

  const internalEntries = [
    {
      value: serverReference.encryptionKey,
      semanticClass: 'server-actions-encryption-key',
      valid: isCanonicalBase64Key(serverReference.encryptionKey),
      paths: [
        '.next/server/server-reference-manifest.js',
        '.next/server/server-reference-manifest.json',
        '.next/standalone/.next/server/server-reference-manifest.js',
        '.next/standalone/.next/server/server-reference-manifest.json',
      ],
    },
    {
      value: prerender.preview.previewModeId,
      semanticClass: 'preview-mode-id',
      valid: isHex(prerender.preview.previewModeId, 32),
      paths: [
        '.next/prerender-manifest.json',
        '.next/standalone/.next/prerender-manifest.json',
      ],
    },
    {
      value: prerender.preview.previewModeSigningKey,
      semanticClass: 'preview-mode-signing-key',
      valid: isHex(prerender.preview.previewModeSigningKey, 64),
      paths: [
        '.next/prerender-manifest.json',
        '.next/standalone/.next/prerender-manifest.json',
      ],
    },
    {
      value: prerender.preview.previewModeEncryptionKey,
      semanticClass: 'preview-mode-encryption-key',
      valid: isHex(prerender.preview.previewModeEncryptionKey, 64),
      paths: [
        '.next/prerender-manifest.json',
        '.next/standalone/.next/prerender-manifest.json',
      ],
    },
  ];
  if (
    internalEntries.some((entry) => !entry.valid)
    || new Set(internalEntries.map((entry) => entry.value)).size !== internalEntries.length
  ) {
    throw new Error('Generated Next internal material was malformed or ambiguous.');
  }

  const validationFiles = [...artifactFiles];
  for (const source of [prerenderPath]) {
    validationFiles.push({
      relative: normalizedRelative(repositoryRoot, source),
      source,
    });
  }
  for (const entry of internalEntries) {
    assertExpectedOccurrences(validationFiles, entry.value, entry.paths);
  }

  const activeValues = new Set(
    Object.values(environment).filter(
      (value) => typeof value === 'string' && value.length >= 8,
    ),
  );
  const incidentFingerprints = new Set(
    (incidentBaseline.findings ?? []).map((finding) => finding.fingerprint),
  );
  for (const entry of internalEntries) {
    if (
      activeValues.has(entry.value)
      || incidentFingerprints.has(sha256(entry.value))
    ) {
      throw new Error('Generated Next internal material overlapped protected credentials.');
    }
  }

  const identifiers = new Map();
  for (const identifier of deriveNextFrameworkIdentifiers(repositoryRoot)) {
    identifiers.set(identifier, 'next-framework-commit');
  }
  const actionIds = new Set();
  collectActionIds(serverReference.node, actionIds);
  collectActionIds(serverReference.edge, actionIds);
  for (const identifier of actionIds) identifiers.set(identifier, 'next-action-id');

  const gitCommit = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    env: {
      PATH: environment.PATH ?? process.env.PATH,
      HOME: environment.HOME ?? process.env.HOME,
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).stdout.trim();
  if (UNPREFIXED_40_HEX.test(gitCommit)) identifiers.set(gitCommit, 'git-commit');
  const buildId = readFileSync(path.join(repositoryRoot, '.next/BUILD_ID'), 'utf8').trim();
  if (UNPREFIXED_40_HEX.test(buildId)) identifiers.set(buildId, 'next-build-id');

  return {
    nextVersion: nextPackage.version,
    internalEntries: new Map(internalEntries.map((entry) => [entry.value, entry])),
    identifiers,
    incidentFingerprints,
    summary: Object.freeze({
      internalKeyClasses: internalEntries.map((entry) => entry.semanticClass),
      identifierClasses: [...new Set(identifiers.values())].sort(),
      actionIdCount: actionIds.size,
    }),
  };
}

export function classifyGeneratedArtifactFinding(context, {
  rule,
  secret,
  relativePath,
  rawFingerprint,
  source,
}) {
  if (
    typeof secret !== 'string'
    || context.incidentFingerprints.has(rawFingerprint)
    || context.incidentFingerprints.has(sha256(secret))
  ) {
    return null;
  }

  const internal = context.internalEntries.get(secret);
  if (internal) {
    if (rule !== 'generic-api-key' || !internal.paths.includes(relativePath)) return null;
    return {
      classification: INTERNAL_CLASSIFICATION,
      semanticClass: internal.semanticClass,
      redactedFingerprint: sha256(secret).slice(0, 16),
    };
  }

  if (rule !== 'sourcegraph-access-token' || SOURCEGRAPH_PREFIX.test(secret)) return null;
  if (!UNPREFIXED_40_HEX.test(secret)) return null;
  const identifierClass = context.identifiers.get(secret);
  if (!identifierClass) return null;
  if (!identifierOccurrenceIsSupported(identifierClass, relativePath, source, secret)) {
    return null;
  }
  return {
    classification: IDENTIFIER_CLASSIFICATION,
    semanticClass: identifierClass,
    redactedFingerprint: sha256(secret).slice(0, 16),
  };
}

export const GENERATED_ARTIFACT_CLASSIFICATIONS = Object.freeze({
  INTERNAL_CLASSIFICATION,
  IDENTIFIER_CLASSIFICATION,
  SUPPORTED_NEXT_VERSION,
});
