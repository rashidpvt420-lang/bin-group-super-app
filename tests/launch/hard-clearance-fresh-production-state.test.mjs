#!/usr/bin/env node

import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  HARD_CLEARANCE_PRODUCTION_STATE_MAX_AGE_MS,
  buildHardClearanceProductionState,
  sha256Text,
  validateHardClearanceProductionState,
} from '../../scripts/lib/hard-clearance-production-state.mjs';
import { generateHardClearanceProductionState } from '../../scripts/generate-hard-clearance-production-state.mjs';
import {
  buildFirebasePhoneAuthEvidence,
  validateFirebasePhoneAuthEvidence,
} from '../../scripts/verify-firebase-phone-auth-production.mjs';
import { buildAdminMfaEvidence } from '../../scripts/verify-admin-mfa-production.mjs';
import { buildHostedClientConfigEvidence } from '../../scripts/verify-hosted-client-config.mjs';

const SHA = '1'.repeat(40);
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const REF = 'refs/heads/main';
const DEPLOY_RUN_ID = '600';
const DEPLOY_RUN_ATTEMPT = 2;
const CLEARANCE_RUN_ID = '672';
const CLEARANCE_RUN_ATTEMPT = 1;
const NOW = new Date('2026-09-11T08:00:00.000Z');

const readSource = (relativePath) =>
  readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

function adminMfaSummary() {
  return {
    claimedAdminCount: 1,
    missingAdminProfileCount: 0,
    disabledAdminCount: 0,
    inactiveProfileAdminCount: 0,
    activeAdminCount: 1,
    activeAdminEmailUnverifiedCount: 0,
    phoneMfaEnrolledCount: 1,
    missingPhoneFactorCount: 0,
    unsupportedOnlyFactorCount: 0,
    canonicalFounderCandidateCount: 1,
    canonicalFounderMfaReadyCount: 1,
    canonicalFounderEmailUnverifiedCount: 0,
    canonicalFounderMissingPhoneFactorCount: 0,
    unexpectedPrivilegedAccountCount: 0,
    canonicalFounderCeoCount: 1,
    canonicalFounderSuperAdminCount: 0,
    founderSingletonReady: true,
    allActiveAdminsEmailVerified: true,
    allActiveAdminsPhoneMfaReady: true,
    recoveryApproverCandidateCount: 1,
    recoveryApproverMfaReadyCount: 1,
    recoveryApproverEmailUnverifiedCount: 0,
    recoveryApproverMissingPhoneFactorCount: 0,
    recoveryCeoCount: 1,
    recoverySuperAdminCount: 0,
    recoveryQuorumReady: true,
  };
}

function hostedSummaries() {
  const main = {
    assetCount: 8,
    projectIdMatched: true,
    authDomainMatched: true,
    storageBucketMatched: true,
    firebaseApiKeyMatched: true,
    firebaseAppIdMatched: true,
    messagingSenderIdMatched: true,
    appCheckSiteKeyMatched: true,
    mapsApiKeyMatched: true,
    vapidKeyMatched: true,
    allRequiredMatched: true,
  };
  return {
    main,
    admin: {
      assetCount: 3,
      projectIdMatched: true,
      authDomainMatched: true,
      storageBucketMatched: true,
      firebaseApiKeyMatched: true,
      firebaseAppIdMatched: true,
      messagingSenderIdMatched: true,
      appCheckSiteKeyMatched: true,
      allRequiredMatched: true,
    },
  };
}

function phoneSummary() {
  return {
    projectId: 'bin-group-57c60',
    phoneProviderEnabled: true,
    mfaState: 'ENABLED',
    mfaEnabled: true,
    requiredDomainsPresent: true,
    authorizedDomainCount: 8,
    smsPolicy: 'allowlist-only',
    requiredSmsRegion: 'AE',
    requiredSmsRegionAllowed: true,
    allowedRegionCount: 1,
    testPhoneNumberCount: 0,
  };
}

function deploymentEnv() {
  return {
    GITHUB_SHA: SHA,
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: REF,
    GITHUB_RUN_ID: DEPLOY_RUN_ID,
    GITHUB_RUN_ATTEMPT: String(DEPLOY_RUN_ATTEMPT),
  };
}

