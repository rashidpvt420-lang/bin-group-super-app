import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const FUNCTIONS_DEPLOYMENT_STRATEGY = 'sequential-export-batches';
export const FUNCTIONS_RECONCILIATION_STRATEGY = 'firebase-list-explicit-delete';

const FUNCTION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const REGION_PATTERN = /^[a-z][a-z0-9-]*$/;
const DEPLOYMENT_METADATA_PATH = 'launch_package/production-deployment.json';
const FUNCTIONS_RUNTIME_ENTRY = 'functions/lib/runtimeAll.js';
const OWNED_CODEBASE = 'default';
const DEFAULT_DELETE_BATCH_SIZE = 4;
const DEFAULT_DELETE_COOLDOWN_SECONDS = 75;
const MIN_RETRY_RECOVERY_SECONDS = 120;

const text = (value) => String(value ?? '').trim();
const sortedUnique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const identityDescriptor = (entry) => `${entry.codebase || 'unknown'}|${entry.region || 'unknown'}|${entry.name}`;

function boundedInteger(raw, fallback, minimum, maximum) {
  const parsed = Number.parseInt(text(raw), 10);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function canonicalFunctionName(entry) {
  const direct = text(
    entry?.id ||
    entry?.functionId ||
    entry?.functionName ||
    entry?.function ||
    entry?.serviceConfig?.functionId,
  );
  if (direct) return direct.includes('/functions/') ? direct.split('/functions/').pop() : direct;
  const resource = text(entry?.name);
  if (!resource) return '';
  return resource.includes('/functions/') ? resource.split('/functions/').pop() : resource.split('/').pop();
}

function canonicalRegion(entry) {
  const direct = text(entry?.region || entry?.location || entry?.locationId);
  if (direct) return direct;
  const resource = text(entry?.name);
  const match = resource.match(/\/locations\/([^/]+)\/functions\//);
  return match?.[1] || '';
}

function canonicalCodebase(entry) {
  const labels = entry?.labels && typeof entry.labels === 'object' ? entry.labels : {};
  return text(
    entry?.codebase ||
    labels['firebase-functions-codebase'] ||
    labels['deployment-codebase'],
  );
}

function validateIdentity(entry, label) {
  if (!FUNCTION_NAME_PATTERN.test(text(entry?.name))) {
    throw new Error(`${label} contains an invalid function name`);
  }
  if (!REGION_PATTERN.test(text(entry?.region))) {
    throw new Error(`${label} contains an invalid or missing region`);
  }
  if (text(entry?.codebase) !== OWNED_CODEBASE) {
    throw new Error(`${label} must use the ${OWNED_CODEBASE} codebase`);
  }
}

function normalizeCurrentIdentities(currentIdentities) {
  if (!Array.isArray(currentIdentities) || currentIdentities.length === 0) {
    throw new Error('Current compiled Firebase Function identities are missing');
  }
  const normalized = currentIdentities.map((entry) => ({
    name: text(entry?.name),
    region: text(entry?.region),
    codebase: text(entry?.codebase || OWNED_CODEBASE),
  }));
  for (const entry of normalized) validateIdentity(entry, 'Current compiled Firebase Function identities');
  const byDescriptor = new Map(normalized.map((entry) => [identityDescriptor(entry), entry]));
  if (byDescriptor.size !== normalized.length) {
    throw new Error('Current compiled Firebase Function identities contain duplicates');
  }
  return [...byDescriptor.values()].sort((left, right) => identityDescriptor(left).localeCompare(identityDescriptor(right)));
}

export function parseRemoteFunctionList(raw) {
  let payload;
  try {
    payload = JSON.parse(text(raw));
  } catch {
    throw new Error('Firebase functions:list returned malformed JSON');
  }

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result)
      ? payload.result
      : Array.isArray(payload?.result?.functions)
        ? payload.result.functions
        : Array.isArray(payload?.functions)
          ? payload.functions
          : null;
  if (!rows) throw new Error('Firebase functions:list JSON does not contain a function array');

  const parsed = rows.map((entry) => ({
    name: canonicalFunctionName(entry),
    region: canonicalRegion(entry),
    codebase: canonicalCodebase(entry),
  }));
  const invalid = parsed.filter(({ name, region }) => !FUNCTION_NAME_PATTERN.test(name) || !REGION_PATTERN.test(region));
  if (invalid.length > 0) throw new Error('Firebase functions:list returned invalid function names or regions');

  return parsed.sort((left, right) => identityDescriptor(left).localeCompare(identityDescriptor(right)));
}

export function parseCompiledFunctionIdentities(raw) {
  let rows;
  try {
    rows = JSON.parse(text(raw));
  } catch {
    throw new Error('Compiled Firebase Function identity discovery returned malformed JSON');
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Compiled Firebase Function identity discovery returned no endpoints');
  }
  return normalizeCurrentIdentities(rows);
}

function discoverCompiledFunctionIdentities() {
  if (!existsSync(FUNCTIONS_RUNTIME_ENTRY)) {
    throw new Error(`Missing compiled Functions runtime: ${FUNCTIONS_RUNTIME_ENTRY}`);
  }
  const absoluteEntry = `${process.cwd()}/${FUNCTIONS_RUNTIME_ENTRY}`;
  const probe = `
const mod = require(${JSON.stringify(absoluteEntry)});
const rows = [];
for (const [name, value] of Object.entries(mod || {})) {
  const endpoint = value && (value.__endpoint || value.__trigger);
  if (!endpoint) continue;
  const rawRegions = endpoint.region ?? endpoint.regions ?? endpoint.options?.region ?? endpoint.opts?.region;
  const regions = Array.isArray(rawRegions) ? rawRegions : (rawRegions ? [rawRegions] : []);
  for (const region of regions) rows.push({ name, region: String(region), codebase: 'default' });
}
process.stdout.write(JSON.stringify(rows));
`;
  const result = spawnSync(process.execPath, ['-e', probe], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`Could not discover compiled Firebase Function identities: ${text(result.stderr || result.stdout)}`);
  }
  return parseCompiledFunctionIdentities(result.stdout);
}

