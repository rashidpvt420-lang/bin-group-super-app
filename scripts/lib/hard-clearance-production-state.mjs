import { createHash } from 'node:crypto';
import { validateFirebasePhoneAuthEvidence } from '../verify-firebase-phone-auth-production.mjs';
import { validateAdminMfaEvidence } from '../verify-admin-mfa-production.mjs';
import { validateHostedClientConfigEvidence } from '../verify-hosted-client-config.mjs';

const EXPECTED_PROJECT_ID = 'bin-group-57c60';
const EXPECTED_WORKFLOW = 'Live Role Smoke Tests';
const EXPECTED_PRODUCER_JOB = 'hard-clearance-production-state';
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export const HARD_CLEARANCE_PRODUCTION_STATE_SCHEMA = 1;
export const HARD_CLEARANCE_PRODUCTION_STATE_MAX_AGE_MS = 2 * 60 * 60 * 1000;
export const HARD_CLEARANCE_PRODUCTION_STATE_RELATIVE_PATH =
  'launch_package/hard-clearance-production-state.json';

const text = (value) => String(value ?? '').trim();

export function sha256Text(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

function sourceDeploymentOf(deploymentDoc) {
  return {
    workflowRunId: text(deploymentDoc?.workflowRunId) || null,
    workflowRunAttempt: Number(deploymentDoc?.workflowRunAttempt || 0) || null,
    workflowRef: text(deploymentDoc?.workflowRef) || null,
    repository: text(deploymentDoc?.repository) || null,
    deployedAt: text(deploymentDoc?.deployedAt) || null,
  };
}

export function buildHardClearanceProductionState({
  deploymentDoc,
  originalDeploymentDigest,
  firebasePhoneAuth,
  adminMfa,
  hostedClientConfig,
  mailboxResult,
  env = process.env,
  now = new Date(),
} = {}) {
  return {
    schemaVersion: HARD_CLEARANCE_PRODUCTION_STATE_SCHEMA,
    status: 'passed',
    source: 'hard-clearance-live-production-state',
    projectId: EXPECTED_PROJECT_ID,
    releaseCommitSha: text(env.HARD_LAUNCH_EXPECTED_SHA || env.GITHUB_SHA) || null,
    repository: text(env.GITHUB_REPOSITORY) || null,
    ref: text(env.GITHUB_REF) || null,
    workflowName: text(env.GITHUB_WORKFLOW) || null,
    producerJob: text(env.GITHUB_JOB) || null,
    workflowRunId: text(env.GITHUB_RUN_ID) || null,
    workflowRunAttempt: Number(env.GITHUB_RUN_ATTEMPT || 0) || null,
    verifiedAt: now.toISOString(),
    originalDeploymentDigest: text(originalDeploymentDigest) || null,
    sourceDeployment: sourceDeploymentOf(deploymentDoc),
    mailboxAccess: {
      status: mailboxResult?.ok === true ? 'passed' : 'failed',
      mailboxesVerified: Number(mailboxResult?.mailboxesVerified || 0),
      peppersVerified: Number(mailboxResult?.peppersVerified || 0),
      sentinelFullMessagesVerified: Number(mailboxResult?.sentinelFullMessagesVerified || 0),
      secretValuesLogged: mailboxResult?.secretValuesLogged === true,
    },
    firebasePhoneAuth,
    adminMfa,
    hostedClientConfig,
    sensitiveValuesExcluded: true,
    hardLaunchClaim: false,
  };
}

function requireExact(actual, expected, label, failures) {
  if (String(actual ?? '') !== String(expected ?? '')) failures.push(`${label} mismatch.`);
}

function validateFreshTimestamp(value, label, now, failures) {
  const observedAt = Date.parse(text(value));
  if (!Number.isFinite(observedAt)) {
    failures.push(`${label} must be a valid ISO timestamp.`);
    return;
  }
  if (observedAt > now + MAX_CLOCK_SKEW_MS) failures.push(`${label} is in the future.`);
  if (now - observedAt > HARD_CLEARANCE_PRODUCTION_STATE_MAX_AGE_MS) {
    failures.push(`${label} is stale.`);
  }
}

function findForbiddenKeys(value, path = '$', findings = []) {
  if (!value || typeof value !== 'object') return findings;
  const forbidden = new Set([
    'accesstoken',
    'authorization',
    'clientid',
    'clientsecret',
    'email',
    'emails',
    'refreshtoken',
    'password',
    'phonenumber',
    'phonenumbers',
    'verificationcode',
    'smscode',
  ]);
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;
    if (forbidden.has(key.toLowerCase())) findings.push(childPath);
    findForbiddenKeys(child, childPath, findings);
  }
  return findings;
}

