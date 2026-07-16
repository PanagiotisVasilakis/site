import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const APPROVED_POSTGRES_IMAGE =
  'postgres:16-alpine@sha256:57c72fd2a128e416c7fcc499958864df5301e940bca0a56f58fddf30ffc07777';

const APPROVED_ACTIONS = new Map([
  ['actions/checkout', '9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0'],
  ['actions/setup-node', '820762786026740c76f36085b0efc47a31fe5020'],
]);

const EXPECTED_JOBS = new Map([
  ['policy', 'CI / policy'],
  ['quality', 'CI / quality'],
  ['integration-postgres', 'CI / integration-postgres'],
  ['production-build', 'CI / production-build'],
  ['required', 'CI / required'],
]);

const COMMON_SETUP = [
  ['Checkout', undefined],
  ['Set up Node.js', undefined],
  ['Install repository npm version', 'npm install --global npm@11.18.0'],
  ['Verify npm version', 'npm --version | grep -Fx 11.18.0'],
];

const SYNTHETIC_PRODUCTION_ENVIRONMENT = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://ci:ci-only@127.0.0.1:1/ci_build',
  ADMIN_JWT_SECRET: 'ci-only-admin-jwt-secret-000000000000',
  ADMIN_DASH_SECRET: 'ci-only-admin-dashboard-secret',
  GUEST_JWT_SECRET: 'ci-only-guest-jwt-secret-000000000000',
  SECURITY_ENC_KEY_HEX: '0000000000000000000000000000000000000000000000000000000000000000',
  SECURITY_PEPPER: 'ci-only-security-pepper',
  CLAIM_TOKEN_PEPPER: 'ci-only-claim-token-pepper-00000000',
  SESSION_SECRET: 'ci-only-session-secret-00000000000000',
  GUEST_WIFI_NETWORK: 'CI-SYNTHETIC-NETWORK',
  GUEST_WIFI_PASSWORD: 'ci-only-password',
  PROPERTY_TIME_ZONE: 'Europe/Athens',
  ALLOWED_ORIGINS: 'https://ci.example.invalid',
  NEXT_TELEMETRY_DISABLED: '1',
  NEXT_PUBLIC_SITE_URL: 'https://ci.example.invalid',
  BUILD_SITE_URL: 'https://ci.example.invalid',
  TRUST_PROXY_MODE: 'hops',
  TRUST_PROXY_HOPS: '1',
  RATE_LIMIT_BACKEND: 'redis',
  UPSTASH_REDIS_REST_URL: 'https://redis.ci.invalid',
  UPSTASH_REDIS_REST_TOKEN: 'ci-only-redis-token-00000000',
};

const SYNTHETIC_BUILD_ENVIRONMENT = SYNTHETIC_PRODUCTION_ENVIRONMENT;

const EXPECTED_RUNS = {
  policy: [
    ...COMMON_SETUP,
    ['Install dependencies without lifecycle scripts', 'npm ci --ignore-scripts --audit=false --fund=false'],
    ['Check conflict markers', 'npm run check:conflicts'],
    ['Test CI workflow policy', 'npm run test:ci-policy'],
    ['Enforce CI workflow policy', 'npm run check:ci-policy'],
    ['Test Prisma integrity policy', 'npm run test:prisma-integrity'],
    ['Enforce Prisma integrity policy', 'npm run check:prisma-integrity'],
    ['Test PostgreSQL image policy', 'npm run test:postgres-image-policy'],
    ['Enforce PostgreSQL image policy', 'npm run check:postgres-image-policy'],
  ],
  quality: [
    ...COMMON_SETUP,
    ['Install dependencies', 'npm ci --audit=false --fund=false'],
    ['Run complete default test suite', 'npm test'],
    ['Run unit tests', 'npm run test:unit'],
    ['Run security tests', 'npm run test:security'],
    ['Enforce coverage thresholds', 'npm run test:coverage'],
    ['Type-check', 'npm run typecheck'],
    ['Lint with zero warnings', 'npm run lint -- --max-warnings=0'],
    ['Run security lint', 'npm run lint:security'],
    ['Check dead code', 'npm run check:dead-code'],
    ['Check dependency licenses', 'npm run security:license-check'],
    ['Validate Prisma schema', 'npx --no-install prisma validate'],
    ['Report deterministic Prisma hashes', 'npm run hash:prisma-integrity'],
  ],
  'integration-postgres': [
    ...COMMON_SETUP,
    ['Install dependencies', 'npm ci --audit=false --fund=false'],
    ['Run disposable PostgreSQL integration suite', 'npm run test:integration'],
    ['Reject orphaned integration containers', 'npm run check:integration-orphans'],
  ],
  'production-build': [
    ...COMMON_SETUP,
    ['Install dependencies', 'npm ci --audit=false --fund=false'],
    [
      'Validate synthetic production environment',
      `node --input-type=module --eval "import { runtimeEnvSchema } from './src/lib/runtime-env-schema.js'; runtimeEnvSchema.parse(process.env);"`,
    ],
    ['Run production-format security validation', 'npm run validate:security'],
  ],
  required: [
    [
      'Require every mandatory job to succeed',
      'test "${{ needs.policy.result }}" = success && test "${{ needs.quality.result }}" = success && test "${{ needs.integration-postgres.result }}" = success && test "${{ needs.production-build.result }}" = success',
    ],
  ],
};

