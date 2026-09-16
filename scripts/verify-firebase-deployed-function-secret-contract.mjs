#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requiredFirebaseDeploymentSecrets } from './verify-firebase-production-secrets.mjs';

const functionsRuntimeEntry = 'functions/lib/runtimeAll.js';
const secretNamePattern = /^[A-Z][A-Z0-9_]*$/;
const expectedProjectId = 'bin-group-57c60';
const payslipEndpointName = 'generateAndEmailPayslip';
const payslipServiceName = 'generateandemailpayslip';
const payslipRegion = 'europe-west3';
const retiredPayslipSecretBindings = Object.freeze(['SMTP_HOST', 'SMTP_PASS', 'SMTP_USER']);

function normalizeSecretNames(names, label) {
  if (!Array.isArray(names)) {
    throw new Error(`[firebase-function-secret-contract] ${label} must be an array.`);
  }
  const normalized = names.map((name) => String(name || '').trim()).filter(Boolean).sort();
  const invalid = normalized.filter((name) => !secretNamePattern.test(name));
  if (invalid.length || new Set(normalized).size !== normalized.length) {
    throw new Error(
      `[firebase-function-secret-contract] ${label} contains invalid or duplicate secret names: ${invalid.join(', ') || 'duplicate names'}.`,
    );
  }
  return normalized;
}

function executeCompiledProbe(sourceFactory, {
  runtimeEntry = functionsRuntimeEntry,
  cwd = process.cwd(),
  spawnSyncImpl = spawnSync,
  nodeBinary = process.execPath,
} = {}) {
  if (!existsSync(runtimeEntry)) {
    throw new Error(`[firebase-function-secret-contract] Missing compiled Functions runtime: ${runtimeEntry}.`);
  }

  const absoluteEntry = path.resolve(cwd, runtimeEntry);
  const result = spawnSyncImpl(nodeBinary, ['-e', sourceFactory(absoluteEntry)], {
    cwd,
    env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(
      `[firebase-function-secret-contract] Could not inspect compiled Firebase Function metadata: ${String(result.stderr || result.stdout || 'unknown discovery failure').trim()}`,
    );
  }
  return String(result.stdout || '').trim();
}

export function discoverCompiledFunctionSecretNames(options = {}) {
  const output = executeCompiledProbe((absoluteEntry) => `
const mod = require(${JSON.stringify(absoluteEntry)});
const names = new Set();
for (const value of Object.values(mod || {})) {
  const secrets = value?.__endpoint?.secretEnvironmentVariables || [];
  for (const secret of secrets) {
    const key = String(secret?.key || '').trim();
    if (key) names.add(key);
  }
}
process.stdout.write(JSON.stringify([...names].sort()));
`, options);

  try {
    return normalizeSecretNames(JSON.parse(output), 'compiled Function metadata');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[firebase-function-secret-contract]')) throw error;
    throw new Error('[firebase-function-secret-contract] Compiled Firebase Function metadata returned malformed JSON.');
  }
}

export function discoverCompiledEndpointSecretNames(endpointName, options = {}) {
  const endpoint = String(endpointName || '').trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(endpoint)) {
    throw new Error('[firebase-function-secret-contract] Endpoint name is invalid.');
  }
  const output = executeCompiledProbe((absoluteEntry) => `
const mod = require(${JSON.stringify(absoluteEntry)});
const value = mod[${JSON.stringify(endpoint)}];
if (!value || !value.__endpoint) {
  process.stderr.write('compiled endpoint not found');
  process.exit(2);
}
const names = (value.__endpoint.secretEnvironmentVariables || [])
  .map((secret) => String(secret?.key || '').trim())
  .filter(Boolean)
  .sort();
process.stdout.write(JSON.stringify([...new Set(names)]));
`, options);

  try {
    return normalizeSecretNames(JSON.parse(output), `compiled endpoint ${endpoint}`);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('[firebase-function-secret-contract]')) throw error;
    throw new Error(`[firebase-function-secret-contract] Compiled endpoint ${endpoint} returned malformed secret metadata.`);
  }
}

export function verifyFirebaseDeployedFunctionSecretContract({
  expectedSecretNames = requiredFirebaseDeploymentSecrets,
  discoverSecretNames = discoverCompiledFunctionSecretNames,
} = {}) {
  const expected = normalizeSecretNames(expectedSecretNames, 'canonical deployment secret contract');
  const discovered = normalizeSecretNames(discoverSecretNames(), 'compiled Function metadata');
  const missingFromPreflight = discovered.filter((name) => !expected.includes(name));
  const noLongerBound = expected.filter((name) => !discovered.includes(name));

  if (missingFromPreflight.length || noLongerBound.length) {
    const details = [];
    if (missingFromPreflight.length) details.push(`missing from preflight: ${missingFromPreflight.join(', ')}`);
    if (noLongerBound.length) details.push(`no longer bound by compiled Functions: ${noLongerBound.join(', ')}`);
    throw new Error(`[firebase-function-secret-contract] Canonical deployment secret contract drifted (${details.join('; ')}).`);
  }

  return {
    status: 'passed',
    runtimeEntry: functionsRuntimeEntry,
    secretCount: discovered.length,
    secretNames: discovered,
    secretValuesExcluded: true,
    deploymentPerformed: false,
  };
}

