#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'bin-group-57c60';
const SECRET_NAME = 'OWNER_CONTRACT_OTP_PEPPER';
const OUTPUT_PATH = path.resolve('launch_package/owner-contract-otp-pepper-bootstrap.json');
const MINIMUM_LENGTH = 32;
const text = (value) => String(value ?? '').trim();

function runGcloud(args, { env = process.env, input } = {}) {
  return spawnSync('gcloud', args, {
    encoding: 'utf8', env, input, maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function classify(output) {
  return /not[_ -]?found|does not exist|could not find|404/i.test(text(output)) ? 'missing' : 'inaccessible';
}

function describe(env) {
  const result = runGcloud(['secrets','describe',SECRET_NAME,'--project',PROJECT_ID,'--format=json','--quiet'], { env });
  return result.status === 0 ? 'available' : classify(`${result.stderr || ''}\n${result.stdout || ''}`);
}

function access(env) {
  const result = runGcloud(['secrets','versions','access','latest','--secret',SECRET_NAME,'--project',PROJECT_ID,'--quiet'], { env });
  return result.status === 0
    ? { status: 'available', value: text(result.stdout) }
    : { status: classify(`${result.stderr || ''}\n${result.stdout || ''}`), value: '' };
}

function create(value, env) {
  const result = runGcloud(['secrets','create',SECRET_NAME,'--replication-policy=automatic','--data-file=-','--project',PROJECT_ID,'--quiet'], { env, input: value });
  if (result.status !== 0) throw new Error('SECRET_CREATE_FAILED');
}

function addVersion(value, env) {
  const result = runGcloud(['secrets','versions','add',SECRET_NAME,'--data-file=-','--project',PROJECT_ID,'--quiet'], { env, input: value });
  if (result.status !== 0) throw new Error('SECRET_VERSION_ADD_FAILED');
}

function report(payload) {
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}

export async function bootstrapOwnerContractOtpPepper({ env = process.env } = {}) {
  const startedAt = new Date().toISOString();
  const expectedSha = text(env.EXPECTED_COMMIT_SHA);
  if (text(env.GITHUB_ACTIONS) !== 'true') throw new Error('GITHUB_ACTIONS_REQUIRED');
  if (text(env.DEPLOYMENT_ENVIRONMENT) !== 'production') throw new Error('PRODUCTION_ENVIRONMENT_REQUIRED');
  if (text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT) !== PROJECT_ID) throw new Error('PRODUCTION_PROJECT_REQUIRED');
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXACT_MAIN_SHA_REQUIRED');
  if (text(env.CHECKED_OUT_COMMIT_SHA) !== expectedSha) throw new Error('CHECKOUT_SHA_MISMATCH');

  let action = 'none';
  let previousState = 'unknown';
  try {
    previousState = describe(env);
    let existing = previousState === 'available' ? access(env) : { status: previousState, value: '' };
    previousState = existing.status;
    if (existing.status === 'available' && existing.value.length >= MINIMUM_LENGTH) {
      action = 'unchanged';
    } else {
      if (existing.status === 'inaccessible') throw new Error('SECRET_ACCESS_DENIED_OR_UNAVAILABLE');
      action = existing.status === 'available' ? 'rotated-invalid-value' : 'created';
      const generated = randomBytes(48).toString('base64url');
      if (generated.length < MINIMUM_LENGTH) throw new Error('GENERATED_SECRET_TOO_SHORT');
      if (action === 'created') create(generated, env); else addVersion(generated, env);
      const verified = access(env);
      if (verified.status !== 'available' || verified.value !== generated || verified.value.length < MINIMUM_LENGTH) throw new Error('SECRET_WRITE_VERIFICATION_FAILED');
    }
    const payload = { schemaVersion: 1, status: 'passed', projectId: PROJECT_ID, secretName: SECRET_NAME, action, previousState, exactCommitSha: expectedSha, workflowRunId: text(env.GITHUB_RUN_ID) || null, protectedEnvironment: 'production', secretTransport: 'stdin', secretPersistedToRunnerDisk: false, secretValueLogged: false, hardLaunchClaim: false, startedAt, verifiedAt: new Date().toISOString() };
    report(payload);
    return payload;
  } catch (error) {
    report({ schemaVersion: 1, status: 'failed', projectId: PROJECT_ID, secretName: SECRET_NAME, action, previousState, failureCode: error instanceof Error ? error.message : 'UNKNOWN_FAILURE', exactCommitSha: expectedSha || null, protectedEnvironment: text(env.DEPLOYMENT_ENVIRONMENT) || null, secretTransport: 'stdin', secretPersistedToRunnerDisk: false, secretValueLogged: false, hardLaunchClaim: false, startedAt, failedAt: new Date().toISOString() });
    throw error;
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  bootstrapOwnerContractOtpPepper()
    .then((result) => console.log(`Owner contract OTP pepper bootstrap ${result.status}; action=${result.action}; secret value was not logged.`))
    .catch((error) => { console.error(`Owner contract OTP pepper bootstrap failed: ${error instanceof Error ? error.message : String(error)}`); process.exit(1); });
}