export function buildFunctionReconciliationPlan(currentIdentities, remoteEntries) {
  const current = normalizeCurrentIdentities(currentIdentities);
  const currentDescriptors = new Set(current.map(identityDescriptor));
  const owned = remoteEntries.filter((entry) => entry.codebase === OWNED_CODEBASE);
  const preservedUnowned = remoteEntries
    .filter((entry) => entry.codebase !== OWNED_CODEBASE)
    .map(identityDescriptor)
    .sort();
  const obsoleteOwned = owned
    .filter((entry) => !currentDescriptors.has(identityDescriptor(entry)))
    .sort((left, right) => identityDescriptor(left).localeCompare(identityDescriptor(right)));
  const unsafeObsolete = obsoleteOwned.filter((entry) => !entry.region);
  if (unsafeObsolete.length > 0) {
    throw new Error('Obsolete owned Firebase Functions are missing region metadata');
  }

  const remoteOwnedDescriptors = new Set(owned.map(identityDescriptor));
  const currentMissing = current
    .filter((entry) => !remoteOwnedDescriptors.has(identityDescriptor(entry)))
    .map(identityDescriptor)
    .sort();
  return {
    current,
    compiledEndpointIdentities: current.map(identityDescriptor),
    remoteBefore: remoteEntries.map(identityDescriptor).sort(),
    obsoleteOwned,
    preservedUnowned,
    currentMissing,
  };
}

