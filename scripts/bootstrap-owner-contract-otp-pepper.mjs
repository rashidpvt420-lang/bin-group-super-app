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

export function isValidPepper(value) {
  return text(value).length >= MINIMUM_LENGTH;
}

export function classifyAccessFailure(output) {
  const safe = text(output).toLowerCase();
  if (/permission[_ -]?denied|forbidden|unauthenticated|not authorized|access denied|\b403\b/.test(safe)) {
    return 'inaccessible';
  }
  if (
    /not[_ -]?found|does not exist|could not find|\b404\b|does not have any versions|no (?:enabled )?versions|versions\/latest.*not found|secret version.*not found/.test(safe)
  ) {
    return 'missing';
  }
  return 'inaccessible';
}

export function chooseBootstrapAction({ secretExists, accessStatus, currentValue }) {
  if (accessStatus === 'inaccessible') return 'fail-inaccessible';
  if (accessStatus === 'available' && isValidPepper(currentValue)) return 'unchanged';
  if (!secretExists) return 'created';
  if (accessStatus === 'available') return 'rotated-invalid-value';
  return 'added-missing-version';
}

function gcloudCommand(args, { env = process.env, input } = {}) {
  return spawnSync('gcloud', args, {
    encoding: 'utf8',
    env,
    input,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function describeSecret({ env = process.env } = {}) {
  const result = gcloudCommand([
    'secrets',
    'describe',
    SECRET_NAME,
    '--project',
    PROJECT_ID,
    '--format=json',
    '--quiet',
  ], { env });

  if (result.status === 0) return 'available';
  return classifyAccessFailure(`${result.stderr || ''}\n${result.stdout || ''}`);
}

function accessSecret({ env = process.env } = {}) {
  const result = gcloudCommand([
    'secrets',
    'versions',
    'access',
    'latest',
    '--secret',
    SECRET_NAME,
    '--project',
    PROJECT_ID,
    '--quiet',
  ], { env });

  if (result.status === 0) {
    return { status: 'available', value: text(result.stdout) };
  }

  return {
    status: classifyAccessFailure(`${result.stderr || ''}\n${result.stdout || ''}`),
    value: '',
  };
}

function createSecret(secretValue, { env = process.env } = {}) {
  const result = gcloudCommand([
    'secrets',
    'create',
    SECRET_NAME,
    '--replication-policy=automatic',
    '--data-file=-',
    '--project',
    PROJECT_ID,
    '--quiet',
  ], { env, input: secretValue });

  if (result.status !== 0) throw new Error('SECRET_CREATE_FAILED');
}

function addSecretVersion(secretValue, { env = process.env } = {}) {
  const result = gcloudCommand([
    'secrets',
    'versions',
    'add',
    SECRET_NAME,
    '--data-file=-',
    '--project',
    PROJECT_ID,
    '--quiet',
  ], { env, input: secretValue });

  if (result.status !== 0) throw new Error('SECRET_VERSION_ADD_FAILED');
}

function writeReport(report) {
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

function requireProtectedContext(env) {
  if (text(env.GITHUB_ACTIONS) !== 'true') throw new Error('GITHUB_ACTIONS_REQUIRED');
  if (text(env.DEPLOYMENT_ENVIRONMENT) !== 'production') throw new Error('PRODUCTION_ENVIRONMENT_REQUIRED');
  if (text(env.GCP_PROJECT_ID || env.GCLOUD_PROJECT || env.GOOGLE_CLOUD_PROJECT) !== PROJECT_ID) {
    throw new Error('PRODUCTION_PROJECT_REQUIRED');
  }
  const expectedSha = text(env.EXPECTED_COMMIT_SHA);
  if (!/^[0-9a-f]{40}$/.test(expectedSha)) throw new Error('EXACT_MAIN_SHA_REQUIRED');
  const checkedOutSha = text(env.CHECKED_OUT_COMMIT_SHA);
  if (checkedOutSha !== expectedSha) throw new Error('CHECKOUT_SHA_MISMATCH');
  return expectedSha;
}

export async function bootstrapOwnerContractOtpPepper({ env = process.env } = {}) {
  const startedAt = new Date().toISOString();
  const expectedSha = requireProtectedContext(env);
  let action = 'none';
  let previousState = 'unknown';

  try {
    const describedState = describeSecret({ env });
    const secretExists = describedState === 'available';
    previousState = describedState;

    let existing = { status: describedState, value: '' };
    if (secretExists) {
      existing = accessSecret({ env });
      previousState = existing.status;
    }

    action = chooseBootstrapAction({
      secretExists,
      accessStatus: existing.status,
      currentValue: existing.value,
    });

    if (action === 'fail-inaccessible') {
      throw new Error('SECRET_ACCESS_DENIED_OR_UNAVAILABLE');
    }

    if (action !== 'unchanged') {
      const generated = randomBytes(48).toString('base64url');
      if (!isValidPepper(generated)) throw new Error('GENERATED_SECRET_TOO_SHORT');

      if (action === 'created') createSecret(generated, { env });
      else addSecretVersion(generated, { env });

      const verified = accessSecret({ env });
      if (verified.status !== 'available' || verified.value !== generated || !isValidPepper(verified.value)) {
        throw new Error('SECRET_WRITE_VERIFICATION_FAILED');
      }
    }

    const report = {
      schemaVersion: 1,
      status: 'passed',
      projectId: PROJECT_ID,
      secretName: SECRET_NAME,
      action,
      previousState,
      minimumLengthSatisfied: true,
      exactCommitSha: expectedSha,
      workflowRunId: text(env.GITHUB_RUN_ID) || null,
      workflowRunAttempt: text(env.GITHUB_RUN_ATTEMPT) || null,
      githubRepository: text(env.GITHUB_REPOSITORY) || null,
      githubRef: 'refs/heads/main',
      protectedEnvironment: 'production',
      secretTransport: 'stdin',
      secretPersistedToRunnerDisk: false,
      secretValueLogged: false,
      hardLaunchClaim: false,
      startedAt,
      verifiedAt: new Date().toISOString(),
    };
    writeReport(report);
    return report;
  } catch (error) {
    const report = {
      schemaVersion: 1,
      status: 'failed',
      projectId: PROJECT_ID,
      secretName: SECRET_NAME,
      action,
      previousState,
      failureCode: error instanceof Error ? error.message : 'UNKNOWN_FAILURE',
      exactCommitSha: text(env.EXPECTED_COMMIT_SHA) || null,
      workflowRunId: text(env.GITHUB_RUN_ID) || null,
      githubRepository: text(env.GITHUB_REPOSITORY) || null,
      protectedEnvironment: text(env.DEPLOYMENT_ENVIRONMENT) || null,
      secretTransport: 'stdin',
      secretPersistedToRunnerDisk: false,
      secretValueLogged: false,
      hardLaunchClaim: false,
      startedAt,
      failedAt: new Date().toISOString(),
    };
    writeReport(report);
    throw error;
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  bootstrapOwnerContractOtpPepper()
    .then((report) => {
      console.log(`Owner contract OTP pepper bootstrap ${report.status}; action=${report.action}; secret value was not logged.`);
    })
    .catch((error) => {
      console.error(`Owner contract OTP pepper bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