function stripComment(line) {
  let singleQuoted = false;
  let doubleQuoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "'" && !doubleQuoted) {
      if (singleQuoted && line[index + 1] === "'") {
        index += 1;
      } else {
        singleQuoted = !singleQuoted;
      }
    } else if (character === '"' && !singleQuoted && line[index - 1] !== '\\') {
      doubleQuoted = !doubleQuoted;
    } else if (
      character === '#' &&
      !singleQuoted &&
      !doubleQuoted &&
      (index === 0 || /\s/u.test(line[index - 1]))
    ) {
      return line.slice(0, index).trimEnd();
    }
  }
  if (singleQuoted || doubleQuoted) {
    throw new Error('unterminated quoted scalar');
  }
  return line.trimEnd();
}

function parseScalar(raw, lineNumber) {
  if (raw === '') return null;
  if (raw === '{}') return {};
  if (/^[>|&*!]/u.test(raw) || raw.startsWith('[') || raw.startsWith('{')) {
    throw new Error(`line ${lineNumber}: unsupported YAML scalar syntax`);
  }
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`line ${lineNumber}: malformed double-quoted scalar`);
    }
  }
  if (raw.startsWith("'")) {
    if (!raw.endsWith("'") || raw.length < 2) {
      throw new Error(`line ${lineNumber}: malformed single-quoted scalar`);
    }
    return raw.slice(1, -1).replaceAll("''", "'");
  }
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null' || raw === '~') return null;
  if (/^-?(?:0|[1-9][0-9]*)$/u.test(raw)) return Number(raw);
  return raw;
}

function splitMappingEntry(text, lineNumber) {
  const separator = text.indexOf(':');
  if (separator < 1) throw new Error(`line ${lineNumber}: unsupported mapping entry`);
  const key = text.slice(0, separator);
  const remainder = text.slice(separator + 1);
  if (!/^[A-Za-z_][A-Za-z0-9_.\/-]*$/u.test(key)
    || (remainder.length > 0 && !remainder.startsWith(' '))) {
    throw new Error(`line ${lineNumber}: unsupported mapping entry`);
  }
  return [key, remainder.trimStart()];
}