export function validateHardClearanceProductionState(state, {
  expectedReleaseSha,
  repository,
  ref,
  workflowName = EXPECTED_WORKFLOW,
  workflowRunId,
  workflowRunAttempt,
  deploymentDoc,
  originalDeploymentDigest,
  now = Date.now(),
} = {}) {
  const failures = [];
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return ['Hard-clearance production state is missing or malformed.'];
  }

  requireExact(
    state.schemaVersion,
    HARD_CLEARANCE_PRODUCTION_STATE_SCHEMA,
    'Hard-clearance state schemaVersion',
    failures,
  );
  requireExact(state.status, 'passed', 'Hard-clearance state status', failures);
  requireExact(
    state.source,
    'hard-clearance-live-production-state',
    'Hard-clearance state source',
    failures,
  );
  requireExact(state.projectId, EXPECTED_PROJECT_ID, 'Hard-clearance state projectId', failures);
  requireExact(
    state.releaseCommitSha,
    expectedReleaseSha,
    'Hard-clearance state releaseCommitSha',
    failures,
  );
  requireExact(state.repository, repository, 'Hard-clearance state repository', failures);
  requireExact(state.ref, ref, 'Hard-clearance state ref', failures);
  requireExact(state.workflowName, workflowName, 'Hard-clearance state workflowName', failures);
  requireExact(state.producerJob, EXPECTED_PRODUCER_JOB, 'Hard-clearance state producerJob', failures);
  requireExact(state.workflowRunId, workflowRunId, 'Hard-clearance state workflowRunId', failures);
  requireExact(
    state.workflowRunAttempt,
    workflowRunAttempt,
    'Hard-clearance state workflowRunAttempt',
    failures,
  );
  requireExact(state.sensitiveValuesExcluded, true, 'Hard-clearance state sensitiveValuesExcluded', failures);
  requireExact(state.hardLaunchClaim, false, 'Hard-clearance state hardLaunchClaim', failures);
  validateFreshTimestamp(state.verifiedAt, 'Hard-clearance state verifiedAt', now, failures);

  if (!/^[0-9a-f]{64}$/.test(text(state.originalDeploymentDigest))) {
    failures.push('Hard-clearance state originalDeploymentDigest must be SHA-256.');
  }
  requireExact(
    state.originalDeploymentDigest,
    originalDeploymentDigest,
    'Hard-clearance state originalDeploymentDigest',
    failures,
  );

  requireExact(deploymentDoc?.projectId, EXPECTED_PROJECT_ID, 'Source deployment projectId', failures);
  requireExact(deploymentDoc?.status, 'passed', 'Source deployment status', failures);
  requireExact(
    deploymentDoc?.source,
    'firebase-production-deploy-workflow',
    'Source deployment provenance',
    failures,
  );
  requireExact(
    deploymentDoc?.deployedCommitSha,
    expectedReleaseSha,
    'Source deployment deployedCommitSha',
    failures,
  );
  const expectedSource = sourceDeploymentOf(deploymentDoc);
  for (const key of Object.keys(expectedSource)) {
    requireExact(
      state.sourceDeployment?.[key],
      expectedSource[key],
      `Hard-clearance state sourceDeployment.${key}`,
      failures,
    );
  }

  requireExact(state.mailboxAccess?.status, 'passed', 'Hard-clearance mailbox status', failures);
  requireExact(state.mailboxAccess?.mailboxesVerified, 2, 'Hard-clearance mailbox count', failures);
  requireExact(state.mailboxAccess?.peppersVerified, 2, 'Hard-clearance pepper count', failures);
  requireExact(
    state.mailboxAccess?.sentinelFullMessagesVerified,
    2,
    'Hard-clearance mailbox full-message count',
    failures,
  );
  requireExact(
    state.mailboxAccess?.secretValuesLogged,
    false,
    'Hard-clearance mailbox secretValuesLogged',
    failures,
  );

  const evidenceContext = {
    commitSha: expectedReleaseSha,
    repository: deploymentDoc?.repository,
    ref: deploymentDoc?.workflowRef,
    workflowRunId: deploymentDoc?.workflowRunId,
    workflowRunAttempt: deploymentDoc?.workflowRunAttempt,
    now,
    maxAgeMs: HARD_CLEARANCE_PRODUCTION_STATE_MAX_AGE_MS,
  };
  failures.push(...validateFirebasePhoneAuthEvidence(state.firebasePhoneAuth, evidenceContext));
  failures.push(...validateAdminMfaEvidence(state.adminMfa, evidenceContext));
  failures.push(...validateHostedClientConfigEvidence(state.hostedClientConfig, evidenceContext));

  for (const forbiddenPath of findForbiddenKeys(state)) {
    failures.push(`Hard-clearance state must not contain sensitive field ${forbiddenPath}.`);
  }

  return [...new Set(failures)];
}
