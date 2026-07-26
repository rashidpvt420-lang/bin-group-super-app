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

test('Founder credentials are scoped only to the protected MFA-aware verifier step', async () => {
  const workflow = await read('.github/workflows/operational-application-evidence.yml');
  const stepsIndex = workflow.indexOf('\n    steps:');
  const evidenceStepIndex = workflow.indexOf('- name: Auto-discover, verify, and publish application evidence');
  const uploadStepIndex = workflow.indexOf('- name: Upload application proof batch');
  assert.ok(stepsIndex >= 0 && evidenceStepIndex > stepsIndex && uploadStepIndex > evidenceStepIndex);

  const jobScope = workflow.slice(0, stepsIndex);
  const evidenceStep = workflow.slice(evidenceStepIndex, uploadStepIndex);
  for (const name of ['E2E_FOUNDER_EMAIL', 'E2E_FOUNDER_PASSWORD', 'E2E_FOUNDER_TOTP_SECRET']) {
    assert.doesNotMatch(jobScope, new RegExp(`${name}:`));
    assert.match(evidenceStep, new RegExp(`${name}: \\$\\{\\{ secrets\\.${name} \\}\\}`));
  }
  assert.match(workflow, /node scripts\/verify-operational-application-evidence-mfa\.mjs/);
  assert.doesNotMatch(workflow, /OPERATIONAL_GATE="\$gate" node scripts\/verify-operational-application-evidence\.mjs/);
});

test('Firebase operational replay verifies the canonical Founder TOTP token with Firebase Admin', async () => {
  const helper = await read('scripts/lib/firebase-mfa-sign-in.mjs');

  assert.match(helper, /accounts\/mfaSignIn:finalize/);
  assert.match(helper, /totpVerificationInfo: \{ verificationCode \}/);
  assert.match(helper, /verifyIdToken\(idToken, true\)/);
  assert.match(helper, /email !== CANONICAL_FOUNDER_EMAIL/);
  assert.match(helper, /CEO or Super Admin Founder authority/);
  assert.match(helper, /second_factor_identifier/);
  assert.match(helper, /secondFactorType !== 'totp'/);
  assert.doesNotMatch(helper, /response\.text\(\)/);
  assert.doesNotMatch(helper, /Buffer\.from\(parts\[1\]/);
});

test('finance replay requires MFA only for replay gates and serializes only verified factor hashes', async () => {
  const wrapper = await read('scripts/verify-operational-application-evidence-mfa.mjs');

  assert.match(wrapper, /MFA_REPLAY_GATES = new Set\(\['paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce'\]\)/);
  assert.match(wrapper, /const mfaRequired = MFA_REPLAY_GATES\.has\(gate\)/);
  assert.match(wrapper, /if \(mfaRequired\) \{/);
  assert.match(wrapper, /founderEmail !== 'ceo@bin-groups\.com'/);
  assert.match(wrapper, /signInWithRequiredTotpMfa/);
  assert.match(wrapper, /Operational finance replay attempted to use a non-Founder credential/);
  assert.match(wrapper, /verifiedMfa\?\.secondFactorType !== 'totp'/);
  assert.match(wrapper, /replayMfaVerified = true/);
  assert.match(wrapper, /replayActorUidHash = sha256\(verifiedMfa\.uid\)/);
  assert.match(wrapper, /replaySecondFactorHash = sha256\(verifiedMfa\.secondFactorIdentifier\)/);
  assert.doesNotMatch(wrapper, /proof\.evidence\.secondFactor\s*=/);
  assert.doesNotMatch(wrapper, /proof\.evidence\.idToken\s*=/);
});

test('application selectors and provenance both paginate before selecting production records', async () => {
  const [wrapper, provenance] = await Promise.all([
    read('scripts/verify-operational-application-evidence-mfa.mjs'),
    read('scripts/verify-operational-application-provenance.mjs'),
  ]);

  for (const source of [wrapper, provenance]) {
    assert.match(source, /const PAGE_SIZE = 250/);
    assert.match(source, /readAllMatchingDocuments/);
    assert.match(source, /FieldPath\.documentId\(\)/);
    assert.match(source, /startAfter\(cursor\)/);
  }
  for (const label of [
    'approved-payment selector',
    'notification selector',
    'Broker commission selector',
    'staff-audit selector',
    'renewal-watch selector',
  ]) assert.match(wrapper, new RegExp(label));
  assert.match(provenance, /const documents = await readAllMatchingDocuments\(query\)/);
  assert.match(provenance, /scannedDocumentCount: documents\.length/);
  assert.match(provenance, /entry\.observedMs >= deployedAt\.getTime\(\)/);
  assert.doesNotMatch(provenance, /const snapshot = await query\.limit\(100\)\.get\(\)/);
});
