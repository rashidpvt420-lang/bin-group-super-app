import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const url = (path) => new URL(`../../${path}`, import.meta.url);
const read = (path) => readFile(url(path), 'utf8');

test('operational MFA evidence scripts parse under the repository Node runtime', () => {
  for (const path of [
    'scripts/lib/firebase-mfa-sign-in.mjs',
    'scripts/verify-operational-application-evidence-mfa.mjs',
    'scripts/verify-operational-application-provenance.mjs',
  ]) {
    const filename = fileURLToPath(url(path));
    const result = spawnSync(process.execPath, ['--check', filename], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${path} failed Node syntax validation:\n${result.stderr || result.stdout}`);
  }
});

test('operational evidence scopes canonical Founder credentials to the MFA-aware verifier step', async () => {
  const workflow = await read('.github/workflows/operational-application-evidence.yml');
  const stepsIndex = workflow.indexOf('\n    steps:');
  const replayStepIndex = workflow.indexOf('- name: Auto-discover, verify, and publish application evidence');
  const uploadStepIndex = workflow.indexOf('- name: Upload application proof batch');
  assert.ok(stepsIndex >= 0 && replayStepIndex > stepsIndex && uploadStepIndex > replayStepIndex);
  const jobScope = workflow.slice(0, stepsIndex);
  const replayStep = workflow.slice(replayStepIndex, uploadStepIndex);

  for (const name of ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET']) {
    assert.doesNotMatch(jobScope, new RegExp(`${name}:`));
    assert.match(replayStep, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.doesNotMatch(workflow, /E2E_ADMIN_EMAIL:\s*\$\{\{ secrets\./);
  assert.doesNotMatch(workflow, /E2E_ADMIN_PASSWORD:\s*\$\{\{ secrets\./);
  assert.match(workflow, /node scripts\/verify-operational-application-evidence-mfa\.mjs/);
  assert.doesNotMatch(workflow, /OPERATIONAL_GATE="\$gate" node scripts\/verify-operational-application-evidence\.mjs/);
});

test('Firebase operational replay requires server-verified Founder TOTP and the exact factor identifier', async () => {
  const helper = await read('scripts/lib/firebase-mfa-sign-in.mjs');

  assert.match(helper, /accounts\/mfaSignIn:finalize/);
  assert.match(helper, /totpVerificationInfo: \{ verificationCode \}/);
  assert.match(helper, /verifyIdToken\(idToken, true\)/);
  assert.match(helper, /EXPECTED_PROJECT_ID = 'bin-group-57c60'/);
  assert.match(helper, /CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups\.com'/);
  assert.match(helper, /email_verified !== true/);
  assert.match(helper, /CEO or Super Admin Founder authority/);
  assert.match(helper, /secondFactorType !== 'totp'/);
  assert.match(helper, /firebase\?\.second_factor_identifier/);
  assert.match(helper, /requireVerifiedTotpMfaToken\(directToken, verifyIdTokenImpl\)/);
  assert.match(helper, /verified\.secondFactorIdentifier !== enrollmentId/);
  assert.match(helper, /verified TOTP second-factor session/);
  assert.doesNotMatch(helper, /decodeJwtPayload/);
  assert.doesNotMatch(helper, /response\.text\(\)/);
  assert.doesNotMatch(helper, /raw:\s*raw/);
});

test('finance replay is bound to the canonical Founder and serializes only MFA hashes', async () => {
  const wrapper = await read('scripts/verify-operational-application-evidence-mfa.mjs');

  assert.match(wrapper, /founderEmail !== 'ceo@bin-groups\.com'/);
  assert.match(wrapper, /signInWithRequiredTotpMfa/);
  assert.match(wrapper, /Operational finance replay attempted to use a non-Founder credential/);
  assert.match(wrapper, /MFA_REPLAY_GATES = new Set\(\['paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce'\]\)/);
  assert.match(wrapper, /verifiedMfa\.secondFactorType !== 'totp'/);
  assert.match(wrapper, /!verifiedMfa\.secondFactorIdentifier/);
  assert.match(wrapper, /replayMfaVerified = true/);
  assert.match(wrapper, /replayMfaFactorType = 'totp'/);
  assert.match(wrapper, /replayActorUidHash = sha256\(verifiedMfa\.uid\)/);
  assert.match(wrapper, /replaySecondFactorHash = sha256\(verifiedMfa\.secondFactorIdentifier\)/);
  assert.doesNotMatch(wrapper, /sha256\(verifiedMfa\.secondFactor\)/);
  assert.doesNotMatch(wrapper, /proof\.evidence\.secondFactor\s*=/);
  assert.doesNotMatch(wrapper, /proof\.evidence\.idToken\s*=/);
});

test('operational provenance and application selectors paginate before release filtering', async () => {
  const [provenance, wrapper] = await Promise.all([
    read('scripts/verify-operational-application-provenance.mjs'),
    read('scripts/verify-operational-application-evidence-mfa.mjs'),
  ]);

  for (const source of [provenance, wrapper]) {
    assert.match(source, /const PAGE_SIZE = 250/);
    assert.match(source, /readAllMatchingDocuments/);
    assert.match(source, /FieldPath\.documentId\(\)/);
    assert.match(source, /startAfter\(cursor\)/);
  }
  assert.match(provenance, /const documents = await readAllMatchingDocuments\(query\)/);
  assert.match(provenance, /scannedDocumentCount: documents\.length/);
  assert.match(provenance, /entry\.observedMs >= deployedAt\.getTime\(\)/);
  assert.doesNotMatch(provenance, /const snapshot = await query\.limit\(100\)\.get\(\)/);
  for (const selector of [
    'approved-payment selector',
    'notification selector',
    'Broker commission selector',
    'staff-audit selector',
    'renewal-watch selector',
  ]) {
    assert.match(wrapper, new RegExp(selector));
  }
  assert.match(wrapper, /applicationSelectorPagination = \{ pageSize: PAGE_SIZE, completeScan: true \}/);
});
