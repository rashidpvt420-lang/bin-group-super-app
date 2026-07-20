#!/usr/bin/env node
/**
 * Fail-closed verification for deployment artifacts downloaded by the
 * postdeploy job. Every document must be bound to this protected workflow run.
 *
 * This script never authorizes a public launch. It only verifies provenance;
 * hardLaunchClaim remains false until the final signed postdeploy decision.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  APPROVAL_MAX_AGE_MS,
  DEPLOYMENT_META_PATH,
  DEPLOYMENT_MAX_AGE_MS,
  INCIDENTS_MAX_AGE_MS,
  PREDEPLOY_APPROVAL_PATH,
  checkProductionIncidents,
  readJsonAbsolute,
  requireArtifactDigest,
  requireFullSha,
} from './lib/launch-gate-common.mjs';
import {
  DECISION_KIND,
  HARD_LAUNCH_CONTROL_SCHEMA,
  signDocument,
  validateAuthorizationDocument,
  validateDeploymentMetadata,
  validateIncidentDocument,
  validateIsoTimestamp,
} from './lib/hard-launch-control.mjs';
import {
  HARD_LAUNCH_CLAIM,
  PRODUCTION,
  REQUIRED_PILOT_EVIDENCE,
  sha256File,
  validateDeploymentDocument,
} from './lib/launch-honesty.mjs';
import { validateFirebasePhoneAuthEvidence } from './verify-firebase-phone-auth-production.mjs';
import { validateAdminMfaEvidence } from './verify-admin-mfa-production.mjs';
import { validateHostedClientConfigEvidence } from './verify-hosted-client-config.mjs';

const EXPECTED_REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const EXPECTED_REF = 'refs/heads/main';
const INCIDENTS_PATH = 'launch_package/production-incidents.json';
const AUTHORIZATION_PATH = 'launch_package/hard-launch-authorization.json';
const DECISION_PATH = 'launch_package/hard-launch-decision.json';
const EVIDENCE_BATCH_PATH = 'launch_package/launch-evidence-batch.json';
const CLEAR_ATTESTATION = 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR';
const HOLDS_ATTESTATION = 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS';
const REQUIRED_COMPONENTS = Object.freeze([
  'hosting',
  'firestoreRules',
  'firestoreIndexes',
  'storageRules',
  'functions',
]);

function requireText(env, name, failures) {
  const value = String(env[name] || '').trim();
  if (!value) failures.push(`${name} is required.`);
  return value;
}

function requirePositiveAttempt(value, label, failures) {
  const raw = String(value || '').trim();
  if (!/^[1-9][0-9]*$/.test(raw)) {
    failures.push(`${label} must be a positive integer.`);
    return null;
  }
  return Number(raw);
}

function requireExact(actual, expected, label, failures) {
  if (String(actual ?? '') !== String(expected ?? '')) {
    failures.push(`${label} mismatch.`);
  }
}

function readDocument(root, relativePath, failures, label) {
  return readJsonAbsolute(path.join(root, relativePath), failures, label);
}

function hashRuntimeFile(root, relativePath) {
  const file = path.join(root, relativePath);
  return existsSync(file) ? sha256File(file) : null;
}

function maybeWriteProvisionalPublicDecision({
  root,
  env,
  sha,
  ref,
  repository,
  runId,
  runAttempt,
  actor,
  authorization,
  hmacKey,
  now,
}) {
  const launchMode = String(env.LAUNCH_MODE || '').trim().toLowerCase();
  if (launchMode !== 'public') return false;

  const decisionPath = path.join(root, DECISION_PATH);
  if (existsSync(decisionPath)) return false;

  const evidenceHashes = {
    authorization: hashRuntimeFile(root, AUTHORIZATION_PATH),
    incidents: hashRuntimeFile(root, INCIDENTS_PATH),
    deployment: hashRuntimeFile(root, DEPLOYMENT_META_PATH),
    liveEvidence: hashRuntimeFile(root, EVIDENCE_BATCH_PATH),
  };

  const payload = {
    schemaVersion: HARD_LAUNCH_CONTROL_SCHEMA,
    kind: DECISION_KIND,
    status: 'public-awaiting-postdeploy-clearance',
    hardLaunchClaim: false,
    launchMode: 'public',
    commitSha: sha,
    ref,
    repository,
    workflowRunId: runId,
    workflowRunAttempt: runAttempt,
    approvedByActor: actor,
    founder: authorization?.founder || null,
    approvedAt: new Date(now).toISOString(),
    production: {
      projectId: PRODUCTION.projectId,
      mainUrl: PRODUCTION.mainUrl,
      adminUrl: PRODUCTION.adminUrl,
    },
    requiredEvidence: [...REQUIRED_PILOT_EVIDENCE],
    evidenceHashes,
    decisionRule:
      'public mode requires postdeploy release clearance and Stripe live proof before hardLaunchClaim may become true',
  };

  const decision = signDocument(payload, hmacKey);
  mkdirSync(path.dirname(decisionPath), { recursive: true });
  writeFileSync(decisionPath, `${JSON.stringify(decision, null, 2)}\n`, { mode: 0o600 });
  return true;
}

export function runSameRunDeploymentArtifactVerification({
  root = process.cwd(),
  env = process.env,
  now = Date.now(),
} = {}) {
  const failures = [];

  if (String(env.GITHUB_ACTIONS || '') !== 'true') {
    failures.push('GITHUB_ACTIONS must equal true.');
  }

  const repository = requireText(env, 'GITHUB_REPOSITORY', failures);
  const ref = requireText(env, 'GITHUB_REF', failures);
  const runId = requireText(env, 'GITHUB_RUN_ID', failures);
  const actor = requireText(env, 'GITHUB_ACTOR', failures);
  const sha = requireFullSha(env.GITHUB_SHA, 'GITHUB_SHA', failures);
  const runAttempt = requirePositiveAttempt(
    env.GITHUB_RUN_ATTEMPT,
    'GITHUB_RUN_ATTEMPT',
    failures,
  );
  const expectedDigest = requireArtifactDigest(
    env.VALIDATED_ARTIFACT_DIGEST,
    'VALIDATED_ARTIFACT_DIGEST',
    failures,
  );
  const releaseId = requireText(env, 'RELEASE_ID', failures);
  const authorizedActors = requireText(env, 'AUTHORIZED_FOUNDER_ACTORS', failures);
  const authorizedEmails = requireText(env, 'AUTHORIZED_FOUNDER_EMAILS', failures);
  const hmacKey = requireText(env, 'HARD_LAUNCH_APPROVAL_HMAC_KEY', failures);
  const authorizedEmailList = authorizedEmails
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  requireExact(repository, EXPECTED_REPOSITORY, 'GITHUB_REPOSITORY', failures);
  requireExact(ref, EXPECTED_REF, 'GITHUB_REF', failures);
  const expectedReleaseId =
    runId && runAttempt !== null ? `${runId}-${runAttempt}` : '';
  requireExact(releaseId, expectedReleaseId, 'RELEASE_ID', failures);

  const deployment = readDocument(
    root,
    DEPLOYMENT_META_PATH,
    failures,
    DEPLOYMENT_META_PATH,
  );
  if (deployment) {
    failures.push(
      ...validateDeploymentDocument(deployment, sha, {
        root,
        requireWorkflowProvenance: true,
      }),
      ...validateDeploymentMetadata(deployment, {
        commitSha: sha,
        repository,
        now,
      }),
    );
    requireExact(
      deployment.source,
      'firebase-production-deploy-workflow',
      'deployment source',
      failures,
    );
    requireExact(deployment.status, 'passed', 'deployment status', failures);
    requireExact(
      deployment.deployedCommitSha,
      sha,
      'deployment deployedCommitSha',
      failures,
    );
    requireExact(deployment.repository, repository, 'deployment repository', failures);
    requireExact(deployment.workflowRef, ref, 'deployment workflowRef', failures);
    requireExact(
      deployment.workflowRunId,
      runId,
      'deployment workflowRunId',
      failures,
    );
    requireExact(
      deployment.workflowRunAttempt,
      runAttempt,
      'deployment workflowRunAttempt',
      failures,
    );
    if (deployment.hardLaunchClaim !== false) {
      failures.push('deployment hardLaunchClaim must be exactly false.');
    }
    if (!Array.isArray(deployment.successfulComponents)) {
      failures.push('deployment successfulComponents must be an array.');
    } else {
      for (const component of REQUIRED_COMPONENTS) {
        if (!deployment.successfulComponents.includes(component)) {
          failures.push(`deployment successfulComponents missing ${component}.`);
        }
      }
    }
    const deploymentDigest = requireArtifactDigest(
      deployment.artifactDigest,
      'deployment artifactDigest',
      failures,
    );
    const validatedDeploymentDigest = requireArtifactDigest(
      deployment.validatedArtifactDigest,
      'deployment validatedArtifactDigest',
      failures,
    );
    if (expectedDigest && deploymentDigest !== expectedDigest) {
      failures.push('deployment artifactDigest mismatch.');
    }
    if (
      expectedDigest &&
      validatedDeploymentDigest !== expectedDigest
    ) {
      failures.push('deployment validatedArtifactDigest mismatch.');
    }
    validateIsoTimestamp(deployment.deployedAt, 'deployment deployedAt', {
      now,
      maxAgeMs: DEPLOYMENT_MAX_AGE_MS,
    }).forEach((failure) => failures.push(failure));
    validateIsoTimestamp(deployment.verifiedAt, 'deployment verifiedAt', {
      now,
      maxAgeMs: DEPLOYMENT_MAX_AGE_MS,
    }).forEach((failure) => failures.push(failure));
    failures.push(
      ...validateFirebasePhoneAuthEvidence(deployment.firebasePhoneAuth, {
        commitSha: sha,
        repository,
        ref,
        workflowRunId: runId,
        workflowRunAttempt: runAttempt,
        now,
      }),
      ...validateAdminMfaEvidence(deployment.adminMfa, {
        commitSha: sha,
        repository,
        ref,
        workflowRunId: runId,
        workflowRunAttempt: runAttempt,
        now,
      }),
      ...validateHostedClientConfigEvidence(deployment.clientRuntimeConfig, {
        commitSha: sha,
        repository,
        ref,
        workflowRunId: runId,
        workflowRunAttempt: runAttempt,
        now,
      }),
    );
  }

  const incidents = readDocument(root, INCIDENTS_PATH, failures, INCIDENTS_PATH);
  if (incidents) {
    checkProductionIncidents(failures, { root, now, env });
    failures.push(...validateIncidentDocument(incidents, { now }));
    requireExact(
      incidents.source,
      'protected-workflow-dispatch-attestation',
      'incidents source',
      failures,
    );
    requireExact(incidents.repository, repository, 'incidents repository', failures);
    requireExact(incidents.commitSha, sha, 'incidents commitSha', failures);
    requireExact(incidents.ref, ref, 'incidents ref', failures);
    requireExact(
      incidents.workflowRunId,
      runId,
      'incidents workflowRunId',
      failures,
    );
    requireExact(
      incidents.workflowRunAttempt,
      runAttempt,
      'incidents workflowRunAttempt',
      failures,
    );
    if (incidents.hardLaunchClaim !== false) {
      failures.push('incidents hardLaunchClaim must be exactly false.');
    }
    if (
      incidents.attestation !== CLEAR_ATTESTATION &&
      incidents.attestation !== HOLDS_ATTESTATION
    ) {
      failures.push('incidents attestation is missing or invalid.');
    }
    requireExact(incidents.actor, actor, 'incidents actor', failures);
    if (!String(incidents.workflow || '').trim()) {
      failures.push('incidents workflow is required.');
    }
    if (
      !Array.isArray(incidents.evidenceReferences) ||
      incidents.evidenceReferences.length === 0 ||
      incidents.evidenceReferences.some((item) => !String(item || '').trim())
    ) {
      failures.push('incidents evidenceReferences must be a non-empty string array.');
    }
    validateIsoTimestamp(incidents.updatedAt, 'incidents updatedAt', {
      now,
      maxAgeMs: INCIDENTS_MAX_AGE_MS,
    }).forEach((failure) => failures.push(failure));
  }

  const approval = readDocument(
    root,
    PREDEPLOY_APPROVAL_PATH,
    failures,
    PREDEPLOY_APPROVAL_PATH,
  );
  if (approval) {
    requireExact(approval.commitSha, sha, 'predeploy approval commitSha', failures);
    requireExact(
      approval.artifactDigest,
      expectedDigest,
      'predeploy approval artifactDigest',
      failures,
    );
    requireExact(
      approval.releaseId,
      releaseId,
      'predeploy approval releaseId',
      failures,
    );
    requireExact(
      approval.approvedVia,
      'github-environment-protection',
      'predeploy approval approvedVia',
      failures,
    );
    requireExact(
      approval.githubEnvironment,
      'production',
      'predeploy approval githubEnvironment',
      failures,
    );
    const approvedBy = String(approval.approvedBy || '').trim().toLowerCase();
    if (!approvedBy) {
      failures.push('predeploy approval approvedBy is required.');
    } else if (!authorizedEmailList.includes(approvedBy)) {
      failures.push(
        'predeploy approval approvedBy is not in AUTHORIZED_FOUNDER_EMAILS.',
      );
    }
    if (approval.launchMode !== 'bank-pilot' && approval.launchMode !== 'public') {
      failures.push('predeploy approval launchMode must be bank-pilot or public.');
    }
    if (approval.signature || approval.founderAuthorization?.signature) {
      failures.push('predeploy approval must not contain signature fields.');
    }
    validateIsoTimestamp(approval.approvedAt, 'predeploy approval approvedAt', {
      now,
      maxAgeMs: APPROVAL_MAX_AGE_MS,
    }).forEach((failure) => failures.push(failure));
  }

  const authorization = readDocument(
    root,
    AUTHORIZATION_PATH,
    failures,
    AUTHORIZATION_PATH,
  );
  if (authorization) {
    failures.push(
      ...validateAuthorizationDocument(authorization, {
        commitSha: sha,
        ref,
        repository,
        runId,
        actor,
        authorizedActors,
        authorizedEmails,
        hmacKey,
        now,
      }),
    );
    requireExact(
      authorization.runAttempt,
      runAttempt,
      'authorization workflow run attempt',
      failures,
    );
  }

  let provisionalDecisionWritten = false;
  if (failures.length === 0) {
    provisionalDecisionWritten = maybeWriteProvisionalPublicDecision({
      root,
      env,
      sha,
      ref,
      repository,
      runId,
      runAttempt,
      actor,
      authorization,
      hmacKey,
      now,
    });
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    hardLaunchClaim: HARD_LAUNCH_CLAIM,
    provisionalDecisionWritten,
    binding: {
      repository,
      ref,
      sha,
      runId,
      runAttempt,
      releaseId,
      artifactDigest: expectedDigest,
    },
  };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isDirectRun) {
  const result = runSameRunDeploymentArtifactVerification();
  console.log('\n=== Same-run deployment artifact verification ===\n');
  console.log(`hardLaunchClaim=${HARD_LAUNCH_CLAIM}`);
  if (result.provisionalDecisionWritten) {
    console.log('Wrote signed provisional public hard-launch decision with hardLaunchClaim=false.');
  }
  if (!result.ok) {
    console.error('FAIL — downloaded deployment artifacts are not bound to this workflow run:');
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(
    `PASS — repository/ref/SHA/run/attempt/digest bindings verified for ${result.binding.sha}.`,
  );
  process.exit(0);
}
