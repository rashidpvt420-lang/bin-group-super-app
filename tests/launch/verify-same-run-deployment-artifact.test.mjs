#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import {
  AUTHORIZATION_KIND,
  DEPLOY_CONFIRMATION_PHRASE,
  HARD_LAUNCH_CONFIRMATION_PHRASE,
  HARD_LAUNCH_CONTROL_SCHEMA,
  sha256Text,
  signDocument,
} from '../../scripts/lib/hard-launch-control.mjs';
import { buildFirebasePhoneAuthEvidence } from '../../scripts/verify-firebase-phone-auth-production.mjs';
import { buildAdminMfaEvidence } from '../../scripts/verify-admin-mfa-production.mjs';
import { buildHostedClientConfigEvidence } from '../../scripts/verify-hosted-client-config.mjs';
import { runSameRunDeploymentArtifactVerification } from '../../scripts/verify-same-run-deployment-artifact.mjs';

const SHA = 'a'.repeat(40);
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const REF = 'refs/heads/main';
const RUN_ID = '991122';
const RUN_ATTEMPT = 2;
const RELEASE_ID = `${RUN_ID}-${RUN_ATTEMPT}`;
const ACTOR = 'founder-actor';
const FOUNDER_EMAIL = 'founder@example.com';
const DIGEST = `sha256:${'ab'.repeat(32)}`;
const HMAC_KEY = 'test-only-hmac-key-that-is-more-than-32-characters';
const REQUIRED_COMPONENTS = ['hosting', 'firestoreRules', 'firestoreIndexes', 'storageRules', 'functions'];

