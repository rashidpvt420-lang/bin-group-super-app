import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('protected Admin evidence prepares and cleans a real Firebase MFA factor', async () => {
  const [manager, runner, login, challenge] = await Promise.all([
    read('scripts/manage-e2e-admin-mfa-test.mjs'),
    read('scripts/run-critical-evidence.mjs'),
    read('apps/admin-panel/src/components/UnifiedLogin.tsx'),
    read('apps/admin-panel/src/components/security/AdminMfaSignInChallenge.tsx'),
  ]);
  assert.match(manager, /Identity Platform test-phone update failed/);
  assert.match(manager, /multiFactor:\s*\{\s*enrolledFactors/);
  assert.match(manager, /confirmTestPhoneRemoved/);
  assert.match(manager, /Canonical Founder protection refused/);
  assert.match(runner, /manage-e2e-admin-mfa-test\.mjs/);
  assert.match(runner, /E2E_ADMIN_MFA_MANAGED_EXTERNALLY/);
  assert.match(login, /navigator\.webdriver === true/);
  assert.match(login, /bin-e2e-admin-mfa-test/);
  assert.match(login, /appVerificationDisabledForTesting = true/);
  assert.match(challenge, /resolver\.resolveSignIn\(assertion\)/);
  assert.doesNotMatch(login, /signInWithCustomToken/);
  assert.doesNotMatch(challenge, /fake|bypass/i);
});

test('HR route exposes callable-only least-privilege staff provisioning', async () => {
  const [hr, access, provisioning] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx'),
    read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx'),
    read('functions/adminUserProvisioning.ts'),
  ]);
  assert.match(hr, /<StaffAccessPage\s*\/>/);
  assert.doesNotMatch(hr, /RegisterStaffDialog/);
  assert.match(access, /httpsCallable\(functions, 'adminCreateUser'\)/);
  assert.match(access, /httpsCallable\(functions, 'adminUpdateStaffAccess'\)/);
  assert.match(access, /httpsCallable\(functions, 'adminSetStaffStatus'\)/);
  assert.match(provisioning, /admin:\s*false/);
  assert.match(provisioning, /superAdmin:\s*false/);
  assert.match(provisioning, /ceo:\s*false/);
  assert.match(provisioning, /Module \$\{moduleKey\} is not allowed for role/);
});

test('Owner review, payment decisions and Broker payout review require MFA-backed Admin authority', async () => {
  const [propertyReview, paymentReview, payoutReview, runtime] = await Promise.all([
    read('functions/adminPropertyReview.ts'),
    read('functions/securePaymentApproval.ts'),
    read('functions/adminBrokerPayoutReview.ts'),
    read('functions/runtime.ts'),
  ]);
  assert.match(propertyReview, /sign_in_second_factor/);
  assert.match(propertyReview, /REVIEW_ROLES/);
  assert.doesNotMatch(propertyReview, /canonical BIN GROUP founder account is required/i);
  assert.match(paymentReview, /requireMfaFinanceAdmin/);
  assert.match(paymentReview, /enforceAppCheck:\s*true/g);
  assert.match(payoutReview, /sign_in_second_factor/);
  assert.match(payoutReview, /ADMIN_BROKER_PAYOUT_\$\{action\}/);
  assert.match(payoutReview, /idempotent/);
  assert.match(runtime, /adminReviewBrokerPayoutRequest/);
});

test('ticket re-dispatch remains readiness-gated and auditable when the current UI supplies no reason', async () => {
  const assignment = await read('functions/secureAdminTechnicianAssignment.ts');
  assert.match(assignment, /approvedAndReadyTechnician/);
  assert.match(assignment, /Admin portal manual technician reassignment/);
  assert.match(assignment, /ADMIN_PORTAL_DEFAULT/);
  assert.match(assignment, /ADMIN_REASSIGN_READY_TECHNICIAN/);
  assert.match(assignment, /previousStatus/);
});

test('Admin business E2E must prove transactional responsibilities, not only dashboard reachability', async () => {
  const spec = await read('tests/e2e/business-admin.spec.ts');
  for (const required of [
    'adminCreateUser',
    'ADMIN_APPROVE_PAYMENT',
    'adminReviewOwnerProperty',
    'adminReviewBrokerKyc',
    'adminReviewBrokerPayoutRequest',
    'adminAssignTechnician',
    'ADMIN_REASSIGN_READY_TECHNICIAN',
    'idempotent',
  ]) {
    assert.match(spec, new RegExp(required));
  }
  assert.match(spec, /readProtectedMfaRuntime/);
  assert.match(spec, /assertAuthenticatedFirebaseRead/);
});
