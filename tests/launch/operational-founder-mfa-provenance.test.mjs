import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('operational evidence injects canonical Founder credentials and uses the MFA-aware verifier', async () => {
  const workflow = await read('.github/workflows/operational-application-evidence.yml');

  assert.match(workflow, /E2E_FOUNDER_EMAIL:\s*\$\{\{ secrets\.E2E_FOUNDER_EMAIL \}\}/);
  assert.match(workflow, /E2E_FOUNDER_PASSWORD:\s*\$\{\{ secrets\.E2E_FOUNDER_PASSWORD \}\}/);
  assert.match(workflow, /E2E_FOUNDER_TOTP_SECRET:\s*\$\{\{ secrets\.E2E_FOUNDER_TOTP_SECRET \}\}/);
  assert.match(workflow, /node scripts\/verify-operational-application-evidence-mfa\.mjs/);
  assert.doesNotMatch(workflow, /OPERATIONAL_GATE="\$gate" node scripts\/verify-operational-application-evidence\.mjs/);
});

test('Firebase operational replay completes TOTP and rejects tokens without a second-factor claim', async () => {
  const helper = await read('scripts/lib/firebase-mfa-sign-in.mjs');

  assert.match(helper, /accounts\/mfaSignIn:finalize/);
  assert.match(helper, /totpVerificationInfo: \{ verificationCode \}/);
  assert.match(helper, /firebase\?\.sign_in_second_factor/);
  assert.match(helper, /const verified = requireMfaToken\(directToken\)/);
  assert.match(helper, /Firebase sign-in did not produce a verified second-factor session/);
});

test('finance replay is bound to the canonical Founder and serializes only MFA hashes', async () => {
  const wrapper = await read('scripts/verify-operational-application-evidence-mfa.mjs');

  assert.match(wrapper, /founderEmail !== 'ceo@bin-groups\.com'/);
  assert.match(wrapper, /signInWithRequiredTotpMfa/);
  assert.match(wrapper, /Operational finance replay attempted to use a non-Founder credential/);
  assert.match(wrapper, /MFA_REPLAY_GATES = new Set\(\['paymentUnlockExactlyOnce', 'brokerCommissionLockExactlyOnce'\]\)/);
  assert.match(wrapper, /!verifiedMfa\?\.uid \|\| !verifiedMfa\?\.secondFactor/);
  assert.match(wrapper, /replayMfaVerified = true/);
  assert.match(wrapper, /replayActorUidHash = sha256\(verifiedMfa\.uid\)/);
  assert.match(wrapper, /replaySecondFactorHash = sha256\(verifiedMfa\.secondFactor\)/);
  assert.doesNotMatch(wrapper, /proof\.evidence\.secondFactor\s*=/);
  assert.doesNotMatch(wrapper, /proof\.evidence\.idToken\s*=/);
});

test('operational provenance paginates the full matching collection before release-time filtering', async () => {
  const provenance = await read('scripts/verify-operational-application-provenance.mjs');

  assert.match(provenance, /const PAGE_SIZE = 250/);
  assert.match(provenance, /async function readAllMatchingDocuments/);
  assert.match(provenance, /FieldPath\.documentId\(\)/);
  assert.match(provenance, /startAfter\(cursor\)/);
  assert.match(provenance, /const documents = await readAllMatchingDocuments\(query\)/);
  assert.match(provenance, /scannedDocumentCount: documents\.length/);
  assert.match(provenance, /entry\.observedMs >= deployedAt\.getTime\(\)/);
  assert.doesNotMatch(provenance, /const snapshot = await query\.limit\(100\)\.get\(\)/);
});
