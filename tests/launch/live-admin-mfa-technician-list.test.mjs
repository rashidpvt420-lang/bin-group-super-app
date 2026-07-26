import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mfaSource = await readFile(
  new URL('../../apps/admin-panel/src/components/security/AdminMfaSignInChallenge.tsx', import.meta.url),
  'utf8',
);
const hardenerSource = await readFile(
  new URL('../../scripts/optimize-current-main-technician-ticket-rule.mjs', import.meta.url),
  'utf8',
);
const normalizerSource = await readFile(
  new URL('../../scripts/normalize-security-rules-test.mjs', import.meta.url),
  'utf8',
);
const jobsPageSource = await readFile(
  new URL('../../src/technician/pages/TechnicianJobsPage.tsx', import.meta.url),
  'utf8',
);

test('real Admin MFA keeps the verifier alive until the challenge resolves or resets', () => {
  const sendStart = mfaSource.indexOf('const sendCode = async () => {');
  const verifyStart = mfaSource.indexOf('const verifyCode = async () => {', sendStart);
  assert.ok(sendStart >= 0 && verifyStart > sendStart);
  const sendBlock = mfaSource.slice(sendStart, verifyStart);

  assert.match(sendBlock, /const verifier = new RecaptchaVerifier\(auth, recaptchaId, \{ size: 'invisible' \}\)/);
  assert.match(sendBlock, /provider\.verifyPhoneNumber\([\s\S]*?, verifier\)/);
  assert.match(sendBlock, /setVerificationId\(id\)/);
  assert.doesNotMatch(sendBlock, /await verifier\.render\(\)/);
  assert.match(sendBlock, /finally \{\s*setBusy\(false\);\s*\}/);
  assert.doesNotMatch(sendBlock.match(/finally \{[\s\S]*?\n    \}/)?.[0] || '', /clearVerifier/);
  assert.match(mfaSource, /await resolver\.resolveSignIn\(assertion\);\s*clearVerifier\(\);/);
  assert.match(mfaSource, /data-testid="admin-mfa-signin-error"/);
  assert.match(mfaSource, /data-testid="admin-mfa-recaptcha-container"/);
  assert.doesNotMatch(mfaSource, /appVerificationDisabledForTesting|bin-e2e-admin-mfa-test/);
});

test('technician jobs use an assignment-bound query backed by a narrow list rule', () => {
  assert.match(jobsPageSource, /where\('assignedTechnicianId', '==', user\.uid\)/);
  assert.match(hardenerSource, /function canListAssignedTechnicianTicket\(data\)/);
  assert.match(hardenerSource, /data\.get\('assignedTechnicianId', null\) == request\.auth\.uid/);
  assert.match(hardenerSource, /hasApprovedTechnicianRecord\(\) &&/);
  assert.match(hardenerSource, /isNotSuspended\(\);/);
  assert.match(hardenerSource, /allow list: if canListAssignedTechnicianTicket\(resource\.data\);/);
  assert.match(hardenerSource, /Assignment-bound technician list rule must exist exactly twice/);
  assert.match(normalizerSource, /technician-assigned-list-security-rules\.test\.js/);
});
