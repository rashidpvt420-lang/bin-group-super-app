import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { synchronizeFounderEvidenceCredential } from '../../scripts/synchronize-founder-evidence-credential.mjs';

const SHA = 'a'.repeat(40);
const RUN_ID = '123456789';
const FOUNDER_EMAIL = 'ceo@bin-groups.com';

function fixtureRoot() {
  const root = mkdtempSync(path.join(tmpdir(), 'founder-evidence-sync-'));
  mkdirSync(path.join(root, 'launch_package'), { recursive: true });
  writeFileSync(path.join(root, 'launch_package/hard-launch-authorization.json'), JSON.stringify({
    approved: true,
    commitSha: SHA,
    repository: 'rashidpvt420-lang/bin-group-super-app',
    runId: RUN_ID,
    founder: { email: FOUNDER_EMAIL },
  }));
  writeFileSync(path.join(root, 'launch_package/production-deployment.json'), JSON.stringify({
    status: 'passed',
    projectId: 'bin-group-57c60',
    deployedCommitSha: SHA,
    repository: 'rashidpvt420-lang/bin-group-super-app',
    workflowRunId: RUN_ID,
  }));
  return root;
}

function env(overrides = {}) {
  return {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
    GITHUB_WORKFLOW: 'Firebase Production Deploy',
    GITHUB_JOB: 'deploy-firebase-production-stack',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_SHA: SHA,
    GITHUB_RUN_ID: RUN_ID,
    DEPLOYMENT_ENVIRONMENT: 'production',
    GCP_PROJECT_ID: 'bin-group-57c60',
    E2E_FOUNDER_EMAIL: FOUNDER_EMAIL,
    E2E_FOUNDER_PASSWORD: 'protected-password-123',
    VITE_FIREBASE_API_KEY: 'firebase-api-key',
    ...overrides,
  };
}

function founder() {
  return {
    uid: 'founder-uid',
    email: FOUNDER_EMAIL,
    disabled: false,
    emailVerified: true,
    customClaims: { role: 'ceo', admin: true },
    multiFactor: { enrolledFactors: [{ uid: 'totp-factor', factorId: 'totp' }] },
  };
}

function response({ ok, payload, status = ok ? 200 : 400 }) {
  return {
    ok,
    status,
    async text() { return JSON.stringify(payload); },
  };
}

test('repairs only an invalid canonical Founder password and proves the MFA challenge', async () => {
  const root = fixtureRoot();
  const updates = [];
  let calls = 0;
  const authClient = {
    async getUserByEmail() { return founder(); },
    async updateUser(uid, patch) { updates.push({ uid, patch }); return founder(); },
  };
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return response({ ok: false, payload: { error: { message: 'INVALID_LOGIN_CREDENTIALS' } } });
    return response({
      ok: true,
      payload: {
        localId: 'founder-uid',
        mfaPendingCredential: 'pending-credential',
        mfaInfo: [{ mfaEnrollmentId: 'totp-factor', totpInfo: {} }],
      },
    });
  };

  const result = await synchronizeFounderEvidenceCredential({
    env: env(), root, authClient, fetchImpl, now: new Date('2026-08-05T09:30:00.000Z'),
  });
  assert.equal(result.status, 'passed');
  assert.equal(result.mutationPerformed, true);
  assert.equal(result.mfaChallengeIssued, true);
  assert.equal(result.roleAndMfaStateChanged, false);
  assert.equal(result.sensitiveValuesExcluded, true);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0], { uid: 'founder-uid', patch: { password: 'protected-password-123' } });
  const written = JSON.parse(readFileSync(path.join(root, 'launch_package/founder-evidence-credential-sync.json'), 'utf8'));
  assert.equal(written.passwordAccepted, true);
  assert.equal(JSON.stringify(written).includes('protected-password-123'), false);
});

test('does not mutate when the configured credential already produces the MFA challenge', async () => {
  const root = fixtureRoot();
  let updated = false;
  const result = await synchronizeFounderEvidenceCredential({
    env: env(),
    root,
    authClient: {
      async getUserByEmail() { return founder(); },
      async updateUser() { updated = true; },
    },
    fetchImpl: async () => response({
      ok: true,
      payload: {
        localId: 'founder-uid',
        mfaPendingCredential: 'pending-credential',
        mfaInfo: [{ mfaEnrollmentId: 'totp-factor', totpInfo: {} }],
      },
    }),
  });
  assert.equal(result.mutationPerformed, false);
  assert.equal(updated, false);
});

test('refuses non-main context, unsigned runs, and non-credential provider failures', async () => {
  const authClient = { async getUserByEmail() { return founder(); }, async updateUser() {} };
  await assert.rejects(
    synchronizeFounderEvidenceCredential({
      env: env({ GITHUB_REF: 'refs/heads/feature' }), root: fixtureRoot(), authClient, fetchImpl: async () => response({ ok: true, payload: {} }),
    }),
    /refs\/heads\/main/,
  );

  const unsignedRoot = fixtureRoot();
  writeFileSync(path.join(unsignedRoot, 'launch_package/hard-launch-authorization.json'), JSON.stringify({ approved: false }));
  await assert.rejects(
    synchronizeFounderEvidenceCredential({ env: env(), root: unsignedRoot, authClient, fetchImpl: async () => response({ ok: true, payload: {} }) }),
    /Signed Founder authorization/,
  );

  await assert.rejects(
    synchronizeFounderEvidenceCredential({
      env: env(), root: fixtureRoot(), authClient,
      fetchImpl: async () => response({ ok: false, payload: { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } } }),
    }),
    /blocked by TOO_MANY_ATTEMPTS_TRY_LATER/,
  );
});

test('production workflow synchronizes only after same-run deployment verification and renewed WIF auth', () => {
  const workflow = readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');
  const deploymentVerifier = workflow.indexOf('Verify production deployment metadata and same-run bindings after deploy');
  const renewedAuth = workflow.indexOf('Authenticate Google Cloud for E2E fixtures');
  const sync = workflow.indexOf('Verify or synchronize canonical Founder evidence credential');
  const businessEvidence = workflow.indexOf('Run current-commit five-role business evidence');
  assert.ok(deploymentVerifier >= 0 && renewedAuth > deploymentVerifier);
  assert.ok(sync > renewedAuth && sync < businessEvidence);
  assert.match(workflow.slice(sync, businessEvidence), /synchronize-founder-evidence-credential\.mjs/);
});
