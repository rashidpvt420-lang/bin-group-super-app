#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = 'bin-group-57c60';
const SECRET_NAME = 'BROKER_PAYOUT_OTP_PEPPER';
const OUTPUT_PATH = path.resolve('launch_package/broker-payout-otp-pepper-bootstrap.json');
const MINIMUM_LENGTH = 32;

const text = (value) => String(value ?? '').trim();

export function isValidPepper(value) {
  return text(value).length >= MINIMUM_LENGTH;
}

export function classifyAccessFailure(output) {
  const safe = text(output).toLowerCase();
  if (/not[_ -]?found|does not exist|could not find|404/.test(safe)) return 'missing';
  return 'inaccessible';
}

function firebaseCommand(args, { env = process.env } = {}) {
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return spawnSync(executable, ['firebase', ...args], {
    encoding: 'utf8',
    env,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function accessSecret({ env = process.env } = {}) {
  const result = firebaseCommand([
    'functions:secrets:access',
    SECRET_NAME,
    '--project',
    PROJECT_ID,
    '--non-interactive',
  ], { env });

  if (result.status === 0) {
    return { status: 'available', value: text(result.stdout) };
  }

  return {
    status: classifyAccessFailure(`${result.stderr || ''}\n${result.stdout || ''}`),
    value: '',
  };
}

function setSecretFromFile(filePath, { env = process.env } = {}) {
  const result = firebaseCommand([
    'functions:secrets:set',
    SECRET_NAME,
    '--data-file',
    filePath,
    '--project',
    PROJECT_ID,
    '--force',
    '--non-interactive',
  ], { env });

  if (result.status !== 0) {
    throw new Error('SECRET_SET_FAILED');
  }
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

export async function bootstrapBrokerPayoutOtpPepper({ env = process.env } = {}) {
  const startedAt = new Date().toISOString();
  const expectedSha = requireProtectedContext(env);
  let action = 'none';
  let previousState = 'unknown';
  let tempDirectory = '';

  try {
    const existing = accessSecret({ env });
    previousState = existing.status;

    if (existing.status === 'available' && isValidPepper(existing.value)) {
      action = 'unchanged';
    } else {
      if (existing.status === 'inaccessible') {
        throw new Error('SECRET_ACCESS_DENIED_OR_UNAVAILABLE');
      }

      action = existing.status === 'available' ? 'rotated-invalid-value' : 'created';
      const generated = randomBytes(48).toString('base64url');
      if (!isValidPepper(generated)) throw new Error('GENERATED_SECRET_TOO_SHORT');

      tempDirectory = mkdtempSync(path.join(tmpdir(), 'bin-group-broker-otp-'));
      chmodSync(tempDirectory, 0o700);
      const secretFile = path.join(tempDirectory, 'secret-value');
      writeFileSync(secretFile, generated, { mode: 0o600, flag: 'wx' });
      setSecretFromFile(secretFile, { env });

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
      secretValueLogged: false,
      hardLaunchClaim: false,
      startedAt,
      failedAt: new Date().toISOString(),
    };
    writeReport(report);
    throw error;
  } finally {
    if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
  }
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  bootstrapBrokerPayoutOtpPepper()
    .then((report) => {
      console.log(`Broker payout OTP pepper bootstrap ${report.status}; action=${report.action}; secret value was not logged.`);
    })
    .catch((error) => {
      console.error(`Broker payout OTP pepper bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    });
}