function writeJson(root, name, value) {
  const target = path.join(root, 'launch_package', name);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(root, name) {
  return JSON.parse(readFileSync(path.join(root, 'launch_package', name), 'utf8'));
}

function mutate(root, name, update) {
  const doc = readJson(root, name);
  update(doc);
  writeJson(root, name, doc);
}

function adminMfaSummary() {
  return {
    claimedAdminCount: 3,
    missingAdminProfileCount: 0,
    disabledAdminCount: 0,
    inactiveProfileAdminCount: 0,
    activeAdminCount: 3,
    activeAdminEmailUnverifiedCount: 0,
    phoneMfaEnrolledCount: 3,
    missingPhoneFactorCount: 0,
    unsupportedOnlyFactorCount: 0,
    recoveryApproverCandidateCount: 2,
    recoveryApproverMfaReadyCount: 2,
    recoveryApproverEmailUnverifiedCount: 0,
    recoveryApproverMissingPhoneFactorCount: 0,
    recoveryCeoCount: 1,
    recoverySuperAdminCount: 1,
    recoveryQuorumReady: true,
    allActiveAdminsEmailVerified: true,
    allActiveAdminsPhoneMfaReady: true,
  };
}

function hostedClientSummaries() {
  return {
    main: {
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
    },
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

function createFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'same-run-deployment-'));
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_REF: REF,
    GITHUB_SHA: SHA,
    GITHUB_RUN_ID: RUN_ID,
    GITHUB_RUN_ATTEMPT: String(RUN_ATTEMPT),
    GITHUB_ACTOR: ACTOR,
    VALIDATED_ARTIFACT_DIGEST: DIGEST,
    RELEASE_ID,
    AUTHORIZED_FOUNDER_ACTORS: ACTOR,
    AUTHORIZED_FOUNDER_EMAILS: FOUNDER_EMAIL,
    HARD_LAUNCH_APPROVAL_HMAC_KEY: HMAC_KEY,
  };

  const firebasePhoneAuth = buildFirebasePhoneAuthEvidence({
    projectId: 'bin-group-57c60',
    phoneProviderEnabled: true,
    mfaState: 'ENABLED',
    mfaEnabled: true,
    requiredDomainsPresent: true,
    authorizedDomainCount: 2,
    smsPolicy: 'allowlist-only',
    requiredSmsRegion: 'AE',
    requiredSmsRegionAllowed: true,
    allowedRegionCount: 1,
    testPhoneNumberCount: 0,
  }, { env, now: new Date(now) });
  const adminMfa = buildAdminMfaEvidence(adminMfaSummary(), { env, now: new Date(now) });
  const clientRuntimeConfig = buildHostedClientConfigEvidence(hostedClientSummaries(), { env, now: new Date(now) });

  writeJson(root, 'production-deployment.json', {
    status: 'passed',
    projectId: 'bin-group-57c60',
    mainUrl: 'https://bin-group-57c60.web.app',
    adminUrl: 'https://bin-group-admin-panel.web.app',
    deployedCommitSha: SHA,
    localCommitSha: SHA,
    deployedAt: nowIso,
    verifiedAt: nowIso,
    workflowRunId: RUN_ID,
    workflowRunAttempt: RUN_ATTEMPT,
    workflowRef: REF,
    repository: REPOSITORY,
    successfulComponents: REQUIRED_COMPONENTS,
    artifactDigest: DIGEST,
    validatedArtifactDigest: DIGEST,
    httpChecksOk: true,
    bundleVerified: true,
    hardLaunchClaim: false,
    source: 'firebase-production-deploy-workflow',
    firebasePhoneAuth,
    adminMfa,
    clientRuntimeConfig,
  });

  writeJson(root, 'production-incidents.json', {
    schemaVersion: 1,
    source: 'protected-workflow-dispatch-attestation',
    repository: REPOSITORY,
    commitSha: SHA,
    ref: REF,
    workflowRunId: RUN_ID,
    workflowRunAttempt: RUN_ATTEMPT,
    workflow: 'Firebase Production Deploy',
    actor: ACTOR,
    updatedAt: nowIso,
    updatedBy: ACTOR,
    attestation: 'ATTEST_PRODUCTION_INCIDENT_STATE_CLEAR',
    evidenceReferences: ['ops://ticket/INC-REVIEW-1'],
    activeIncidents: [],
    requiresRollback: false,
    rollbackReason: null,
    lastDeploymentFailed: false,
    lastDeploymentFailedAt: null,
    lastSuccessfulDeployment: null,
    lastSuccessfulCommitSha: null,
    hardLaunchClaim: false,
  });

  writeJson(root, 'predeploy-approval.json', {
    schemaVersion: 1,
    commitSha: SHA,
    artifactDigest: DIGEST,
    releaseId: RELEASE_ID,
    approvedAt: nowIso,
    approvedBy: FOUNDER_EMAIL,
    approvedVia: 'github-environment-protection',
    githubEnvironment: 'production',
    launchMode: 'public',
  });

  const authorizationPayload = {
    schemaVersion: HARD_LAUNCH_CONTROL_SCHEMA,
    kind: AUTHORIZATION_KIND,
    approved: true,
    scope: 'production-deploy-and-conditional-hard-launch-decision',
    commitSha: SHA,
    ref: REF,
    repository: REPOSITORY,
    runId: RUN_ID,
    runAttempt: RUN_ATTEMPT,
    actor: ACTOR,
    founder: { name: 'Test Founder', email: FOUNDER_EMAIL },
    issuedAt: nowIso,
    expiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
    deployConfirmationDigest: sha256Text(DEPLOY_CONFIRMATION_PHRASE),
    hardLaunchConfirmationDigest: sha256Text(HARD_LAUNCH_CONFIRMATION_PHRASE),
  };
  writeJson(root, 'hard-launch-authorization.json', signDocument(authorizationPayload, HMAC_KEY));
  return { root, env, now };
}

