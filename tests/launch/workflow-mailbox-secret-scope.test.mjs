import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflows = [
  '.github/workflows/admin-production-evidence.yml',
  '.github/workflows/firebase-production-deploy.yml',
  '.github/workflows/live-role-smoke.yml',
];

const oauthKeys = [
  'E2E_OWNER_MAILBOX_CLIENT_ID',
  'E2E_OWNER_MAILBOX_CLIENT_SECRET',
  'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  'E2E_BROKER_MAILBOX_CLIENT_ID',
  'E2E_BROKER_MAILBOX_CLIENT_SECRET',
  'E2E_BROKER_MAILBOX_REFRESH_TOKEN',
];

const productionWorkflow = () =>
  readFileSync('.github/workflows/firebase-production-deploy.yml', 'utf8');

function indexAfter(source, marker, after = 0) {
  const index = source.indexOf(marker, after);
  assert.ok(index >= 0, `missing marker: ${marker}`);
  return index;
}

test('Gmail OAuth credentials remain step-scoped and are never persisted', () => {
  for (const workflowPath of workflows) {
    const source = readFileSync(workflowPath, 'utf8');
    const topLevel = source.slice(0, source.indexOf('\njobs:'));
    for (const key of oauthKeys) {
      assert.doesNotMatch(topLevel, new RegExp(`^\\s{2}${key}:`, 'm'), `${workflowPath} exposes ${key} globally`);
      assert.doesNotMatch(source, new RegExp(`printf ['"]${key}=`), `${workflowPath} writes ${key} into .env.e2e`);
      assert.match(source, new RegExp(`${key}: \\$\\{\\{ secrets\\.${key} \\}\\}`), `${workflowPath} has no consuming-step mapping for ${key}`);
    }
  }
});

test('production mailbox resolver publishes a non-secret attestation only after both Gmail profiles verify', () => {
  const source = readFileSync('scripts/resolve-production-mailbox-identities.mjs', 'utf8');
  const verificationStart = indexAfter(source, 'const [ownerEmail, brokerEmail] = await Promise.all([');
  const publishStart = indexAfter(source, 'appendFileSync(', verificationStart);

  assert.match(source, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile/);
  assert.match(source, /E2E_MAILBOX_OAUTH_VERIFIED=\$\{MAILBOX_OAUTH_ATTESTATION\}/);
  assert.match(source, /MAILBOX_OAUTH_ATTESTATION = 'owner\+broker-profile-verified'/);
  assert.ok(publishStart > verificationStart, 'attestation must be published only after both OAuth profiles verify');
  for (const key of oauthKeys) {
    assert.doesNotMatch(source, new RegExp(`${key}=\\$\\{`), `${key} must never be published through GITHUB_ENV`);
  }
});

test('strict-live guard accepts only an exact-main Firebase Production Deploy mailbox attestation', () => {
  const source = readFileSync('scripts/verify-e2e-env.mjs', 'utf8');

  assert.match(source, /function hasTrustedMailboxOAuthAttestation\(\)/);
  assert.match(source, /process\.env\.GITHUB_ACTIONS === 'true'/);
  assert.match(source, /process\.env\.GITHUB_WORKFLOW === 'Firebase Production Deploy'/);
  assert.match(source, /process\.env\.GITHUB_REF === 'refs\/heads\/main'/);
  assert.match(source, /process\.env\.E2E_MAILBOX_OAUTH_VERIFIED === MAILBOX_OAUTH_ATTESTATION/);
  assert.match(source, /EMAIL_RE\.test\(ownerEmail\)/);
  assert.match(source, /EMAIL_RE\.test\(brokerEmail\)/);
  assert.match(source, /missingMailboxOauth\.length && !hasTrustedMailboxOAuthAttestation\(\)/);
  assert.doesNotMatch(source, /E2E_MAILBOX_OAUTH_VERIFIED === ['"]true['"]/);
});

test('each production job resolves authenticated mailboxes before every strict-live guard', () => {
  const source = productionWorkflow();
  const publicJobStart = indexAfter(source, '  public-release-clearance:');
  const deployJob = source.slice(0, publicJobStart);
  const publicJob = source.slice(publicJobStart);

  const deployResolve = indexAfter(deployJob, '- name: Resolve protected Gmail mailbox identities');
  for (const marker of [
    '- name: Validate full live E2E secrets and App Check UUID',
    '- name: Run current-commit live launch audit',
    '- name: Evaluate controlled-pilot eligibility',
  ]) {
    assert.ok(indexAfter(deployJob, marker) > deployResolve, `${marker} must run after mailbox OAuth verification`);
  }

  const publicResolve = indexAfter(publicJob, '- name: Resolve protected Gmail mailbox identities');
  for (const marker of [
    '- name: Create E2E environment for live proofs',
    '- name: Run launch audit live evidence',
  ]) {
    assert.ok(indexAfter(publicJob, marker) > publicResolve, `${marker} must run after mailbox OAuth verification`);
  }
});

test('public live-proof environment validates without persisting OAuth credentials', () => {
  const source = productionWorkflow();
  const stepStart = indexAfter(source, '- name: Create E2E environment for live proofs');
  const nextStep = indexAfter(source, '\n      - name:', stepStart + 1);
  const step = source.slice(stepStart, nextStep);

  assert.match(step, /> \.env\.e2e/);
  assert.match(step, /node scripts\/verify-e2e-env\.mjs/);
  for (const key of oauthKeys) {
    assert.doesNotMatch(step, new RegExp(`printf ['"]${key}=`), `${key} must not be written into .env.e2e`);
  }
});
