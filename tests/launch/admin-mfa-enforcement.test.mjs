import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildAdminMfaEvidence,
  CANONICAL_FOUNDER_EMAIL,
  claimsGrantAdminPortal,
  isCanonicalFounderAccount,
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

const phoneFactor = { uid: 'factor-1', factorId: 'phone', displayName: 'Founder phone' };
const user = (claims, factors = [phoneFactor], disabled = false, options = {}) => ({
  uid: options.uid || `user-${Math.random()}`,
  email: options.email || CANONICAL_FOUNDER_EMAIL,
  customClaims: claims,
  disabled,
  emailVerified: options.emailVerified !== false,
  profileExists: options.profileExists !== false,
  profile: options.profile || { status: 'active' },
  multiFactor: { enrolledFactors: factors },
});

const readyFounderUsers = () => [
  user({ role: 'ceo', ceo: true }, [phoneFactor], false, {
    uid: 'canonical-founder',
    email: CANONICAL_FOUNDER_EMAIL,
  }),
  user({ role: 'tenant' }, [], false, { uid: 'tenant-1', email: 'tenant@example.com' }),
];

const validate = (evidence, now) => validateAdminMfaEvidence(evidence, {
  commitSha: SHA,
  repository: ENV.GITHUB_REPOSITORY,
  ref: ENV.GITHUB_REF,
  workflowRunId: ENV.GITHUB_RUN_ID,
  workflowRunAttempt: 2,
  now,
});

test('Admin portal claims and canonical founder identity are fail closed', () => {
  assert.equal(claimsGrantAdminPortal({ role: 'admin' }), true);
  assert.equal(claimsGrantAdminPortal({ role: 'dispatcher' }), true);
  assert.equal(claimsGrantAdminPortal({ admin: true }), true);
  assert.equal(claimsGrantAdminPortal({ role: 'tenant' }), false);
  assert.equal(recoveryApproverRole({ role: 'ceo' }), 'ceo');
  assert.equal(recoveryApproverRole({ superAdmin: true }), 'super_admin');
  assert.equal(recoveryApproverRole({ role: 'admin' }), '');

  const founder = readyFounderUsers()[0];
  assert.equal(isCanonicalFounderAccount(founder), true);
  assert.equal(isCanonicalFounderAccount({ ...founder, email: 'other@bin-groups.com' }), false);

  const ready = summarizeAdminMfaUsers(readyFounderUsers());
  assert.equal(ready.ok, true, ready.failures.join('\n'));
  assert.equal(ready.summary.claimedAdminCount, 1);
  assert.equal(ready.summary.activeAdminCount, 1);
  assert.equal(ready.summary.phoneMfaEnrolledCount, 1);
  assert.equal(ready.summary.canonicalFounderCandidateCount, 1);
  assert.equal(ready.summary.canonicalFounderMfaReadyCount, 1);
  assert.equal(ready.summary.unexpectedPrivilegedAccountCount, 0);
  assert.equal(ready.summary.founderSingletonReady, true);
  assert.equal(ready.summary.recoveryQuorumReady, true);
});

test('any additional privileged account blocks production even when disabled or MFA ready', () => {
  const extraReady = summarizeAdminMfaUsers([
    ...readyFounderUsers(),
    user({ role: 'finance_admin' }, [phoneFactor], false, {
      uid: 'finance-extra',
      email: 'finance@bin-groups.com',
    }),
  ]);
  assert.equal(extraReady.ok, false);
  assert.equal(extraReady.summary.claimedAdminCount, 2);
  assert.equal(extraReady.summary.unexpectedPrivilegedAccountCount, 1);
  assert.match(extraReady.failures.join('\n'), /must be deleted/);

  const extraDisabled = summarizeAdminMfaUsers([
    ...readyFounderUsers(),
    user({ role: 'admin' }, [], true, {
      uid: 'disabled-extra',
      email: 'old-admin@bin-groups.com',
    }),
  ]);
  assert.equal(extraDisabled.ok, false);
  assert.equal(extraDisabled.summary.disabledAdminCount, 1);
  assert.equal(extraDisabled.summary.unexpectedPrivilegedAccountCount, 1);
  assert.match(extraDisabled.failures.join('\n'), /disabled instead of being deleted/);
});

