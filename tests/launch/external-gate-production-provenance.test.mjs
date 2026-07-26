import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');
const ordered = (source, fragments) => {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1);
    assert.notEqual(next, -1, `missing required fragment: ${fragment}`);
    assert.ok(next > cursor, `fragment is out of order: ${fragment}`);
    cursor = next;
  }
};

test('operational application evidence is bound to the exact production deployment', () => {
  const workflow = read('.github/workflows/operational-application-evidence.yml');
  const paginatedRunner = read('scripts/run-operational-application-evidence-paginated.mjs');
  assert.match(workflow, /production_deploy_run_id:/);
  assert.match(workflow, /actions:\s*read/);
  assert.match(workflow, /production-deployment-\$\{\{ inputs\.expected_commit_sha \}\}/);
  assert.match(workflow, /run-id:\s*\$\{\{ inputs\.production_deploy_run_id \}\}/);
  assert.match(workflow, /doc\.deployedCommitSha !== expectedSha/);
  assert.match(workflow, /doc\.workflowRunId \|\| ''\) !== deployRunId/);
  assert.match(workflow, /validatedArtifactDigest/);

  ordered(workflow, [
    'verify-operational-application-provenance.mjs',
    'run-operational-application-evidence-paginated.mjs',
    'bind-operational-application-provenance.mjs',
    'publish-operational-application-evidence.mjs',
  ]);
  assert.match(paginatedRunner, /sourcePath = path\.join\(__dirname, 'verify-operational-application-evidence\.mjs'\)/);
  assert.match(paginatedRunner, /replaceExactlyOnce/);
  assert.match(paginatedRunner, /readAllMatchingDocuments/);
  assert.match(paginatedRunner, /secondFactorHash: sha256\(auth\.secondFactorIdentifier\)/);
});

test('application provenance verifier rejects stale or mismatched production state', () => {
  const verifier = read('scripts/verify-operational-application-provenance.mjs');
  assert.match(verifier, /deployment\.deployedCommitSha !== commitSha/);
  assert.match(verifier, /deployment\.workflowRunId \|\| ''\) !== expectedDeployRunId/);
  assert.match(verifier, /validatedArtifactDigest/);
  assert.match(verifier, /production deployment is older than seven days/);
  assert.match(verifier, /entry\.observedMs >= deployedAt\.getTime\(\)/);
  assert.match(verifier, /has no qualifying production record created after the exact deployment/);
  assert.match(verifier, /production record declares a different release SHA/);
  assert.match(verifier, /production record declares a different deployment run/);
  assert.match(verifier, /subjectHash/);
});

test('application proof publisher receives deployment-bound semantic evidence', () => {
  const binder = read('scripts/bind-operational-application-provenance.mjs');
  assert.match(binder, /semanticHash !== text\(provenance\.subjectHash\)/);
  assert.match(binder, /selected production record predates the exact deployment/);
  assert.match(binder, /proof\.evidence\.deploymentProvenance/);
  assert.match(binder, /productionDeployRunId/);
  assert.match(binder, /deploymentArtifactDigest/);
  assert.match(binder, /selectedObservedAt/);
});

test('privileged rotation proof requires a live Firebase Admin credential outcome', () => {
  const workflow = read('.github/workflows/privileged-access-rotation-evidence.yml');
  assert.match(workflow, /E2E_ADMIN_PASSWORD:/);
  assert.match(workflow, /VITE_FIREBASE_API_KEY:/);
  ordered(workflow, [
    'verify-admin-credential-login.mjs',
    'verify-privileged-access-rotation.mjs',
    'bind-admin-credential-rotation-proof.mjs',
    'publish-direct-operational-proof.mjs',
  ]);

  const verifier = read('scripts/verify-admin-credential-login.mjs');
  assert.match(verifier, /accounts:signInWithPassword/);
  assert.match(verifier, /PRIVILEGED_ROLES/);
  assert.match(verifier, /directAuthentication/);
  assert.match(verifier, /mfaChallengeIssued/);
  assert.match(verifier, /neither authenticated the Admin nor issued the required MFA challenge/);

  const binder = read('scripts/bind-admin-credential-rotation-proof.mjs');
  assert.match(binder, /adminUidHash/);
  assert.match(binder, /rotated Admin password was not accepted by Firebase Auth/);
  assert.match(binder, /rotationProof\.adminCredentialLogin/);
});