function clearanceEnv() {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SHA: SHA,
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: REF,
    GITHUB_WORKFLOW: 'Live Role Smoke Tests',
    GITHUB_JOB: 'hard-clearance-production-state',
    GITHUB_RUN_ID: CLEARANCE_RUN_ID,
    GITHUB_RUN_ATTEMPT: String(CLEARANCE_RUN_ATTEMPT),
    HARD_LAUNCH_EXPECTED_SHA: SHA,
    DEPLOYMENT_ENVIRONMENT: 'production',
  };
}

function deploymentDocument({ oldEvidenceAt = NOW } = {}) {
  const env = deploymentEnv();
  return {
    status: 'passed',
    projectId: 'bin-group-57c60',
    mainUrl: 'https://bin-group-57c60.web.app',
    adminUrl: 'https://bin-group-admin-panel.web.app',
    deployedCommitSha: SHA,
    deployedAt: new Date(NOW.getTime() - 25 * 60 * 60 * 1000).toISOString(),
    workflowRunId: DEPLOY_RUN_ID,
    workflowRunAttempt: DEPLOY_RUN_ATTEMPT,
    workflowRef: REF,
    repository: REPOSITORY,
    source: 'firebase-production-deploy-workflow',
    httpChecksOk: true,
    bundleVerified: true,
    hardLaunchClaim: false,
    firebasePhoneAuth: buildFirebasePhoneAuthEvidence(phoneSummary(), { env, now: oldEvidenceAt }),
    adminMfa: buildAdminMfaEvidence(adminMfaSummary(), { env, now: oldEvidenceAt }),
    clientRuntimeConfig: buildHostedClientConfigEvidence(hostedSummaries(), { env, now: oldEvidenceAt }),
  };
}

function freshEvidence() {
  const env = deploymentEnv();
  return {
    firebasePhoneAuth: buildFirebasePhoneAuthEvidence(phoneSummary(), { env, now: NOW }),
    adminMfa: buildAdminMfaEvidence(adminMfaSummary(), { env, now: NOW }),
    hostedClientConfig: buildHostedClientConfigEvidence(hostedSummaries(), { env, now: NOW }),
  };
}

function fixture() {
  const oldAt = new Date(NOW.getTime() - 25 * 60 * 60 * 1000);
  const deploymentDoc = deploymentDocument({ oldEvidenceAt: oldAt });
  const deploymentRaw = `${JSON.stringify(deploymentDoc, null, 2)}\n`;
  const evidence = freshEvidence();
  const state = buildHardClearanceProductionState({
    deploymentDoc,
    originalDeploymentDigest: sha256Text(deploymentRaw),
    ...evidence,
    mailboxResult: {
      ok: true,
      mailboxesVerified: 2,
      peppersVerified: 2,
      sentinelFullMessagesVerified: 2,
      secretValuesLogged: false,
    },
    env: clearanceEnv(),
    now: NOW,
  });
  const context = {
    expectedReleaseSha: SHA,
    repository: REPOSITORY,
    ref: REF,
    workflowName: 'Live Role Smoke Tests',
    workflowRunId: CLEARANCE_RUN_ID,
    workflowRunAttempt: CLEARANCE_RUN_ATTEMPT,
    deploymentDoc,
    originalDeploymentDigest: sha256Text(deploymentRaw),
    now: NOW.getTime(),
  };
  return { deploymentDoc, deploymentRaw, state, context, evidence };
}

test('fresh hard-clearance state resolves the 24-hour contradiction without extending old evidence age', () => {
  const { deploymentDoc, state, context } = fixture();
  const oldFailures = validateFirebasePhoneAuthEvidence(deploymentDoc.firebasePhoneAuth, {
    commitSha: SHA,
    repository: REPOSITORY,
    ref: REF,
    workflowRunId: DEPLOY_RUN_ID,
    workflowRunAttempt: DEPLOY_RUN_ATTEMPT,
    now: NOW.getTime(),
  });
  assert.match(oldFailures.join('\n'), /verifiedAt is stale/);
  assert.deepEqual(validateHardClearanceProductionState(state, context), []);
});

