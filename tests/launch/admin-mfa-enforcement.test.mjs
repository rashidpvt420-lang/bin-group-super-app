import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildAdminMfaEvidence,
  claimsGrantAdminPortal,
  recoveryApproverRole,
  summarizeAdminMfaUsers,
  validateAdminMfaEvidence,
} from '../../scripts/verify-admin-mfa-production.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const SHA = 'a'.repeat(40);
const ENV = {
  GITHUB_SHA: SHA,
  GITHUB_REPOSITORY: 'rashidpvt420-lang/bin-group-super-app',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_RUN_ID: '12345',
  GITHUB_RUN_ATTEMPT: '2',
};

const phoneFactor = { uid: 'factor-1', factorId: 'phone', displayName: 'Admin phone' };
const user = (claims, factors = [phoneFactor], disabled = false, options = {}) => ({
  uid: options.uid || `user-${Math.random()}`,
  customClaims: claims,
  disabled,
  emailVerified: options.emailVerified !== false,
  profileExists: options.profileExists !== false,
  profile: options.profile || { status: 'active' },
  multiFactor: { enrolledFactors: factors },
});

const readyAdminUsers = () => [
  user({ role: 'ceo', ceo: true }, [phoneFactor], false, { uid: 'ceo-1' }),
  user({ role: 'super_admin', superAdmin: true }, [phoneFactor], false, { uid: 'super-1' }),
  user({ role: 'finance_admin' }, [phoneFactor], false, { uid: 'finance-1' }),
  user({ role: 'admin' }, [], true, { uid: 'disabled-admin' }),
  user({ role: 'tenant' }, [], false, { uid: 'tenant-1' }),
];

test('Admin portal claims, profile state, phone MFA and recovery quorum are fail closed', () => {
  assert.equal(claimsGrantAdminPortal({ role: 'admin' }), true);
  assert.equal(claimsGrantAdminPortal({ role: 'dispatcher' }), true);
  assert.equal(claimsGrantAdminPortal({ admin: true }), true);
  assert.equal(claimsGrantAdminPortal({ role: 'tenant' }), false);
  assert.equal(recoveryApproverRole({ role: 'ceo' }), 'ceo');
  assert.equal(recoveryApproverRole({ superAdmin: true }), 'super_admin');
  assert.equal(recoveryApproverRole({ role: 'admin' }), '');

  const ready = summarizeAdminMfaUsers(readyAdminUsers());
  assert.equal(ready.ok, true, ready.failures.join('\n'));
  assert.equal(ready.summary.activeAdminCount, 3);
  assert.equal(ready.summary.phoneMfaEnrolledCount, 3);
  assert.equal(ready.summary.disabledAdminCount, 1);
  assert.equal(ready.summary.recoveryApproverCandidateCount, 2);
  assert.equal(ready.summary.recoveryApproverMfaReadyCount, 2);
  assert.equal(ready.summary.recoveryCeoCount, 1);
  assert.equal(ready.summary.recoverySuperAdminCount, 1);
  assert.equal(ready.summary.recoveryQuorumReady, true);
  assert.equal(ready.summary.allActiveAdminsPhoneMfaReady, true);

  const missing = summarizeAdminMfaUsers([
    user({ role: 'ceo' }, [], false, { uid: 'ceo-no-factor' }),
    user({ role: 'super_admin' }, [phoneFactor], false, { uid: 'super-unverified', emailVerified: false }),
    user({ role: 'manager' }, [{ uid: 'totp-1', factorId: 'totp' }], false, { uid: 'manager-totp' }),
  ]);
  assert.equal(missing.ok, false);
  assert.equal(missing.summary.missingPhoneFactorCount, 2);
  assert.equal(missing.summary.unsupportedOnlyFactorCount, 1);
  assert.equal(missing.summary.recoveryApproverMfaReadyCount, 0);
  assert.equal(missing.summary.recoveryApproverEmailUnverifiedCount, 1);
  assert.equal(missing.summary.recoveryApproverMissingPhoneFactorCount, 1);
  assert.match(missing.failures.join('\n'), /no enrolled phone MFA factor/);
  assert.match(missing.failures.join('\n'), /verified email and phone MFA/);

  const profileMissing = summarizeAdminMfaUsers([
    user({ role: 'ceo' }, [phoneFactor], false, { uid: 'ceo-profile-missing', profileExists: false }),
    user({ role: 'super_admin' }, [phoneFactor], false, { uid: 'super-ready' }),
  ]);
  assert.equal(profileMissing.ok, false);
  assert.equal(profileMissing.summary.missingAdminProfileCount, 1);
  assert.match(profileMissing.failures.join('\n'), /no Firestore user profile/);

  const inactive = summarizeAdminMfaUsers([
    user({ role: 'ceo' }, [phoneFactor], false, { uid: 'ceo-inactive', profile: { status: 'suspended' } }),
    user({ role: 'super_admin' }, [phoneFactor], false, { uid: 'super-ready' }),
  ]);
  assert.equal(inactive.ok, false);
  assert.equal(inactive.summary.inactiveProfileAdminCount, 1);
  assert.match(inactive.failures.join('\n'), /At least two distinct active CEO\/Super Admin/);

  const none = summarizeAdminMfaUsers([user({ role: 'tenant' }, [])]);
  assert.equal(none.ok, false);
  assert.match(none.failures.join('\n'), /No active Firebase Auth account/);
});