function withFixture(run) {
  const fixture = createFixture();
  try {
    return run(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

const verify = (fixture) => runSameRunDeploymentArtifactVerification(fixture);
const rejected = (result, pattern) => {
  assert.equal(result.ok, false);
  assert.equal(result.hardLaunchClaim, false);
  assert.match(result.failures.join('\n'), pattern);
};

describe('same-run production deployment artifact verifier', () => {
  it('accepts a complete exact-run artifact with Phone Auth, Admin MFA quorum and hosted client evidence', () => {
    withFixture((fixture) => {
      const result = verify(fixture);
      assert.equal(result.ok, true, result.failures.join('\n'));
      assert.equal(result.binding.artifactDigest, DIGEST);
      assert.equal(result.hardLaunchClaim, false);
    });
  });

  it('rejects missing required documents', () => {
    for (const name of [
      'production-deployment.json',
      'production-incidents.json',
      'predeploy-approval.json',
      'hard-launch-authorization.json',
    ]) {
      withFixture((fixture) => {
        unlinkSync(path.join(fixture.root, 'launch_package', name));
        rejected(verify(fixture), /Missing|missing/i);
      });
    }
  });

  it('rejects deployment provenance, status, digest and component tampering', () => {
    for (const [field, value, pattern] of [
      ['source', 'manual', /deployment source/i],
      ['status', 'pending', /deployment status|status.*passed/i],
      ['deployedCommitSha', 'b'.repeat(40), /deployedCommitSha/i],
      ['workflowRunId', '123', /workflowRunId/i],
      ['artifactDigest', `sha256:${'cd'.repeat(32)}`, /artifactDigest/i],
      ['hardLaunchClaim', true, /hardLaunchClaim/i],
    ]) {
      withFixture((fixture) => {
        mutate(fixture.root, 'production-deployment.json', (doc) => { doc[field] = value; });
        rejected(verify(fixture), pattern);
      });
    }
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        doc.successfulComponents = doc.successfulComponents.filter((item) => item !== 'firestoreIndexes');
      });
      rejected(verify(fixture), /firestoreIndexes/i);
    });
  });

  it('rejects missing or tampered nested production evidence', () => {
    for (const [field, pattern] of [
      ['firebasePhoneAuth', /Phone Auth deployment evidence is missing/i],
      ['adminMfa', /Admin MFA deployment evidence is missing/i],
      ['clientRuntimeConfig', /Hosted client configuration deployment evidence is missing/i],
    ]) {
      withFixture((fixture) => {
        mutate(fixture.root, 'production-deployment.json', (doc) => { delete doc[field]; });
        rejected(verify(fixture), pattern);
      });
    }
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => { doc.firebasePhoneAuth.mfaState = 'DISABLED'; });
      rejected(verify(fixture), /mfaState/i);
    });
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => { doc.adminMfa.missingPhoneFactorCount = 1; });
      rejected(verify(fixture), /missing phone factors/i);
    });
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        doc.adminMfa.recoveryApproverMfaReadyCount = 1;
        doc.adminMfa.recoveryQuorumReady = false;
      });
      rejected(verify(fixture), /recovery quorum|at least two MFA-ready recovery approvers/i);
    });
    withFixture((fixture) => {
      mutate(fixture.root, 'production-deployment.json', (doc) => {
        doc.clientRuntimeConfig.main.mapsApiKeyMatched = false;
        doc.clientRuntimeConfig.main.allRequiredMatched = false;
      });
      rejected(verify(fixture), /main mapsApiKeyMatched|main allRequiredMatched/i);
    });
  });

  it('rejects blocking incidents and approval bindings', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'production-incidents.json', (doc) => {
        doc.attestation = 'ATTEST_PRODUCTION_INCIDENT_STATE_WITH_HOLDS';
        doc.activeIncidents = [{ id: 'P0-1', severity: 'P0', status: 'open' }];
      });
      rejected(verify(fixture), /P0\/P1|active production incidents/i);
    });
    withFixture((fixture) => {
      mutate(fixture.root, 'predeploy-approval.json', (doc) => { doc.releaseId = 'wrong-release'; });
      rejected(verify(fixture), /releaseId/i);
    });
  });

  it('rejects authorization signature and run-attempt tampering', () => {
    withFixture((fixture) => {
      mutate(fixture.root, 'hard-launch-authorization.json', (doc) => { doc.signature = 'bad-signature'; });
      rejected(verify(fixture), /signature/i);
    });
    withFixture((fixture) => {
      mutate(fixture.root, 'hard-launch-authorization.json', (doc) => { doc.runAttempt = 9; });
      rejected(verify(fixture), /run attempt|runAttempt/i);
    });
  });
});