test('fresh state is rejected after its short hard-clearance window', () => {
  const { state, context } = fixture();
  const failures = validateHardClearanceProductionState(state, {
    ...context,
    now: NOW.getTime() + HARD_CLEARANCE_PRODUCTION_STATE_MAX_AGE_MS + 1,
  });
  assert.match(failures.join('\n'), /stale/);
});

test('fresh state fails closed on release SHA, workflow run, and original deployment digest tampering', () => {
  const { state, context } = fixture();
  const tampered = structuredClone(state);
  tampered.releaseCommitSha = '2'.repeat(40);
  tampered.workflowRunId = '999';
  tampered.originalDeploymentDigest = 'f'.repeat(64);
  const failures = validateHardClearanceProductionState(tampered, context).join('\n');
  assert.match(failures, /releaseCommitSha mismatch/);
  assert.match(failures, /workflowRunId mismatch/);
  assert.match(failures, /originalDeploymentDigest mismatch/);
});

test('fresh state requires both protected mailboxes and never accepts credential material', () => {
  const { state, context } = fixture();
  const incomplete = structuredClone(state);
  incomplete.mailboxAccess.mailboxesVerified = 1;
  incomplete.oauth = { refreshToken: 'must-not-survive' };
  const failures = validateHardClearanceProductionState(incomplete, context).join('\n');
  assert.match(failures, /mailbox count mismatch/);
  assert.match(failures, /must not contain sensitive field .*refreshToken/);

  const serialized = JSON.stringify(state).toLowerCase();
  for (const forbidden of ['accessToken', 'clientSecret', 'refreshToken', 'password']) {
    assert.equal(
      serialized.includes(`"${forbidden.toLowerCase()}"`),
      false,
      `fresh state must not contain sensitive field ${forbidden}`,
    );
  }
});

