import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('protected Admin evidence uses only enrolled real Firebase phone or TOTP factors', async () => {
  const [runner, protectedRunner, login, challenge, helper, readiness, workflow] = await Promise.all([
    read('scripts/run-critical-evidence.mjs'),
    read('scripts/run-protected-business-evidence.mjs'),
    read('apps/admin-panel/src/components/UnifiedLogin.tsx'),
    read('apps/admin-panel/src/components/security/AdminMfaSignInChallenge.tsx'),
    read('tests/e2e/helpers/adminMfa.ts'),
    read('scripts/verify-founder-totp-readiness.mjs'),
    read('.github/workflows/admin-production-evidence.yml'),
  ]);
  assert.match(login, /auth\/multi-factor-auth-required/);
  assert.match(login, /getMultiFactorResolver\(auth, err\)/);
  assert.match(challenge, /PhoneAuthProvider/);
  assert.match(challenge, /TotpMultiFactorGenerator\.assertionForSignIn/);
  assert.match(challenge, /resolver\.resolveSignIn\(assertion\)/);
  assert.match(helper, /generateTotp/);
  assert.match(runner, /E2E_FOUNDER_TOTP_SECRET/);
  assert.match(readiness, /factorId\) === 'totp'/);
  assert.match(readiness, /totpFactorCount:\s*1/);
  assert.match(workflow, /Verify canonical Founder TOTP readiness/);
  assert.match(workflow, /run-critical-evidence\.mjs --suite adminCredentialLogin/);
  assert.match(protectedRunner, /real_firebase_mfa_only=true/);
  for (const source of [runner, protectedRunner, login, challenge, helper, readiness, workflow]) {
    assert.doesNotMatch(source, /appVerificationDisabledForTesting|testPhoneNumbers|fictional[- ]phone|signInWithCustomToken/);
  }
});

test('HR route retains the complete registry and exposes callable-only least-privilege staff provisioning', async () => {
  const [hr, access, provisioning, roles] = await Promise.all([
    read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx'),
    read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx'),
    read('functions/adminUserProvisioning.ts'),
    read('apps/admin-panel/src/constants/staffRoles.ts'),
  ]);
  assert.match(hr, /const filteredStaff = useMemo/);
  assert.match(hr, /where\('role', 'in', STAFF_ROLE_VALUES\)/);
  assert.match(hr, /<StaffRegistryTable staff=\{filteredStaff\}/);
  assert.match(hr, /<StaffAccessPage\s*\/>/);
  assert.doesNotMatch(hr, /RegisterStaffDialog/);
  assert.doesNotMatch(hr, /where\('role',\s*'in',\s*\['technician'/);
  assert.match(access, /httpsCallable\(functions, 'adminCreateUser'\)/);
  assert.match(access, /httpsCallable\(functions, 'adminUpdateStaffAccess'\)/);
  assert.match(access, /httpsCallable\(functions, 'adminSetStaffStatus'\)/);
  assert.match(roles, /STAFF_ROLE_VALUES/);
  assert.match(provisioning, /admin:\s*false/);
  assert.match(provisioning, /superAdmin:\s*false/);
  assert.match(provisioning, /ceo:\s*false/);
  assert.match(provisioning, /Module \$\{moduleKey\} is not allowed for role/);
  assert.match(lifecycle, /revokeRefreshTokens\(uid\)/);
  assert.match(lifecycle, /recordsPreserved:\s*true/);
  assert.match(lifecycle, /private_hr_profiles/);
  assert.match(hrOps, /enforceAppCheck:\s*true/g);
});

test('Founder review, payment decisions and Broker payout review require MFA-backed authority', async () => {
  const [propertyReview, paymentReview, payoutReview, runtime] = await Promise.all([
    read('functions/adminPropertyReview.ts'),
    read('functions/securePaymentApproval.ts'),
    read('functions/adminBrokerPayoutReview.ts'),
    read('functions/runtime.ts'),
  ]);
  assert.match(propertyReview, /ceo@bin-groups\.com/);
  assert.match(propertyReview, /sign_in_second_factor/);
  assert.match(propertyReview, /canonical BIN GROUP founder account is required/i);
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

test('Admin business E2E must prove transactional responsibilities, diagnostics and authenticated Firebase reads', async () => {
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
    'firebaseAuthStatus',
    'assertAuthenticatedFirestoreRead',
  ]) assert.match(spec, new RegExp(required));
});