test('Admin MFA evidence is aggregate-only, exact-run bound and requires a recovery quorum', () => {
  const summary = summarizeAdminMfaUsers(readyAdminUsers()).summary;
  const now = new Date('2026-07-18T12:00:00.000Z');
  const evidence = buildAdminMfaEvidence(summary, { env: ENV, now });
  const failures = validateAdminMfaEvidence(evidence, {
    commitSha: SHA,
    repository: ENV.GITHUB_REPOSITORY,
    ref: ENV.GITHUB_REF,
    workflowRunId: ENV.GITHUB_RUN_ID,
    workflowRunAttempt: 2,
    now: now.getTime(),
  });
  assert.deepEqual(failures, []);
  assert.equal(evidence.schemaVersion, 2);
  assert.equal(evidence.activeAdminCount, 3);
  assert.equal(evidence.phoneMfaEnrolledCount, 3);
  assert.equal(evidence.recoveryApproverCandidateCount, 2);
  assert.equal(evidence.recoveryApproverMfaReadyCount, 2);
  assert.equal(evidence.recoveryQuorumReady, true);
  assert.equal(evidence.sensitiveValuesExcluded, true);
  assert.equal(evidence.hardLaunchClaim, false);
  assert.doesNotMatch(JSON.stringify(evidence), /@|phoneNumber|displayName|factorUid|user-/);

  const tamperedFactor = { ...evidence, missingPhoneFactorCount: 1 };
  assert.match(validateAdminMfaEvidence(tamperedFactor, {
    commitSha: SHA,
    repository: ENV.GITHUB_REPOSITORY,
    ref: ENV.GITHUB_REF,
    workflowRunId: ENV.GITHUB_RUN_ID,
    workflowRunAttempt: 2,
    now: now.getTime(),
  }).join('\n'), /missing phone factors/);

  const tamperedQuorum = {
    ...evidence,
    recoveryApproverCandidateCount: 1,
    recoveryApproverMfaReadyCount: 1,
    recoveryQuorumReady: false,
  };
  assert.match(validateAdminMfaEvidence(tamperedQuorum, {
    commitSha: SHA,
    repository: ENV.GITHUB_REPOSITORY,
    ref: ENV.GITHUB_REF,
    workflowRunId: ENV.GITHUB_RUN_ID,
    workflowRunAttempt: 2,
    now: now.getTime(),
  }).join('\n'), /recovery quorum|at least two recovery approver/i);
});

