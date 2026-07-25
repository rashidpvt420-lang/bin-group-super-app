import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const mfaChallenge = await read('apps/admin-panel/src/components/security/AdminMfaSignInChallenge.tsx');
const unifiedLogin = await read('apps/admin-panel/src/components/UnifiedLogin.tsx');
const mfaManager = await read('scripts/manage-e2e-admin-mfa-test.mjs');
const tenantReview = await read('functions/tenantTicketReview.ts');
const technicianJobs = await read('src/technician/pages/TechnicianJobsPage.tsx');

 test('protected Admin MFA renders the verifier after reasserting test verification', () => {
  const enableIndex = mfaChallenge.indexOf('enableProtectedE2eVerification();');
  const createIndex = mfaChallenge.indexOf('new RecaptchaVerifier');
  const renderIndex = mfaChallenge.indexOf('await verifier.render()');
  const sendIndex = mfaChallenge.indexOf('provider.verifyPhoneNumber');

  assert.ok(enableIndex >= 0, 'protected browser verification must be reasserted inside the MFA challenge');
  assert.ok(createIndex > enableIndex, 'reCAPTCHA must be created only after protected verification is enabled');
  assert.ok(renderIndex > createIndex, 'the mock reCAPTCHA verifier must be rendered explicitly');
  assert.ok(sendIndex > renderIndex, 'Firebase may request the MFA code only after verifier rendering');
  assert.match(mfaChallenge, /window\.navigator\.webdriver === true/);
  assert.match(mfaChallenge, /ADMIN_HOSTS\.has\(window\.location\.hostname\)/);
  assert.match(mfaChallenge, /data-testid="admin-mfa-signin-error"/);
  assert.match(mfaChallenge, /data-testid="admin-mfa-recaptcha-container"/);
  assert.doesNotMatch(mfaChallenge, /verificationCode|mfaBypass|skipMfa/);
});

 test('protected Admin marker survives primary sign-in and is cleared only after resolution, cancellation, or terminal failure', () => {
  const enableStart = unifiedLogin.indexOf('const enableProtectedE2eMfaVerification');
  const enableEnd = unifiedLogin.indexOf('const clearProtectedE2eMfaMarker');
  const enableBody = unifiedLogin.slice(enableStart, enableEnd);
  assert.doesNotMatch(enableBody, /removeItem/);
  assert.match(unifiedLogin, /onResolved=\{\(\) => \{[\s\S]*clearProtectedE2eMfaMarker\(\)/);
  assert.match(unifiedLogin, /onCancel=\{\(\) => \{[\s\S]*clearProtectedE2eMfaMarker\(\)/);
  assert.match(unifiedLogin, /auth\.settings\.appVerificationDisabledForTesting = true/);
});

 test('Identity Platform fictional phone configuration is confirmed before and after use', () => {
  const updateIndex = mfaManager.indexOf('await updateTestPhoneNumbers(context.projectId, token, existing);');
  const confirmIndex = mfaManager.indexOf('await confirmTestPhoneConfig');
  const enrollIndex = mfaManager.indexOf('const updated = await auth.updateUser');
  assert.ok(updateIndex >= 0 && confirmIndex > updateIndex && enrollIndex > confirmIndex);
  assert.match(mfaManager, /CONFIG_CONFIRM_ATTEMPTS = 15/);
  assert.match(mfaManager, /confirmTestPhoneRemoved/);
  assert.doesNotMatch(mfaManager, /console\.log\([^\n]*verificationCode/);
});

 test('tenant completion callable accepts the canonical pending-tenant-approval state', () => {
  assert.match(tenantReview, /"COMPLETED_PENDING_TENANT_APPROVAL"/);
  const stateIndex = tenantReview.indexOf('"COMPLETED_PENDING_TENANT_APPROVAL"');
  const validationIndex = tenantReview.indexOf('validReviewStates.includes(currentStatus)');
  assert.ok(stateIndex >= 0 && validationIndex > stateIndex);
  assert.match(tenantReview, /status: "CLOSED"/);
  assert.match(tenantReview, /tenantApprovalStatus: "APPROVED"/);
});

 test('technician jobs query is identity-bound and normalizes lifecycle status client-side', () => {
  assert.match(technicianJobs, /where\('assignedTechnicianId', '==', user\.uid\)/);
  assert.match(technicianJobs, /ACTIVE_STATUS_SET\.has\(String\(job\.status \|\| ''\)\)/);
  assert.match(technicianJobs, /data-testid="technician-open-job-card"/);
  assert.match(technicianJobs, /data-testid="technician-jobs-load-error"/);
  assert.doesNotMatch(technicianJobs, /onSnapshotSplitIn/);
  assert.doesNotMatch(technicianJobs, /where\('status', 'in'/);
});
