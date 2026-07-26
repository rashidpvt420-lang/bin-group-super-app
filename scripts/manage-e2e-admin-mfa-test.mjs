#!/usr/bin/env node

import admin from 'firebase-admin';
import { randomInt } from 'node:crypto';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { CANONICAL_FOUNDER_EMAIL, claimsGrantAdminPortal } from './verify-admin-mfa-production.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const PROTECTED_WORKFLOWS = new Map([
  ['Firebase Production Deploy', new Set(['deploy-firebase-production-stack', 'public-release-clearance'])],
  ['Live Role Smoke Tests', new Set(['live-evidence'])],
  ['Live Business Failure Diagnostics', new Set(['diagnose-live-business-failures'])],
]);
const RUNTIME_PATH = path.resolve(process.cwd(), process.env.E2E_ADMIN_MFA_RUNTIME_PATH || '.e2e-admin-mfa-runtime.json');
const DISPLAY_NAME = 'BIN GROUP protected E2E phone';
const CONFIG_CONFIRM_ATTEMPTS = 15;
const CONFIG_CONFIRM_INTERVAL_MS = 2_000;

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function argValue(name) {
  const exact = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3).trim();
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? text(process.argv[index + 1]) : '';
}

function requireProtectedContext(env = process.env) {
  const projectId = resolveFirebaseAdminProjectId();
  const workflow = text(env.GITHUB_WORKFLOW);
  const job = text(env.GITHUB_JOB);
  const repository = text(env.GITHUB_REPOSITORY);
  const deploymentEnvironment = text(env.DEPLOYMENT_ENVIRONMENT);
  const allowedJobs = PROTECTED_WORKFLOWS.get(workflow);

  if (projectId !== EXPECTED_PROJECT_ID) throw new Error(`GCP project must equal ${EXPECTED_PROJECT_ID}.`);
  if (repository !== EXPECTED_REPOSITORY) throw new Error(`Repository must equal ${EXPECTED_REPOSITORY}.`);
  if (env.GITHUB_ACTIONS !== 'true' || deploymentEnvironment !== 'production') {
    throw new Error('E2E Admin MFA test-factor changes require a protected production GitHub Actions job.');
  }
  if (!allowedJobs || !allowedJobs.has(job)) throw new Error(`Unsupported protected workflow/job: ${workflow || '(blank)'}/${job || '(blank)'}.`);
  if (env.GITHUB_REF !== 'refs/heads/main' || !/^[0-9a-f]{40}$/.test(text(env.GITHUB_SHA))) {
    throw new Error('E2E Admin MFA setup requires exact main SHA context.');
  }
  if (!['workflow_dispatch', 'pull_request'].includes(text(env.GITHUB_EVENT_NAME))) {
    throw new Error('E2E Admin MFA setup requires an approved workflow dispatch or protected diagnostic run.');
  }

  return { projectId, workflow, job, evidenceSha: text(env.GITHUB_SHA) };
}

function runtimeFromDisk() {
  if (!existsSync(RUNTIME_PATH)) return null;
  const parsed = JSON.parse(readFileSync(RUNTIME_PATH, 'utf8'));
  if (!/^\+1650555\d{4}$/.test(text(parsed.phoneNumber)) || !/^\d{6}$/.test(text(parsed.verificationCode))) {
    throw new Error('E2E Admin MFA runtime file is malformed.');
  }
  return parsed;
}

function createRuntime(context) {
  const suffix = String(Number(text(process.env.GITHUB_RUN_ID).slice(-4) || randomInt(0, 10_000))).padStart(4, '0');
  const runtime = {
    schemaVersion: 1,
    phoneNumber: `+1650555${suffix}`,
    verificationCode: String(randomInt(100_000, 1_000_000)),
    projectId: context.projectId,
    repository: EXPECTED_REPOSITORY,
    workflow: context.workflow,
    job: context.job,
    evidenceSha: context.evidenceSha,
    workflowRunId: text(process.env.GITHUB_RUN_ID),
    createdAt: new Date().toISOString(),
    sensitiveValuesExcludedFromLogs: true,
    hardLaunchClaim: false,
  };
  writeFileSync(RUNTIME_PATH, `${JSON.stringify(runtime, null, 2)}\n`, { mode: 0o600 });
  return runtime;
}

async function accessToken() {
  const credential = admin.credential.applicationDefault();
  const token = await credential.getAccessToken();
  if (!token?.access_token) throw new Error('Could not obtain Identity Platform admin access token.');
  return token.access_token;
}