test('state generation restores immutable deployment provenance byte-for-byte on failure', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hard-clearance-state-'));
  try {
    const launchDir = path.join(root, 'launch_package');
    mkdirSync(launchDir, { recursive: true });
    const deploymentPath = path.join(launchDir, 'production-deployment.json');
    const deploymentRaw = `${JSON.stringify(deploymentDocument(), null, 4)}\n`;
    writeFileSync(deploymentPath, deploymentRaw);
    const evidence = freshEvidence();

    await assert.rejects(
      generateHardClearanceProductionState({
        root,
        env: clearanceEnv(),
        now: NOW,
        currentCommitSha: SHA,
        deploymentPath,
        statePath: path.join(launchDir, 'state.json'),
        verifyPhoneAuth: async () => evidence.firebasePhoneAuth,
        verifyAdminMfa: async () => evidence.adminMfa,
        verifyMailboxes: async () => ({
          ok: true,
          mailboxesVerified: 2,
          peppersVerified: 2,
          sentinelFullMessagesVerified: 2,
          secretValuesLogged: false,
        }),
        verifyDeployment: () => {
          throw new Error('simulated hosted verification failure');
        },
      }),
      /simulated hosted verification failure/,
    );
    assert.equal(readFileSync(deploymentPath, 'utf8'), deploymentRaw);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('state generation writes only fresh aggregate evidence and keeps source deployment immutable', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hard-clearance-state-pass-'));
  try {
    const launchDir = path.join(root, 'launch_package');
    mkdirSync(launchDir, { recursive: true });
    const deploymentPath = path.join(launchDir, 'production-deployment.json');
    const statePath = path.join(launchDir, 'hard-clearance-production-state.json');
    const deploymentRaw = `${JSON.stringify(deploymentDocument(), null, 4)}\n`;
    writeFileSync(deploymentPath, deploymentRaw);
    const evidence = freshEvidence();

    const state = await generateHardClearanceProductionState({
      root,
      env: clearanceEnv(),
      now: NOW,
      currentCommitSha: SHA,
      deploymentPath,
      statePath,
      verifyPhoneAuth: async () => evidence.firebasePhoneAuth,
      verifyAdminMfa: async () => evidence.adminMfa,
      verifyMailboxes: async () => ({
        ok: true,
        mailboxesVerified: 2,
        peppersVerified: 2,
        sentinelFullMessagesVerified: 2,
        secretValuesLogged: false,
      }),
      verifyDeployment: () => {
        const staged = JSON.parse(readFileSync(deploymentPath, 'utf8'));
        staged.clientRuntimeConfig = evidence.hostedClientConfig;
        writeFileSync(deploymentPath, `${JSON.stringify(staged, null, 2)}\n`);
      },
    });

    assert.equal(readFileSync(deploymentPath, 'utf8'), deploymentRaw);
    assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), state);
    assert.equal(state.sourceDeployment.workflowRunId, DEPLOY_RUN_ID);
    assert.equal(state.workflowRunId, CLEARANCE_RUN_ID);
    assert.equal(state.mailboxAccess.mailboxesVerified, 2);
    assert.doesNotMatch(JSON.stringify(state), /refreshToken|clientSecret|accessToken|password/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workflow refreshes mutable state under production and consumes it under hard-public-launch', async () => {
  const workflow = await readSource('.github/workflows/live-role-smoke.yml');
  const producerStart = workflow.indexOf('  hard-clearance-production-state:');
  const consumerStart = workflow.indexOf('  hard-public-launch-clearance:');
  assert.ok(producerStart > 0 && consumerStart > producerStart);
  const producer = workflow.slice(producerStart, consumerStart);
  const consumer = workflow.slice(consumerStart);

  assert.match(producer, /environment: production/);
  assert.match(producer, /generate-hard-clearance-production-state\.mjs/);
  assert.match(producer, /E2E_OWNER_MAILBOX_CLIENT_ID: \$\{\{ secrets\.E2E_OWNER_MAILBOX_CLIENT_ID \}\}/);
  assert.match(producer, /E2E_BROKER_MAILBOX_REFRESH_TOKEN: \$\{\{ secrets\.E2E_BROKER_MAILBOX_REFRESH_TOKEN \}\}/);
  assert.match(consumer, /environment: hard-public-launch/);
  assert.match(consumer, /needs: hard-clearance-production-state/);
  assert.match(consumer, /verify-hard-clearance-production-state\.mjs/);
  assert.match(consumer, /HARD_CLEARANCE_PRODUCTION_STATE_PATH: launch_package\/hard-clearance-production-state\.json/);
  assert.doesNotMatch(consumer, /^\s{10}E2E_OWNER_MAILBOX_CLIENT_ID:/m);
  assert.doesNotMatch(consumer, /^\s{10}E2E_BROKER_MAILBOX_REFRESH_TOKEN:/m);
});

test('launch status replaces secret-dependent hard-environment checks with verified fresh state', async () => {
  const source = await readSource('scripts/launch-status.mjs');
  assert.match(source, /HARD_CLEARANCE_PRODUCTION_STATE_PATH/);
  assert.match(source, /freshHardClearanceProductionState/);
  assert.match(source, /verify-hard-clearance-production-state\.mjs/);
  assert.match(source, /: \[\s*\{ name: 'e2eEnv'/s);
  assert.match(source, /\{ name: 'appCheckEnsure'/);
});

test('deployment verifier consumes fresh state read-only and preserves the original 24-hour validators', async () => {
  const verifier = await readSource('scripts/verify-production-deployment.mjs');
  assert.match(verifier, /validateHardClearanceProductionState/);
  assert.match(verifier, /hardClearanceState\?\.firebasePhoneAuth/);
  assert.match(verifier, /hardClearanceState\?\.adminMfa/);
  assert.match(verifier, /hardClearanceState\?\.hostedClientConfig/);
  assert.match(verifier, /read-only and cannot rewrite deployment provenance/);

  for (const sourcePath of [
    'scripts/verify-firebase-phone-auth-production.mjs',
    'scripts/verify-admin-mfa-production.mjs',
    'scripts/verify-hosted-client-config.mjs',
  ]) {
    const source = await readSource(sourcePath);
    assert.match(source, /EVIDENCE_MAX_AGE_MS = 1000 \* 60 \* 60 \* 24/);
  }
});