export function parseRestrictedWorkflow(source) {
  if (source.includes('\r')) throw new Error('carriage returns are not supported');
  if (source.includes('\t')) throw new Error('tabs are not supported');

  const tokens = [];
  for (const [zeroBasedLine, original] of source.split('\n').entries()) {
    const lineNumber = zeroBasedLine + 1;
    const withoutComment = stripComment(original);
    if (withoutComment.trim() === '') continue;
    if (/^\s*(?:---|\.\.\.|%YAML|%TAG)(?:\s|$)/u.test(withoutComment)) {
      throw new Error(`line ${lineNumber}: YAML directives/documents are not supported`);
    }
    const indent = withoutComment.length - withoutComment.trimStart().length;
    if (indent % 2 !== 0) throw new Error(`line ${lineNumber}: indentation must use two-space levels`);
    tokens.push({ indent, text: withoutComment.trimStart(), lineNumber });
  }
  if (tokens.length === 0) throw new Error('workflow is empty');

  function parseBlock(start, indent) {
    if (tokens[start]?.indent !== indent) {
      throw new Error(`line ${tokens[start]?.lineNumber ?? 'EOF'}: unexpected indentation`);
    }
    return tokens[start].text.startsWith('- ')
      ? parseSequence(start, indent)
      : parseMapping(start, indent);
  }

  function assignMappingEntry(target, key, rawValue, cursor, indent, lineNumber) {
    if (Object.hasOwn(target, key)) throw new Error(`line ${lineNumber}: duplicate mapping key ${key}`);
    if (rawValue !== '') return { cursor, value: parseScalar(rawValue, lineNumber) };
    const next = tokens[cursor];
    if (!next || next.indent <= indent) return { cursor, value: null };
    if (next.indent !== indent + 2) {
      throw new Error(`line ${next.lineNumber}: indentation skipped a level`);
    }
    const parsed = parseBlock(cursor, indent + 2);
    return { cursor: parsed.cursor, value: parsed.value };
  }

  function parseMapping(start, indent, initialEntry) {
    const value = {};
    let cursor = start;
    if (initialEntry) {
      const assigned = assignMappingEntry(
        value,
        initialEntry.key,
        initialEntry.rawValue,
        cursor,
        indent,
        initialEntry.lineNumber,
      );
      value[initialEntry.key] = assigned.value;
      cursor = assigned.cursor;
    }
    while (cursor < tokens.length && tokens[cursor].indent === indent && !tokens[cursor].text.startsWith('- ')) {
      const token = tokens[cursor];
      const [key, rawValue] = splitMappingEntry(token.text, token.lineNumber);
      cursor += 1;
      const assigned = assignMappingEntry(value, key, rawValue, cursor, indent, token.lineNumber);
      value[key] = assigned.value;
      cursor = assigned.cursor;
    }
    return { cursor, value };
  }

  function parseSequence(start, indent) {
    const value = [];
    let cursor = start;
    while (cursor < tokens.length && tokens[cursor].indent === indent && tokens[cursor].text.startsWith('- ')) {
      const token = tokens[cursor];
      const itemText = token.text.slice(2);
      cursor += 1;
      if (itemText === '') {
        if (!tokens[cursor] || tokens[cursor].indent !== indent + 2) {
          throw new Error(`line ${token.lineNumber}: empty sequence item`);
        }
        const parsed = parseBlock(cursor, indent + 2);
        value.push(parsed.value);
        cursor = parsed.cursor;
      } else if (/^[A-Za-z_][A-Za-z0-9_.\/-]*:/u.test(itemText)) {
        const [key, rawValue] = splitMappingEntry(itemText, token.lineNumber);
        const parsed = parseMapping(cursor, indent + 2, {
          key,
          rawValue,
          lineNumber: token.lineNumber,
        });
        value.push(parsed.value);
        cursor = parsed.cursor;
      } else {
        value.push(parseScalar(itemText, token.lineNumber));
      }
    }
    return { cursor, value };
  }

  const parsed = parseBlock(0, 0);
  if (parsed.cursor !== tokens.length) {
    throw new Error(`line ${tokens[parsed.cursor].lineNumber}: unsupported or inconsistent indentation`);
  }
  if (Array.isArray(parsed.value) || parsed.value === null || typeof parsed.value !== 'object') {
    throw new Error('workflow root must be a mapping');
  }
  return parsed.value;
}

function keysExactly(value, expected, location, errors) {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    errors.push(`${location} must be a mapping`);
    return false;
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    errors.push(`${location} keys must be exactly: ${wanted.join(', ')}`);
    return false;
  }
  return true;
}

function arrayExactly(value, expected, location, errors) {
  if (!Array.isArray(value) || JSON.stringify(value) !== JSON.stringify(expected)) {
    errors.push(`${location} must be exactly: ${expected.join(', ')}`);
    return false;
  }
  return true;
}

function mappingsEqual(left, right) {
  if (!left || Array.isArray(left) || typeof left !== 'object') return false;
  return JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());
}

function validateStepProfile(jobId, steps, errors) {
  const expected = EXPECTED_RUNS[jobId];
  if (!Array.isArray(steps) || steps.length !== expected.length) {
    errors.push(`jobs.${jobId}.steps must contain the restricted ${expected.length}-step profile`);
    return;
  }

  for (const [index, step] of steps.entries()) {
    const location = `jobs.${jobId}.steps[${index}]`;
    if (!step || Array.isArray(step) || typeof step !== 'object') {
      errors.push(`${location} must be a mapping`);
      continue;
    }
    const [expectedName, expectedRun] = expected[index];
    if (step.name !== expectedName) errors.push(`${location}.name must be ${expectedName}`);
    if (expectedRun === undefined) {
      const actionMatch = /^([^@]+)@([0-9a-f]{40})$/u.exec(String(step.uses ?? ''));
      if (!actionMatch) {
        errors.push(`${location}.uses must reference an approved action at a full 40-character SHA`);
      } else if (APPROVED_ACTIONS.get(actionMatch[1]) !== actionMatch[2]) {
        errors.push(`${location}.uses is not an allowlisted official action commit`);
      }
    } else if (step.run !== expectedRun) {
      errors.push(`${location}.run is outside the restricted command profile`);
    }
  }
}