test('canonical founder requires active profile, verified email and phone MFA', () => {
  const missingMfa = summarizeAdminMfaUsers([
    user({ role: 'ceo' }, [], false, { uid: 'founder-no-factor' }),
  ]);
  assert.equal(missingMfa.ok, false);
  assert.equal(missingMfa.summary.canonicalFounderMfaReadyCount, 0);
  assert.match(missingMfa.failures.join('\n'), /verified email and phone MFA/);

  const unverified = summarizeAdminMfaUsers([
    user({ role: 'ceo' }, [phoneFactor], false, { uid: 'founder-unverified', emailVerified: false }),
  ]);
  assert.equal(unverified.ok, false);
  assert.equal(unverified.summary.activeAdminEmailUnverifiedCount, 1);

  const profileMissing = summarizeAdminMfaUsers([
    user({ role: 'ceo' }, [phoneFactor], false, { uid: 'founder-profile-missing', profileExists: false }),
  ]);
  assert.equal(profileMissing.ok, false);
  assert.equal(profileMissing.summary.missingAdminProfileCount, 1);

  const inactive = summarizeAdminMfaUsers([
    user({ role: 'ceo' }, [phoneFactor], false, { uid: 'founder-inactive', profile: { status: 'suspended' } }),
  ]);
  assert.equal(inactive.ok, false);
  assert.equal(inactive.summary.inactiveProfileAdminCount, 1);
});

test('Admin MFA evidence is aggregate-only, exact-run bound and requires one founder', () => {
  const summary = summarizeAdminMfaUsers(readyFounderUsers()).summary;
  const now = new Date('2026-07-20T12:00:00.000Z');
  const evidence = buildAdminMfaEvidence(summary, { env: ENV, now });
  assert.deepEqual(validate(evidence, now.getTime()), []);
  assert.equal(evidence.schemaVersion, 3);
  assert.equal(evidence.claimedAdminCount, 1);
  assert.equal(evidence.activeAdminCount, 1);
  assert.equal(evidence.canonicalFounderCandidateCount, 1);
  assert.equal(evidence.canonicalFounderMfaReadyCount, 1);
  assert.equal(evidence.unexpectedPrivilegedAccountCount, 0);
  assert.equal(evidence.founderSingletonReady, true);
  assert.equal(evidence.sensitiveValuesExcluded, true);
  assert.equal(evidence.hardLaunchClaim, false);
  assert.doesNotMatch(JSON.stringify(evidence), /@|phoneNumber|displayName|factorUid|canonical-founder/);

  const tamperedExtra = { ...evidence, claimedAdminCount: 2, unexpectedPrivilegedAccountCount: 1, founderSingletonReady: false };
  assert.match(validate(tamperedExtra, now.getTime()).join('\n'), /exact privileged account count|unexpected privileged|singleton/i);

  const tamperedMfa = { ...evidence, missingPhoneFactorCount: 1, phoneMfaEnrolledCount: 0 };
  assert.match(validate(tamperedMfa, now.getTime()).join('\n'), /missing phone factors|phone-MFA/i);
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
  assert.match(profile, /AdminMfaEnrollmentCard/);
});

test('Admin email login resolves Firebase MFA and Google redirect path is disabled', async () => {
  const login = await read('apps/admin-panel/src/components/UnifiedLogin.tsx');
  const challenge = await read('apps/admin-panel/src/components/security/AdminMfaSignInChallenge.tsx');
  assert.match(login, /auth\/multi-factor-auth-required/);
  assert.match(login, /getMultiFactorResolver\(auth, err\)/);
  assert.match(login, /AdminMfaSignInChallenge/);
  assert.match(login, /admin-google-login-disabled/);
  assert.doesNotMatch(login, /signInWithRedirect/);
  assert.match(challenge, /resolver\.resolveSignIn\(assertion\)/);
});

test('Admin auth and protected routes restrict unenrolled or non-MFA sessions', async () => {
  const context = await read('apps/admin-panel/src/context/AuthContext.tsx');
  const route = await read('apps/admin-panel/src/components/ProtectedRoute.tsx');
  assert.match(context, /multiFactor\(firebaseUser\)\.enrolledFactors/);
  assert.match(context, /ADMIN_MFA_REQUIRED/);
  assert.match(route, /mfaEnrollmentRequired && !isMfaEnrollmentRoute/);
  assert.match(route, /mfaFactorCount > 0 && !mfaVerified/);
});

test('production deploy requires single-founder verification before Firebase deployment', async () => {
  const deploy = await read('scripts/deploy-firebase-production.mjs');
  const phone = deploy.indexOf('await verifyFirebasePhoneAuthProduction');
  const accounts = deploy.indexOf('await verifyAdminMfaProduction');
  const firebaseDeploy = deploy.search(/retryFirebase\(\s*['"]functions,hosting,firestore:rules,firestore:indexes,storage['"]/);
  assert.ok(accounts > phone);
  assert.ok(firebaseDeploy > accounts);

  const preflight = await read('scripts/verify-admin-mfa-production.mjs');
  assert.match(preflight, /CANONICAL_FOUNDER_EMAIL/);
  assert.match(preflight, /unexpectedPrivilegedAccountCount/);
  assert.match(preflight, /founderSingletonReady/);
  assert.doesNotMatch(preflight, /recoveryApproverMfaReadyCount < 2/);

  const deploymentVerifier = await read('scripts/verify-production-deployment.mjs');
  assert.match(deploymentVerifier, /validateAdminMfaEvidence/);
});
