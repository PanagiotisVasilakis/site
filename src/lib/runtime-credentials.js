export const ACTIVE_RUNTIME_CREDENTIAL_NAMES = Object.freeze([
  'ADMIN_JWT_SECRET',
  'GUEST_JWT_SECRET',
  'ADMIN_DASH_SECRET',
]);

const MINIMUM_CREDENTIAL_LENGTH = 43;
const MAXIMUM_CREDENTIAL_LENGTH = 512;
const MINIMUM_ESTIMATED_ENTROPY_BITS = 160;
const MINIMUM_DISTINCT_CHARACTERS = 12;

const PLACEHOLDER_TERMS = new Set([
  'change',
  'changeme',
  'replace',
  'placeholder',
  'example',
  'sample',
  'dummy',
  'test',
  'testing',
  'development',
  'local',
  'synthetic',
  'release',
  'releaseonly',
  'default',
  'password',
  'secret',
  'secrethere',
  'secretvalue',
  'todo',
]);

function isPlaceholderLike(value) {
  const compact = value.toLowerCase().replace(/[^a-z0-9]+/gu, '');
  if (PLACEHOLDER_TERMS.has(compact)) return true;
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .some((term) => term.length > 0 && PLACEHOLDER_TERMS.has(term));
}

function estimatedShannonBits(value) {
  const counts = new Map();
  for (const character of value) {
    counts.set(character, (counts.get(character) ?? 0) + 1);
  }
  let bitsPerCharacter = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    bitsPerCharacter -= probability * Math.log2(probability);
  }
  return bitsPerCharacter * value.length;
}

export function hasRepeatedPattern(value) {
  for (let size = 1; size <= Math.min(16, value.length / 2); size += 1) {
    if (value.length % size === 0
      && value === value.slice(0, size).repeat(value.length / size)) {
      return true;
    }
  }
  return false;
}

export function runtimeCredentialIssue(name, value) {
  if (!ACTIVE_RUNTIME_CREDENTIAL_NAMES.includes(name)) {
    return 'is not an active runtime credential';
  }
  if (typeof value !== 'string' || value.length === 0) {
    return 'is required';
  }
  if (value.length < MINIMUM_CREDENTIAL_LENGTH
    || value.length > MAXIMUM_CREDENTIAL_LENGTH
    || !/^[\x21-\x7e]+$/u.test(value)) {
    return `must contain ${MINIMUM_CREDENTIAL_LENGTH}-${MAXIMUM_CREDENTIAL_LENGTH} visible ASCII characters`;
  }
  if (isPlaceholderLike(value)
    || value.toLowerCase().includes(name.toLowerCase())
    || hasRepeatedPattern(value)) {
    return 'must not be placeholder-like or patterned';
  }
  if (new Set(value).size < MINIMUM_DISTINCT_CHARACTERS
    || estimatedShannonBits(value) < MINIMUM_ESTIMATED_ENTROPY_BITS) {
    return 'does not meet the production strength policy';
  }
  return undefined;
}

export function readRuntimeCredential(name, environment = process.env) {
  const value = environment[name];
  if (environment.NODE_ENV === 'production') {
    const issue = runtimeCredentialIssue(name, value);
    if (issue) {
      throw new Error(`${name} ${issue}`);
    }
  }
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
