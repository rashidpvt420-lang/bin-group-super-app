import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin MFA remediation inventory is canonical-founder protected, read-only and masked', async () => {
  const source = await read('functions/adminMfaReadiness.ts');
  assert.match(source, /export const getAdminMfaReadinessOverview = onCall/);
  assert.match(source, /enforceAppCheck: true/);
  assert.match(source, /CANONICAL_FOUNDER_EMAIL = "ceo@bin-groups\.com"/);
  assert.match(source, /FOUNDER_ROLES = new Set\(\["ceo", "super_admin"\]\)/);
  assert.match(source, /The canonical BIN GROUP founder account is required/);
  assert.match(source, /lower\(userRecord\.email, 320\) !== CANONICAL_FOUNDER_EMAIL/);
  assert.match(source, /function maskedEmail/);
  assert.match(source, /emailMasked: maskedEmail/);
  assert.match(source, /sensitiveValuesExcluded: true/);
  assert.match(source, /hardLaunchClaim: false/);
  assert.match(source, /EMAIL_UNVERIFIED/);
  assert.match(source, /PHONE_MFA_MISSING/);
  assert.match(source, /DELETE_REQUIRED/);
  assert.match(source, /unexpectedPrivilegedAccountCount/);
  assert.match(source, /founderSingletonReady/);
  assert.doesNotMatch(source, /updateUser\(|setCustomUserClaims\(|deleteUser\(|multiFactor:\s*\{\s*enrolledFactors:\s*null/);
});

test('Admin profile provides self-service email verification and phone MFA remediation', async () => {
  const source = await read('apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx');
  assert.match(source, /sendEmailVerification\(user/);
  assert.match(source, /email_verified=1/);
  assert.match(source, /admin-send-email-verification/);
  assert.match(source, /admin-refresh-email-verification/);
  assert.match(source, /getAdminMfaReadinessOverview/);
  assert.match(source, /admin-mfa-readiness-overview/);
  assert.match(source, /Verify the Admin email before enrolling phone MFA/);
  assert.match(source, /multiFactor\(user\)\.enroll/);
  assert.doesNotMatch(source, /setCustomUserClaims|updateUser\(|deleteUser\(/);
});

test('Functions runtime and protected bootstrap export only the remediation callable needed before coverage passes', async () => {
  const [runtime, deploy] = await Promise.all([
    read('functions/runtime.ts'),
    read('scripts/deploy-firebase-production.mjs'),
  ]);
  assert.match(runtime, /export \* from "\.\/adminMfaReadiness"/);
  assert.match(deploy, /'getAdminMfaReadinessOverview'/);
  assert.match(deploy, /functions\/adminMfaReadiness\.ts/);
  assert.match(deploy, /Mobile Admin email\/MFA remediation controls are not present/);
  assert.match(deploy, /mfaGateBypassed: false/);
  assert.match(deploy, /hardLaunchClaim: false/);
});