function validateWorkflowObject(workflow, source) {
  const errors = [];
  keysExactly(workflow, ['name', 'on', 'concurrency', 'permissions', 'jobs'], 'workflow', errors);
  if (workflow.name !== 'CI') errors.push('workflow.name must be CI');

  if (keysExactly(workflow.on, ['pull_request', 'push'], 'workflow.on', errors)) {
    if (workflow.on.pull_request !== null) errors.push('workflow.on.pull_request must not be configured with privileged options');
    if (keysExactly(workflow.on.push, ['branches'], 'workflow.on.push', errors)) {
      arrayExactly(workflow.on.push.branches, ['main'], 'workflow.on.push.branches', errors);
    }
  }

  if (keysExactly(workflow.concurrency, ['group', 'cancel-in-progress'], 'workflow.concurrency', errors)) {
    if (
      workflow.concurrency.group !==
      'ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}'
    ) {
      errors.push('workflow.concurrency.group must isolate unrelated workflows and branch/PR identities');
    }
    if (workflow.concurrency['cancel-in-progress'] !== true) {
      errors.push('workflow.concurrency.cancel-in-progress must be true');
    }
  }

  if (keysExactly(workflow.permissions, ['contents'], 'workflow.permissions', errors)) {
    if (workflow.permissions.contents !== 'read') errors.push('workflow permissions must be contents: read only');
  }

  if (!keysExactly(workflow.jobs, EXPECTED_JOBS.keys(), 'workflow.jobs', errors)) return errors;

  for (const [jobId, expectedName] of EXPECTED_JOBS) {
    const job = workflow.jobs[jobId];
    const requiredKeys = ['name', 'runs-on', 'timeout-minutes', 'steps'];
    if (jobId === 'production-build' || jobId === 'required') requiredKeys.push('needs');
    if (jobId === 'required') requiredKeys.push('if', 'permissions');
    if (!keysExactly(job, requiredKeys, `jobs.${jobId}`, errors)) continue;
    if (job.name !== expectedName) errors.push(`jobs.${jobId}.name must be ${expectedName}`);
    if (job['runs-on'] !== 'ubuntu-24.04') errors.push(`jobs.${jobId}.runs-on must be ubuntu-24.04`);
    const allowedTimeouts = new Map([
      ['policy', 10],
      ['quality', 20],
      ['integration-postgres', 20],
      ['production-build', 20],
      ['required', 5],
    ]);
    if (job['timeout-minutes'] !== allowedTimeouts.get(jobId)) {
      errors.push(`jobs.${jobId}.timeout-minutes must match the measured baseline`);
    }
    validateStepProfile(jobId, job.steps, errors);
  }

  arrayExactly(
    workflow.jobs['production-build'].needs,
    ['policy', 'quality', 'integration-postgres'],
    'jobs.production-build.needs',
    errors,
  );
  arrayExactly(
    workflow.jobs.required.needs,
    ['policy', 'quality', 'integration-postgres', 'production-build'],
    'jobs.required.needs',
    errors,
  );
  if (workflow.jobs.required.if !== '${{ always() }}') errors.push('jobs.required.if must be ${{ always() }}');
  keysExactly(workflow.jobs.required.permissions, [], 'jobs.required.permissions', errors);

  const integrationSteps = workflow.jobs['integration-postgres'].steps ?? [];
  const integrationStep = integrationSteps.find((step) => step?.name === 'Run disposable PostgreSQL integration suite');
  const expectedIntegrationEnv = {
    INTEGRATION_POSTGRES_IMAGE: APPROVED_POSTGRES_IMAGE,
    DATABASE_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
    DIRECT_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
    SHADOW_DATABASE_URL: 'postgresql://hostile:hostile@hostile.invalid:1/hostile',
    PGHOST: 'hostile.invalid',
    PGPORT: '1',
    PGDATABASE: 'hostile',
    PGUSER: 'hostile',
    PGPASSWORD: 'hostile',
    POSTGRES_DB: 'hostile',
    POSTGRES_USER: 'hostile',
    POSTGRES_PASSWORD: 'hostile',
  };
  if (!mappingsEqual(integrationStep?.env, expectedIntegrationEnv)) {
    errors.push('integration test environment must use the approved digest and exact hostile synthetic DB/PG values');
  }
  const cleanupStep = integrationSteps.find((step) => step?.name === 'Reject orphaned integration containers');
  if (cleanupStep?.if !== '${{ always() }}') errors.push('integration orphan check must run with if: ${{ always() }}');

  const environmentValidationStep = workflow.jobs['production-build'].steps?.find(
    (step) => step?.name === 'Validate synthetic production environment',
  );
  if (!mappingsEqual(environmentValidationStep?.env, SYNTHETIC_PRODUCTION_ENVIRONMENT)) {
    errors.push('environment validation must use the exact complete synthetic production environment');
  }
  const buildStep = workflow.jobs['production-build'].steps?.find(
    (step) => step?.name === 'Run production-format security validation',
  );
  if (!mappingsEqual(buildStep?.env, SYNTHETIC_BUILD_ENVIRONMENT)) {
    errors.push('production-build must use only the exact synthetic CI environment');
  }

  for (const [jobId, job] of Object.entries(workflow.jobs)) {
    for (const [index, step] of (job.steps ?? []).entries()) {
      const allowedKeys = ['name', step.uses ? 'uses' : 'run'];
      if (step.uses) allowedKeys.push('with');
      if (step.env) allowedKeys.push('env');
      if (step.if) allowedKeys.push('if');
      keysExactly(step, allowedKeys, `jobs.${jobId}.steps[${index}]`, errors);
      if (step.uses?.startsWith('actions/checkout@')) {
        if (step.with?.['persist-credentials'] !== false || Object.keys(step.with).length !== 1) {
          errors.push(`jobs.${jobId}.steps[${index}] checkout must disable persisted credentials`);
        }
      } else if (step.uses?.startsWith('actions/setup-node@')) {
        if (
          step.with?.['node-version-file'] !== '.nvmrc' ||
          step.with?.cache !== 'npm' ||
          Object.keys(step.with).length !== 2
        ) {
          errors.push(`jobs.${jobId}.steps[${index}] setup-node must use .nvmrc and npm cache only`);
        }
      }
    }
  }

  if (/pull_request_target/u.test(source)) errors.push('pull_request_target is forbidden');
  if (/\$\{\{\s*secrets\./iu.test(source)) errors.push('repository or environment secrets are forbidden in this PR workflow');
  if (/\bruns-on\s*:\s*[^\n]*self-hosted/iu.test(source)) errors.push('self-hosted runners are forbidden');
  if (/\b(?:prisma\s+migrate|migrate\s+deploy|system:migrate|deploy(?:ment)?\b)/iu.test(source)) {
    errors.push('deployment and persistent migration commands are forbidden in the PR-03 baseline');
  }
  const imageReferences = source.match(/\bpostgres:[^\s#]+/gu) ?? [];
  if (imageReferences.length !== 1 || imageReferences[0] !== APPROVED_POSTGRES_IMAGE) {
    errors.push('the workflow must contain exactly one approved digest-pinned PostgreSQL image reference');
  }

  return errors;
}

export function validateWorkflowText(source) {
  try {
    return validateWorkflowObject(parseRestrictedWorkflow(source), source);
  } catch (error) {
    return [`restricted YAML profile rejected workflow: ${error instanceof Error ? error.message : String(error)}`];
  }
}

export async function validateWorkflowFile(filePath) {
  return validateWorkflowText(await readFile(filePath, 'utf8'));
}

export async function validateRepositoryWorkflows(repositoryRoot = process.cwd()) {
  const workflowDirectory = path.join(repositoryRoot, '.github/workflows');
  let workflowFiles;
  try {
    workflowFiles = (await readdir(workflowDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.ya?ml$/u.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    return [`cannot read ${path.relative(repositoryRoot, workflowDirectory)}: ${error.message}`];
  }
  if (JSON.stringify(workflowFiles) !== JSON.stringify(['ci.yml'])) {
    return ['restricted PR-03 profile permits exactly .github/workflows/ci.yml'];
  }
  const filePath = path.join(workflowDirectory, 'ci.yml');
  return (await validateWorkflowFile(filePath)).map((error) => `.github/workflows/ci.yml: ${error}`);
}

async function main() {
  const errors = await validateRepositoryWorkflows();
  if (errors.length > 0) {
    process.stderr.write(`CI workflow policy failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    'CI workflow policy passed (restricted PR-03 YAML profile; this is not a general-purpose YAML parser).\n',
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await main();