function parseCloudRunService(stdout) {
  try {
    const parsed = JSON.parse(String(stdout || '').trim());
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed;
  } catch {
    throw new Error('[firebase-function-secret-contract] Cloud Run service metadata was malformed.');
  }
}

function cloudRunSecretEnvNames(service) {
  const containerGroups = [
    service?.spec?.template?.spec?.containers,
    service?.template?.containers,
  ];
  const names = new Set();
  for (const containers of containerGroups) {
    if (!Array.isArray(containers)) continue;
    for (const container of containers) {
      for (const env of Array.isArray(container?.env) ? container.env : []) {
        const ref = env?.valueFrom?.secretKeyRef || env?.value_from?.secret_key_ref;
        const name = String(env?.name || '').trim();
        if (ref && name) names.add(name);
      }
    }
  }
  return [...names].sort();
}

function parseCloudFunction(stdout) {
  try {
    const parsed = JSON.parse(String(stdout || '').trim());
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    return parsed;
  } catch {
    throw new Error('[firebase-function-secret-contract] Cloud Functions metadata was malformed.');
  }
}

function cloudFunctionSecretEnvNames(fn) {
  const vars = Array.isArray(fn?.serviceConfig?.secretEnvironmentVariables)
    ? fn.serviceConfig.secretEnvironmentVariables
    : [];
  return [...new Set(vars.map((entry) => String(entry?.key || '').trim()).filter(Boolean))].sort();
}

function describeCloudRunService({ projectId, region, serviceName, spawnSyncImpl }) {
  const result = spawnSyncImpl('gcloud', [
    'run', 'services', 'describe', serviceName,
    '--region', region,
    '--project', projectId,
    '--format=json',
  ], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error('[firebase-function-secret-contract] Could not inspect the protected Cloud Run payslip service.');
  }
  return parseCloudRunService(result.stdout);
}

function describeCloudFunction({ projectId, region, endpointName, spawnSyncImpl }) {
  const result = spawnSyncImpl('gcloud', [
    'functions', 'describe', endpointName,
    '--gen2',
    '--region', region,
    '--project', projectId,
    '--format=json',
  ], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error('[firebase-function-secret-contract] Could not inspect the protected Cloud Functions payslip endpoint.');
  }
  return parseCloudFunction(result.stdout);
}

function reconcileViaCloudFunctionsV2({ projectId, region, endpointName, spawnSyncImpl }) {
  const before = describeCloudFunction({ projectId, region, endpointName, spawnSyncImpl });
  const configured = cloudFunctionSecretEnvNames(before);
  const unexpected = configured.filter((name) => !retiredPayslipSecretBindings.includes(name));
  if (unexpected.length) {
    throw new Error(
      `[firebase-function-secret-contract] Refusing Cloud Functions fallback because unexpected payslip secrets are configured: ${unexpected.join(', ')}.`,
    );
  }

  const functionResource = `projects/${projectId}/locations/${region}/functions/${endpointName}`;
  const patchSource = `
const { execFileSync } = require('node:child_process');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  if (!token) throw new Error('access token unavailable');
  const resource = ${JSON.stringify(functionResource)};
  const base = 'https://cloudfunctions.googleapis.com/v2/';
  const response = await fetch(base + resource + '?updateMask=serviceConfig.secretEnvironmentVariables', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: resource, serviceConfig: { secretEnvironmentVariables: [] } }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error('Cloud Functions PATCH failed with HTTP ' + response.status + ': ' + responseText.slice(0, 1200));
  const operation = JSON.parse(responseText);
  if (!operation.name) throw new Error('Cloud Functions PATCH did not return an operation name');
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const poll = await fetch(base + operation.name, { headers: { Authorization: 'Bearer ' + token } });
    const pollText = await poll.text();
    if (!poll.ok) throw new Error('Cloud Functions operation poll failed with HTTP ' + poll.status + ': ' + pollText.slice(0, 1200));
    const current = JSON.parse(pollText);
    if (current.done) {
      if (current.error) throw new Error('Cloud Functions PATCH operation failed: ' + JSON.stringify(current.error).slice(0, 1200));
      process.stdout.write('cloud-functions-secret-reconciliation=passed');
      return;
    }
    await sleep(2000);
  }
  throw new Error('Cloud Functions PATCH operation timed out');
})().catch((error) => {
  console.error(String(error?.message || error));
  process.exit(1);
});
`;
  const patch = spawnSyncImpl(process.execPath, ['-e', patchSource], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
    timeout: 390000,
  });
  if ((patch.status ?? 1) !== 0) {
    const detail = String(patch.stderr || patch.stdout || 'unknown Cloud Functions API failure')
      .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
      .trim()
      .slice(0, 1600);
    throw new Error(`[firebase-function-secret-contract] Cloud Functions fallback failed: ${detail}`);
  }

  const after = describeCloudFunction({ projectId, region, endpointName, spawnSyncImpl });
  const remaining = cloudFunctionSecretEnvNames(after);
  if (remaining.length) {
    throw new Error(`[firebase-function-secret-contract] Payslip secret bindings remain in Cloud Functions config after fallback: ${remaining.join(', ')}.`);
  }
}