test('Admin profile exposes real Firebase phone MFA enrollment and forces re-login', async () => {
  const enrollment = await read('apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx');
  const profile = await read('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx');
  assert.match(enrollment, /multiFactor\(user\)\.getSession\(\)/);
  assert.match(enrollment, /PhoneAuthProvider/);
  assert.match(enrollment, /PhoneMultiFactorGenerator\.assertion/);
  assert.match(enrollment, /multiFactor\(user\)\.enroll/);
  assert.match(enrollment, /RecaptchaVerifier/);
  assert.match(enrollment, /signOut\(auth\)/);
  assert.match(enrollment, /admin-mfa-enrollment-card/);
  assert.doesNotMatch(enrollment, /localStorage\.setItem\([^\n]*code/i);
  assert.match(profile, /AdminMfaEnrollmentCard/);
  assert.match(profile, /admin-mfa-enrollment-required/);
});

test('Admin email login resolves Firebase MFA and Google redirect path is disabled', async () => {
  const login = await read('apps/admin-panel/src/components/UnifiedLogin.tsx');
  const challenge = await read('apps/admin-panel/src/components/security/AdminMfaSignInChallenge.tsx');
  assert.match(login, /auth\/multi-factor-auth-required/);
  assert.match(login, /getMultiFactorResolver\(auth, err\)/);
  assert.match(login, /AdminMfaSignInChallenge/);
  assert.match(login, /admin-google-login-disabled/);
  assert.doesNotMatch(login, /signInWithRedirect/);
  assert.doesNotMatch(login, /GoogleAuthProvider/);
  assert.match(challenge, /multiFactorHint: hint/);
  assert.match(challenge, /resolver\.session/);
  assert.match(challenge, /resolver\.resolveSignIn\(assertion\)/);
  assert.match(challenge, /PhoneMultiFactorGenerator\.FACTOR_ID/);
});

test('Admin auth and protected routes restrict unenrolled or non-MFA sessions', async () => {
  const context = await read('apps/admin-panel/src/context/AuthContext.tsx');
  const route = await read('apps/admin-panel/src/components/ProtectedRoute.tsx');
  assert.match(context, /multiFactor\(firebaseUser\)\.enrolledFactors/);
  assert.match(context, /firebaseClaims\.sign_in_second_factor/);
  assert.match(context, /factorCount > 0 && !verifiedSecondFactor/);
  assert.match(context, /ADMIN_MFA_REQUIRED/);
  assert.match(context, /mfaEnrollmentRequired/);
  assert.match(route, /location\.pathname === '\/profile'/);
  assert.match(route, /mfaEnrollmentRequired && !isMfaEnrollmentRoute/);
  assert.match(route, /mfaFactorCount > 0 && !mfaVerified/);
});

test('Admin security callables require second-factor claims once enrolled', async () => {
  const backend = await read('functions/adminSecurityProfile.ts');
  assert.match(backend, /firebase\?\.sign_in_second_factor/);
  assert.match(backend, /mfaFactorCount > 0 && !mfaVerified/);
  assert.match(backend, /requireMfaReady\(adminActor\)/g);
  assert.match(backend, /ADMIN_REVOKE_ALL_SESSIONS_WITH_MFA/);
  assert.match(backend, /ADMIN_EMERGENCY_SELF_LOCK_WITH_MFA/);
  assert.match(backend, /enforceAppCheck: true/g);
});

test('production deploy requires profile-backed recovery quorum before the first Firebase deployment', async () => {
  const deploy = await read('scripts/deploy-firebase-production.mjs');
  const phone = deploy.indexOf('await verifyFirebasePhoneAuthProduction');
  const accounts = deploy.indexOf('await verifyAdminMfaProduction');
  const firebaseDeploy = deploy.search(/retryFirebase\(\s*['"]functions,hosting,firestore:rules,firestore:indexes,storage['"]/);
  const metadata = deploy.indexOf('deploymentMetadata.adminMfa = adminMfaEvidence');
  const verify = deploy.indexOf("'scripts/verify-production-deployment.mjs'");
  assert.ok(accounts > phone);
  assert.ok(firebaseDeploy > accounts);
  assert.ok(metadata > firebaseDeploy);
  assert.ok(verify > metadata);
  assert.match(deploy, /Admin MFA production preflight failed/);

  const preflight = await read('scripts/verify-admin-mfa-production.mjs');
  assert.match(preflight, /RECOVERY_APPROVER_ROLES/);
  assert.match(preflight, /recoveryApproverMfaReadyCount < 2/);
  assert.match(preflight, /recoveryQuorumReady/);
  assert.match(preflight, /db\.collection\('users'\)\.doc\(user\.uid\)/);
  assert.match(preflight, /await db\.getAll/);
  assert.match(preflight, /sensitiveValuesExcluded: true/);

  const deploymentVerifier = await read('scripts/verify-production-deployment.mjs');
  assert.match(deploymentVerifier, /validateAdminMfaEvidence/);
  assert.match(deploymentVerifier, /existing\.adminMfa/);
});
