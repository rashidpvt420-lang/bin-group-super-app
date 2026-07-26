import { spawnSync } from 'node:child_process';

const EXPECTED_CODEBASE = 'default';
const FUNCTION_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*$/;
const REGION_PATTERN = /^[a-z0-9-]+$/;
const DEFAULT_BATCH_SIZE = 4;
const DEFAULT_COOLDOWN_SECONDS = 75;
const MIN_RETRY_DELAY_SECONDS = 120;

const text = (value) => String(value ?? '').trim();
const canonicalDescriptor = (entry) => ({
  id: text(entry.id),
  region: text(entry.region),
  codebase: text(entry.codebase),
  platform: text(entry.platform),
});
const descriptorKey = (entry) => `${entry.region}/${entry.id}`;
const sortDescriptors = (entries) => [...entries].sort((left, right) =>
  descriptorKey(left).localeCompare(descriptorKey(right)) || left.codebase.localeCompare(right.codebase),
);

function safeInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  const selected = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(maximum, Math.max(minimum, selected));
}

function parseListPayload(raw) {
  let payload;
  try {
    payload = JSON.parse(text(raw));
  } catch {
    throw new Error('Firebase Functions list output is malformed JSON.');
  }
  const entries = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.result)
      ? payload.result
      : Array.isArray(payload?.functions)
        ? payload.functions
        : null;
  if (!entries) throw new Error('Firebase Functions list output has no endpoint array.');
  return entries;
}

export function normalizeDeployedFunctions(raw) {
  const entries = parseListPayload(raw).map(canonicalDescriptor);
  for (const entry of entries) {
    if (!FUNCTION_NAME_PATTERN.test(entry.id)) {
      throw new Error('Firebase Functions list contains an invalid function name.');
    }
    if (!REGION_PATTERN.test(entry.region)) {
      throw new Error(`Firebase Functions list contains an invalid region for ${entry.id}.`);
    }
  }
  const keys = entries.map(descriptorKey);
  if (new Set(keys).size !== keys.length) {
    throw new Error('Firebase Functions list contains duplicate regional endpoints.');
  }
  return sortDescriptors(entries);
}

export function planFunctionsReconciliation(currentFunctionNames, remoteFunctions) {
  const current = [...new Set(currentFunctionNames.map(text))].sort();
  if (!current.length || current.some((name) => !FUNCTION_NAME_PATTERN.test(name))) {
    throw new Error('Current compiled Function export set is empty or invalid.');
  }
  const currentSet = new Set(current);
  const owned = remoteFunctions.filter((entry) => entry.codebase === EXPECTED_CODEBASE);
  const preservedUnowned = remoteFunctions.filter((entry) => entry.codebase !== EXPECTED_CODEBASE);
  const obsoleteOwned = owned.filter((entry) => !currentSet.has(entry.id));
  return {
    currentFunctions: current,
    remoteOwned: sortDescriptors(owned),
    obsoleteOwned: sortDescriptors(obsoleteOwned),
    preservedUnowned: sortDescriptors(preservedUnowned),
  };
}

function sleepSeconds(seconds) {
  if (!seconds) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function runFirebase(args, { projectId, capture = false } = {}) {
  return spawnSync('npx', ['firebase', ...args, '--project', projectId, '--non-interactive'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function listRemoteFunctions(projectId) {
  const result = runFirebase(['functions:list', '--json'], { projectId, capture: true });
  if ((result.status ?? 1) !== 0) {
    throw new Error('Could not list deployed Firebase Functions for reconciliation.');
  }
  return normalizeDeployedFunctions(result.stdout);
}

function chunkByRegion(entries, batchSize) {
  const grouped = new Map();
  for (const entry of entries) {
    const regionEntries = grouped.get(entry.region) || [];
    regionEntries.push(entry);
    grouped.set(entry.region, regionEntries);
  }
  const batches = [];
  for (const region of [...grouped.keys()].sort()) {
    const regional = sortDescriptors(grouped.get(region));
    for (let index = 0; index < regional.length; index += batchSize) {
      batches.push(regional.slice(index, index + batchSize));
    }
  }
  return batches;
}

function deleteBatch(batch, { projectId, attempts, retryDelaySeconds }) {
  const region = batch[0].region;
  const names = batch.map((entry) => entry.id);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    console.log(
      `[functions-reconciliation] deleting stale default-codebase Functions in ${region} ` +
      `attempt ${attempt}/${attempts}: ${names.join(', ')}`,
    );
    const result = runFirebase(
      ['functions:delete', ...names, '--region', region, '--force'],
      { projectId },
    );
    if ((result.status ?? 1) === 0) return;
    if (attempt < attempts) {
      const delay = retryDelaySeconds * attempt;
      console.warn(`[functions-reconciliation] deletion failed; waiting ${delay}s before retry`);
      sleepSeconds(delay);
    }
  }
  throw new Error(`Failed to delete stale Functions in ${region} after ${attempts} attempts.`);
}

export function reconcileFirebaseFunctionsProduction({
  projectId,
  currentFunctionNames,
  env = process.env,
} = {}) {
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    env.DEPLOYMENT_ENVIRONMENT !== 'production' ||
    projectId !== 'bin-group-57c60'
  ) {
    throw new Error('Function reconciliation requires the protected exact-main production workflow.');
  }

  const deletionBatchSize = safeInteger(env.FIREBASE_FUNCTION_DELETE_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 6);
  const cooldownSeconds = safeInteger(env.FIREBASE_FUNCTION_DELETE_COOLDOWN_SECONDS, DEFAULT_COOLDOWN_SECONDS, 60, 300);
  const attempts = safeInteger(env.FIREBASE_DEPLOY_MAX_ATTEMPTS, 3, 1, 5);
  const retryDelaySeconds = safeInteger(
    env.FIREBASE_FUNCTION_DELETE_RETRY_DELAY_SECONDS,
    MIN_RETRY_DELAY_SECONDS,
    MIN_RETRY_DELAY_SECONDS,
    300,
  );

  const remoteBefore = listRemoteFunctions(projectId);
  const plan = planFunctionsReconciliation(currentFunctionNames, remoteBefore);
  const deletionBatches = chunkByRegion(plan.obsoleteOwned, deletionBatchSize);

  deletionBatches.forEach((batch, index) => {
    deleteBatch(batch, { projectId, attempts, retryDelaySeconds });
    if (index < deletionBatches.length - 1) {
      console.log(`[functions-reconciliation] waiting ${cooldownSeconds}s before the next deletion batch`);
      sleepSeconds(cooldownSeconds);
    }
  });

  const remoteAfter = listRemoteFunctions(projectId);
  const afterPlan = planFunctionsReconciliation(currentFunctionNames, remoteAfter);
  if (afterPlan.obsoleteOwned.length > 0) {
    throw new Error(
      `Obsolete default-codebase Functions remain after reconciliation: ` +
      afterPlan.obsoleteOwned.map(descriptorKey).join(', '),
    );
  }

  return {
    status: 'passed',
    codebase: EXPECTED_CODEBASE,
    remoteBefore,
    obsoleteOwnedBefore: plan.obsoleteOwned,
    deletedObsolete: plan.obsoleteOwned,
    preservedUnowned: plan.preservedUnowned,
    remoteAfter,
    obsoleteOwnedRemaining: afterPlan.obsoleteOwned,
    deletionBatchCount: deletionBatches.length,
    deletionBatchSize,
    cooldownSeconds,
    retryDelaySeconds,
  };
}