function runFirebase(args, label, { attempts = 3, retryDelaySeconds = MIN_RETRY_RECOVERY_SECONDS } = {}) {
  const recoverySeconds = Math.max(
    MIN_RETRY_RECOVERY_SECONDS,
    boundedInteger(
      process.env.FIREBASE_FUNCTION_RECONCILIATION_RETRY_DELAY_SECONDS,
      retryDelaySeconds,
      MIN_RETRY_RECOVERY_SECONDS,
      600,
    ),
  );
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync('npx', ['firebase', ...args], {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      stdio: args.includes('--json') ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
    });
    if ((result.status ?? 1) === 0) return result;
    if (attempt < attempts) {
      console.log(`[functions-reconciliation] waiting ${recoverySeconds * attempt}s before retrying ${label}`);
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        recoverySeconds * attempt * 1000,
      );
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts`);
}

function listRemoteFunctions(projectId) {
  const result = runFirebase(
    ['functions:list', '--project', projectId, '--json'],
    'Firebase functions:list',
  );
  return parseRemoteFunctionList(result.stdout);
}

function deleteObsoleteFunctions(projectId, obsoleteOwned) {
  if (!obsoleteOwned.length) return [];
  const batchSize = boundedInteger(
    process.env.FIREBASE_FUNCTION_DELETE_BATCH_SIZE,
    DEFAULT_DELETE_BATCH_SIZE,
    1,
    6,
  );
  const cooldownSeconds = boundedInteger(
    process.env.FIREBASE_FUNCTION_DELETE_COOLDOWN_SECONDS,
    DEFAULT_DELETE_COOLDOWN_SECONDS,
    60,
    300,
  );
  const byRegion = new Map();
  for (const entry of obsoleteOwned) {
    const existing = byRegion.get(entry.region) || [];
    existing.push(entry.name);
    byRegion.set(entry.region, existing);
  }

  const batches = [];
  for (const region of [...byRegion.keys()].sort()) {
    const names = sortedUnique(byRegion.get(region));
    for (let index = 0; index < names.length; index += batchSize) {
      batches.push({ region, names: names.slice(index, index + batchSize) });
    }
  }

  const deleted = [];
  batches.forEach((batch, index) => {
    runFirebase(
      [
        'functions:delete',
        ...batch.names,
        '--region',
        batch.region,
        '--project',
        projectId,
        '--force',
      ],
      `obsolete Functions deletion batch ${index + 1}/${batches.length}`,
    );
    deleted.push(...batch.names.map((name) => `${OWNED_CODEBASE}|${batch.region}|${name}`));
    if (index < batches.length - 1) {
      console.log(
        `[functions-reconciliation] waiting ${cooldownSeconds}s between deletion batches to respect the regional mutation quota`,
      );
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        cooldownSeconds * 1000,
      );
    }
  });
  return deleted.sort();
}

function reconcileProductionFunctions() {
  if (!existsSync(DEPLOYMENT_METADATA_PATH)) {
    throw new Error(`${DEPLOYMENT_METADATA_PATH} is missing before Function reconciliation`);
  }
  const metadata = JSON.parse(readFileSync(DEPLOYMENT_METADATA_PATH, 'utf8'));
  const projectId = text(metadata.projectId || process.env.GCP_PROJECT_ID);
  if (projectId !== 'bin-group-57c60') throw new Error('Function reconciliation project mismatch');

  const compiledIdentities = discoverCompiledFunctionIdentities();
  const compiledNames = sortedUnique(compiledIdentities.map((entry) => entry.name));
  const recordedNames = sortedUnique(metadata?.functionsDeployment?.deployedFunctions || []);
  if (compiledNames.join('\n') !== recordedNames.join('\n')) {
    throw new Error('Compiled Function identities do not match deployment-recorded export names');
  }

  const before = listRemoteFunctions(projectId);
  const plan = buildFunctionReconciliationPlan(compiledIdentities, before);
  if (plan.currentMissing.length > 0) {
    throw new Error(`Current owned Firebase Function identities are missing after deployment: ${plan.currentMissing.join(', ')}`);
  }

  const obsoleteDeleted = deleteObsoleteFunctions(projectId, plan.obsoleteOwned);
  const after = listRemoteFunctions(projectId);
  const afterPlan = buildFunctionReconciliationPlan(compiledIdentities, after);
  const obsoleteOwnedRemaining = afterPlan.obsoleteOwned.map(identityDescriptor).sort();
  if (afterPlan.currentMissing.length > 0) {
    throw new Error(`Current owned Firebase Function identities are missing after reconciliation: ${afterPlan.currentMissing.join(', ')}`);
  }
  if (obsoleteOwnedRemaining.length > 0) {
    throw new Error(`Obsolete owned Firebase Function identities remain after reconciliation: ${obsoleteOwnedRemaining.join(', ')}`);
  }

  metadata.functionsDeployment.reconciliation = {
    strategy: FUNCTIONS_RECONCILIATION_STRATEGY,
    status: 'passed',
    projectId,
    codebase: OWNED_CODEBASE,
    compiledEndpointIdentities: plan.compiledEndpointIdentities,
    remoteBefore: plan.remoteBefore,
    obsoleteDeleted,
    preservedUnowned: plan.preservedUnowned,
    remoteAfter: after.map(identityDescriptor).sort(),
    obsoleteOwnedRemaining,
    currentMissingAfter: afterPlan.currentMissing,
    deletionBatchSize: boundedInteger(
      process.env.FIREBASE_FUNCTION_DELETE_BATCH_SIZE,
      DEFAULT_DELETE_BATCH_SIZE,
      1,
      6,
    ),
    deletionCooldownSeconds: boundedInteger(
      process.env.FIREBASE_FUNCTION_DELETE_COOLDOWN_SECONDS,
      DEFAULT_DELETE_COOLDOWN_SECONDS,
      60,
      300,
    ),
    retryRecoveryMinimumSeconds: MIN_RETRY_RECOVERY_SECONDS,
    observedAt: new Date().toISOString(),
  };
  writeFileSync(DEPLOYMENT_METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(
    `[functions-reconciliation] PASS deleted=${obsoleteDeleted.length} preserved_unowned=${plan.preservedUnowned.length}`,
  );
}

function validateSortedUniqueStrings(values, label, failures) {
  if (!Array.isArray(values)) {
    failures.push(`${label} must be an array`);
    return;
  }
  const normalized = values.map(text);
  if (normalized.some((value) => !value)) failures.push(`${label} contains empty values`);
  if (new Set(normalized).size !== normalized.length) failures.push(`${label} contains duplicates`);
  if (normalized.join('\n') !== [...normalized].sort().join('\n')) {
    failures.push(`${label} must be deterministically sorted`);
  }
}

function validateCompiledIdentityEvidence(values, deployedNames, failures) {
  validateSortedUniqueStrings(values, 'functionsDeployment reconciliation compiledEndpointIdentities', failures);
  if (!Array.isArray(values)) return;
  const parsedNames = [];
  for (const value of values) {
    const [codebase, region, name, ...extra] = text(value).split('|');
    if (extra.length || codebase !== OWNED_CODEBASE || !REGION_PATTERN.test(region) || !FUNCTION_NAME_PATTERN.test(name)) {
      failures.push('functionsDeployment reconciliation compiledEndpointIdentities contains invalid identities');
      continue;
    }
    parsedNames.push(name);
  }
  if (sortedUnique(parsedNames).join('\n') !== sortedUnique(deployedNames).join('\n')) {
    failures.push('functionsDeployment reconciliation compiledEndpointIdentities do not match deployedFunctions');
  }
}

export function validateFunctionsDeploymentEvidence(evidence) {
  const failures = [];
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    return ['functionsDeployment evidence is missing or malformed'];
  }

  if (evidence.strategy !== FUNCTIONS_DEPLOYMENT_STRATEGY) {
    failures.push(`functionsDeployment strategy must be ${FUNCTIONS_DEPLOYMENT_STRATEGY}`);
  }

  const functionCount = Number(evidence.functionCount);
  const batchCount = Number(evidence.batchCount);
  const batchSize = Number(evidence.batchSize);
  const cooldownSeconds = Number(evidence.cooldownSeconds);
  const names = evidence.deployedFunctions;

  if (!Number.isInteger(functionCount) || functionCount <= 0) {
    failures.push('functionsDeployment functionCount must be a positive integer');
  }
  if (!Number.isInteger(batchCount) || batchCount <= 0) {
    failures.push('functionsDeployment batchCount must be a positive integer');
  }
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 6) {
    failures.push('functionsDeployment batchSize must be an integer from 1 through 6');
  }
  if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 60 || cooldownSeconds > 300) {
    failures.push('functionsDeployment cooldownSeconds must be an integer from 60 through 300');
  }
  if (!Array.isArray(names) || names.length === 0) {
    failures.push('functionsDeployment deployedFunctions must be a non-empty array');
    return failures;
  }

  const normalizedNames = names.map((name) => String(name || ''));
  const invalidNames = normalizedNames.filter((name) => !FUNCTION_NAME_PATTERN.test(name));
  if (invalidNames.length > 0) {
    failures.push('functionsDeployment deployedFunctions contains invalid export names');
  }
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    failures.push('functionsDeployment deployedFunctions contains duplicates');
  }
  if (normalizedNames.join('\n') !== [...normalizedNames].sort().join('\n')) {
    failures.push('functionsDeployment deployedFunctions must be deterministically sorted');
  }
  if (Number.isInteger(functionCount) && normalizedNames.length !== functionCount) {
    failures.push('functionsDeployment functionCount does not match deployedFunctions length');
  }
  if (
    Number.isInteger(functionCount) && functionCount > 0 &&
    Number.isInteger(batchSize) && batchSize > 0 &&
    Number.isInteger(batchCount) &&
    batchCount !== Math.ceil(functionCount / batchSize)
  ) {
    failures.push('functionsDeployment batchCount does not match functionCount and batchSize');
  }

  const reconciliation = evidence.reconciliation;
  if (!reconciliation || typeof reconciliation !== 'object' || Array.isArray(reconciliation)) {
    failures.push('functionsDeployment reconciliation evidence is missing or malformed');
  } else {
    if (reconciliation.strategy !== FUNCTIONS_RECONCILIATION_STRATEGY) {
      failures.push(`functionsDeployment reconciliation strategy must be ${FUNCTIONS_RECONCILIATION_STRATEGY}`);
    }
    if (reconciliation.status !== 'passed') failures.push('functionsDeployment reconciliation status must be passed');
    if (reconciliation.projectId !== 'bin-group-57c60') failures.push('functionsDeployment reconciliation projectId mismatch');
    if (reconciliation.codebase !== OWNED_CODEBASE) failures.push('functionsDeployment reconciliation codebase mismatch');
    validateCompiledIdentityEvidence(reconciliation.compiledEndpointIdentities, normalizedNames, failures);
    validateSortedUniqueStrings(reconciliation.remoteBefore, 'functionsDeployment reconciliation remoteBefore', failures);
    validateSortedUniqueStrings(reconciliation.obsoleteDeleted, 'functionsDeployment reconciliation obsoleteDeleted', failures);
    validateSortedUniqueStrings(reconciliation.preservedUnowned, 'functionsDeployment reconciliation preservedUnowned', failures);
    validateSortedUniqueStrings(reconciliation.remoteAfter, 'functionsDeployment reconciliation remoteAfter', failures);
    validateSortedUniqueStrings(reconciliation.obsoleteOwnedRemaining, 'functionsDeployment reconciliation obsoleteOwnedRemaining', failures);
    validateSortedUniqueStrings(reconciliation.currentMissingAfter, 'functionsDeployment reconciliation currentMissingAfter', failures);
    if (Array.isArray(reconciliation.obsoleteOwnedRemaining) && reconciliation.obsoleteOwnedRemaining.length > 0) {
      failures.push('functionsDeployment reconciliation left obsolete owned Functions');
    }
    if (Array.isArray(reconciliation.currentMissingAfter) && reconciliation.currentMissingAfter.length > 0) {
      failures.push('functionsDeployment reconciliation is missing current owned Functions');
    }
    const retryRecovery = Number(reconciliation.retryRecoveryMinimumSeconds);
    if (!Number.isInteger(retryRecovery) || retryRecovery < MIN_RETRY_RECOVERY_SECONDS) {
      failures.push(`functionsDeployment reconciliation retry recovery must be an integer of at least ${MIN_RETRY_RECOVERY_SECONDS} seconds`);
    }
  }

  return failures;
}

const shouldReconcile =
  process.argv.includes('--write-evidence') &&
  process.env.GITHUB_ACTIONS === 'true' &&
  process.env.GITHUB_REF === 'refs/heads/main' &&
  text(process.env.DEPLOYMENT_ENVIRONMENT) === 'production';

if (shouldReconcile) {
  try {
    reconcileProductionFunctions();
  } catch (error) {
    console.error(`[functions-reconciliation] FAIL — ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