export function isProtectedProductionSecretReconciliationContext(env = process.env) {
  return env.GITHUB_ACTIONS === 'true'
    && env.GITHUB_REF === 'refs/heads/main'
    && env.GITHUB_WORKFLOW === 'Firebase Production Deploy'
    && env.GITHUB_JOB === 'deploy-firebase-production-stack'
    && env.DEPLOYMENT_ENVIRONMENT === 'production'
    && String(env.GCP_PROJECT_ID || '').trim() === expectedProjectId;
}

export function reconcileRetiredPayslipSecretBindings({
  projectId = String(process.env.GCP_PROJECT_ID || '').trim(),
  region = payslipRegion,
  serviceName = payslipServiceName,
  endpointName = payslipEndpointName,
  spawnSyncImpl = spawnSync,
  discoverEndpointSecretNames = discoverCompiledEndpointSecretNames,
} = {}) {
  if (projectId !== expectedProjectId || region !== payslipRegion || serviceName !== payslipServiceName || endpointName !== payslipEndpointName) {
    throw new Error('[firebase-function-secret-contract] Refusing stale-secret reconciliation outside the canonical payslip production target.');
  }

  const compiledSecrets = normalizeSecretNames(
    discoverEndpointSecretNames(endpointName),
    `compiled endpoint ${endpointName}`,
  );
  const stillRequired = retiredPayslipSecretBindings.filter((name) => compiledSecrets.includes(name));
  if (stillRequired.length) {
    throw new Error(
      `[firebase-function-secret-contract] Refusing to remove payslip secret bindings still required by current compiled code: ${stillRequired.join(', ')}.`,
    );
  }

  const before = describeCloudRunService({ projectId, region, serviceName, spawnSyncImpl });
  const liveSecretNames = cloudRunSecretEnvNames(before);
  const staleNames = retiredPayslipSecretBindings.filter((name) => liveSecretNames.includes(name));
  if (!staleNames.length) {
    return {
      status: 'passed',
      action: 'no-op',
      serviceName,
      endpointName,
      removedBindingNames: [],
      secretValuesExcluded: true,
    };
  }

  const update = spawnSyncImpl('gcloud', [
    'run', 'services', 'update', serviceName,
    '--region', region,
    '--project', projectId,
    `--remove-secrets=${staleNames.join(',')}`,
    '--quiet',
  ], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 16 * 1024 * 1024,
  });

  let reconciliationPath = 'cloud-run';
  if ((update.status ?? 1) !== 0) {
    reconcileViaCloudFunctionsV2({ projectId, region, endpointName, spawnSyncImpl });
    reconciliationPath = 'cloud-functions-v2';
  }

  const after = describeCloudRunService({ projectId, region, serviceName, spawnSyncImpl });
  const remainingNames = cloudRunSecretEnvNames(after);
  const remainingStale = staleNames.filter((name) => remainingNames.includes(name));
  if (remainingStale.length) {
    throw new Error('[firebase-function-secret-contract] Obsolete payslip Cloud Run secret bindings remain after reconciliation.');
  }

  return {
    status: 'passed',
    action: 'removed-obsolete-bindings',
    reconciliationPath,
    serviceName,
    endpointName,
    removedBindingNames: staleNames,
    secretValuesExcluded: true,
  };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const contract = verifyFirebaseDeployedFunctionSecretContract();
    const reconciliation = isProtectedProductionSecretReconciliationContext()
      ? reconcileRetiredPayslipSecretBindings()
      : {
          status: 'passed',
          action: 'skipped-outside-protected-production-deploy',
          secretValuesExcluded: true,
        };
    console.log(JSON.stringify({ ...contract, staleBindingReconciliation: reconciliation }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Firebase Function secret contract verification failed.';
    console.error(message);
    process.exit(1);
  }
}
