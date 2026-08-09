#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'bin-group-57c60';
const SECRET_NAMES = Object.freeze([
  'BROKER_PAYOUT_OTP_PEPPER',
  'OWNER_CONTRACT_OTP_PEPPER',
]);
const MINIMUM_VALUE_LENGTH = 32;
const OUTPUT_PATH = path.resolve('launch_package/otp-pepper-secret-access-repair.json');

const text = (value) => String(value ?? '').trim();

function safeGcloudFailureCode(result) {
  const output = text(`${result?.stderr || ''}\n${result?.stdout || ''}`).toLowerCase();
  if (/permission[_ -]?denied|forbidden|not authorized|access denied|\b403\b/.test(output)) {
    return 'PERMISSION_DENIED';
  }
  if (/not[_ -]?found|does not exist|could not find|\b404\b/.test(output)) {
    return 'NOT_FOUND';
  }
  return 'UNAVAILABLE';
}

function runGcloud(args, { env = process.env } = {}) {
  return spawnSync('gcloud', args, {
    encoding: 'utf8',
    env,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function requireProtectedContext(env) {
  if (text(env.GITHUB_ACTIONS) !== 'true') throw new Error('GITHUB_ACTIONS_REQUIRED');
  if (text(env.DEPLOYMENT_ENVIRONMENT) !== 'production') throw new Error('PRODUCTION_ENVIRONMENT_REQUIRED');
  if (text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT) !== PROJECT_ID) {
    throw new Error('PRODUCTION_PROJECT_REQUIRED');
  }
  const expectedSha = text(env.EXPECTED_COMMIT_SHA);
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXACT_MAIN_SHA_REQUIRED');
  if (text(env.CHECKED_OUT_COMMIT_SHA) !== expectedSha) throw new Error('CHECKOUT_SHA_MISMATCH');
  const serviceAccount = text(env.DEPLOYMENT_SERVICE_ACCOUNT);
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(serviceAccount)) {
    throw new Error('DEPLOYMENT_SERVICE_ACCOUNT_REQUIRED');
  }
  return { expectedSha, serviceAccount };
}

export function repairOtpPepperSecretAccess({ env = process.env, gcloud = runGcloud } = {}) {
  const { expectedSha, serviceAccount } = requireProtectedContext(env);
  const verifiedSecretNames = [];

  for (const secretName of SECRET_NAMES) {
    const binding = gcloud([
      'secrets',
      'add-iam-policy-binding',
      secretName,
      `--member=serviceAccount:${serviceAccount}`,
      '--role=roles/secretmanager.secretAccessor',
      '--project',
      PROJECT_ID,
      '--quiet',
    ], { env });
    if (binding.status !== 0) {
      throw new Error(`SECRET_ACCESS_BINDING_${safeGcloudFailureCode(binding)}`);
    }

    // Read only into the subprocess pipe. The payload is never persisted,
    // printed, or included in the report; only its safe length is checked.
    const access = gcloud([
      'secrets',
      'versions',
      'access',
      'latest',
      '--secret',
      secretName,
      '--project',
      PROJECT_ID,
      '--quiet',
    ], { env });
    if (access.status !== 0) {
      throw new Error(`SECRET_ACCESS_VERIFY_${safeGcloudFailureCode(access)}`);
    }
    if (Buffer.byteLength(String(access.stdout || ''), 'utf8') < MINIMUM_VALUE_LENGTH) {
      throw new Error('SECRET_VALUE_EMPTY_OR_TOO_SHORT');
    }
    verifiedSecretNames.push(secretName);
  }

  return {
    schemaVersion: 1,
    status: 'passed',
    projectId: PROJECT_ID,
    exactCommitSha: expectedSha,
    action: 'ensured-secretmanager-secretaccessor',
    verifiedSecretNames,
    minimumValueLength: MINIMUM_VALUE_LENGTH,
    secretValuesLogged: false,
    secretValuesPersistedToRunnerDisk: false,
    hardLaunchClaim: false,
    verifiedAt: new Date().toISOString(),
  };
}

function writeReport(report) {
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  try {
    const report = repairOtpPepperSecretAccess();
    writeReport(report);
    console.log(`OTP pepper Secret Manager access repair passed for ${report.verifiedSecretNames.length} protected names; secret values were not logged.`);
  } catch (error) {
    const failureCode = error instanceof Error ? text(error.message) : 'UNKNOWN_FAILURE';
    writeReport({
      schemaVersion: 1,
      status: 'failed',
      projectId: PROJECT_ID,
      failureCode,
      secretValuesLogged: false,
      secretValuesPersistedToRunnerDisk: false,
      hardLaunchClaim: false,
      failedAt: new Date().toISOString(),
    });
    console.error(`OTP pepper Secret Manager access repair failed: ${failureCode}`);
    process.exit(1);
  }
}