async function fetchConfig(projectId, token) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Identity Platform config read failed with HTTP ${response.status}.`);
  return response.json();
}

async function updateTestPhoneNumbers(projectId, token, testPhoneNumbers) {
  const endpoint = new URL(`https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`);
  endpoint.searchParams.set('updateMask', 'signIn.phoneNumber.testPhoneNumbers');
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `projects/${projectId}/config`,
      signIn: { phoneNumber: { testPhoneNumbers } },
    }),
  });
  if (!response.ok) throw new Error(`Identity Platform test-phone update failed with HTTP ${response.status}.`);
}

async function confirmTestPhoneConfig(projectId, token, phoneNumber, expectedCode) {
  for (let attempt = 1; attempt <= CONFIG_CONFIRM_ATTEMPTS; attempt += 1) {
    const config = await fetchConfig(projectId, token);
    if (text(config?.signIn?.phoneNumber?.testPhoneNumbers?.[phoneNumber]) === expectedCode) return;
    if (attempt < CONFIG_CONFIRM_ATTEMPTS) await wait(CONFIG_CONFIRM_INTERVAL_MS);
  }
  throw new Error('Identity Platform did not confirm the protected fictional phone configuration in time.');
}

async function confirmTestPhoneRemoved(projectId, token, phoneNumber) {
  for (let attempt = 1; attempt <= CONFIG_CONFIRM_ATTEMPTS; attempt += 1) {
    const config = await fetchConfig(projectId, token);
    if (!text(config?.signIn?.phoneNumber?.testPhoneNumbers?.[phoneNumber])) return;
    if (attempt < CONFIG_CONFIRM_ATTEMPTS) await wait(CONFIG_CONFIRM_INTERVAL_MS);
  }
  throw new Error('Identity Platform did not confirm removal of the protected fictional phone configuration in time.');
}

function validateEphemeralAdmin(user, configuredEmail) {
  const claims = user.customClaims || {};
  const expectedEmail = lower(configuredEmail);
  if (!user.uid || lower(user.email) !== expectedEmail) throw new Error('E2E Admin Auth identity does not match E2E_ADMIN_EMAIL.');
  if (expectedEmail === CANONICAL_FOUNDER_EMAIL) throw new Error('Canonical Founder protection refused E2E MFA provisioning.');
  if (claims.testAccount !== true || lower(claims.role) !== 'admin' || claims.admin !== true || !claimsGrantAdminPortal(claims)) {
    throw new Error('E2E Admin lacks exact testAccount/admin claims.');
  }
}

async function prepare() {
  const context = requireProtectedContext();
  const configuredEmail = lower(process.env.E2E_ADMIN_EMAIL);
  if (!configuredEmail || !configuredEmail.includes('@')) throw new Error('E2E_ADMIN_EMAIL is required.');

  initializeFirebaseAdmin(admin, context.projectId);
  const auth = admin.auth();
  const user = await auth.getUserByEmail(configuredEmail);
  validateEphemeralAdmin(user, configuredEmail);

  const runtime = runtimeFromDisk() || createRuntime(context);
  const token = await accessToken();
  const config = await fetchConfig(context.projectId, token);
  const existing = { ...(config?.signIn?.phoneNumber?.testPhoneNumbers || {}) };
  const existingCode = text(existing[runtime.phoneNumber]);
  if (existingCode && existingCode !== runtime.verificationCode) {
    throw new Error('Generated E2E phone already exists with a different code; refusing overwrite.');
  }
  existing[runtime.phoneNumber] = runtime.verificationCode;
  await updateTestPhoneNumbers(context.projectId, token, existing);
  await confirmTestPhoneConfig(context.projectId, token, runtime.phoneNumber, runtime.verificationCode);

  const updated = await auth.updateUser(user.uid, {
    multiFactor: {
      enrolledFactors: [{ phoneNumber: runtime.phoneNumber, displayName: DISPLAY_NAME, factorId: 'phone' }],
    },
  });
  const enrolled = (updated.multiFactor?.enrolledFactors || []).some(
    (factor) => factor.factorId === 'phone' && factor.phoneNumber === runtime.phoneNumber,
  );
  if (!enrolled) throw new Error('Firebase did not persist the E2E Admin phone MFA factor.');

  console.log(`[e2e-admin-mfa] prepared protected factor phone=+1650555•••• sha=${context.evidenceSha.slice(0, 8)}`);
  console.log('[e2e-admin-mfa] configConfirmed=true sensitiveValuesExcluded=true hardLaunchClaim=false');
}

async function cleanup() {
  const context = requireProtectedContext();
  const runtime = runtimeFromDisk();
  if (!runtime) {
    console.log('[e2e-admin-mfa] cleanup status=absent');
    return;
  }

  initializeFirebaseAdmin(admin, context.projectId);
  const token = await accessToken();
  const config = await fetchConfig(context.projectId, token);
  const existing = { ...(config?.signIn?.phoneNumber?.testPhoneNumbers || {}) };
  delete existing[runtime.phoneNumber];
  await updateTestPhoneNumbers(context.projectId, token, existing);
  await confirmTestPhoneRemoved(context.projectId, token, runtime.phoneNumber);

  const configuredEmail = lower(process.env.E2E_ADMIN_EMAIL);
  if (configuredEmail) {
    const user = await admin.auth().getUserByEmail(configuredEmail);
    validateEphemeralAdmin(user, configuredEmail);
    await admin.auth().updateUser(user.uid, { multiFactor: { enrolledFactors: [] } });
  }
  rmSync(RUNTIME_PATH, { force: true });
  console.log('[e2e-admin-mfa] cleanup status=removed configConfirmed=true sensitiveValuesExcluded=true hardLaunchClaim=false');
}

const invokedPath = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;
if (invokedPath) {
  const mode = argValue('mode') || process.argv[2] || '';
  const operation = mode === 'prepare' ? prepare : mode === 'cleanup' ? cleanup : null;
  if (!operation) {
    console.error('Usage: node scripts/manage-e2e-admin-mfa-test.mjs --mode prepare|cleanup');
    process.exit(1);
  }
  operation().catch((error) => {
    console.error(`[e2e-admin-mfa] REFUSED: ${error instanceof Error ? error.message : 'operation failed'}`);
    process.exit(1);
  });
}

export { cleanup, prepare, requireProtectedContext };
