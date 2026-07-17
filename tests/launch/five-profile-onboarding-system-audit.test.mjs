import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const ARABIC = /[\u0600-\u06FF]/;

const roleProfiles = [
  ['Owner', 'src/owner/OwnerApp.tsx', 'src/owner/pages/OwnerProfilePage.tsx', 'OwnerProfilePage'],
  ['Tenant', 'src/tenant/TenantApp.tsx', 'src/tenant/pages/TenantProfilePage.tsx', 'TenantProfilePage'],
  ['Technician', 'src/technician/TechnicianApp.tsx', 'src/technician/pages/TechnicianProfilePage.tsx', 'TechnicianProfilePage'],
  ['Broker', 'src/broker/BrokerApp.tsx', 'src/broker/pages/BrokerProfilePage.tsx', 'BrokerProfilePage'],
];

test('all five roles expose protected, bilingual personal profile surfaces', async () => {
  for (const [role, routerPath, pagePath, component] of roleProfiles) {
    const [router, page] = await Promise.all([read(routerPath), read(pagePath)]);
    assert.match(router, new RegExp(`path=["']\\/profile["']`), `${role} has no /profile route`);
    assert.match(router, new RegExp(component), `${role} profile component is not routed`);
    assert.match(page, /useLanguage\(\)/, `${role} profile has no language state`);
    assert.match(page, /isRTL/, `${role} profile has no RTL state`);
    assert.match(page, ARABIC, `${role} profile contains no Arabic copy`);
    assert.match(page, /sendPasswordResetEmail/, `${role} profile has no account recovery`);
    assert.match(page, /<Avatar\b/, `${role} profile has no identity surface`);
  }

  const [adminRouter, adminPage] = await Promise.all([
    read('apps/admin-panel/src/App.tsx'),
    read('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx'),
  ]);
  assert.match(adminRouter, /path=["']\/profile["']\s+element=\{<ProtectedRoute adminOnly><AdminSecurityProfilePage \/><\/ProtectedRoute>\}/);
  assert.match(adminPage, /getAdminSecurityProfile/);
  assert.match(adminPage, /registerAdminSecuritySession/);
  assert.match(adminPage, /revokeAdminSessions/);
  assert.match(adminPage, /lockOwnAdminAccount/);
  assert.match(adminPage, /mfa\.enrolled/);
  assert.match(adminPage, ARABIC);
});

test('property onboarding preserves account-first, eleven-step, Arabic and recovery contracts', async () => {
  const [page, store, payment, asset] = await Promise.all([
    read('src/pages/PropertyOnboardingPage.tsx'),
    read('src/store/onboardingStore.ts'),
    read('src/components/onboarding/PaymentSummaryStep.tsx'),
    read('src/components/onboarding/AssetProfileStep.tsx'),
  ]);

  assert.match(page, /INTERNAL_STEP_COUNT = 11/);
  assert.ok(page.indexOf('case 2: return <AccountCreationStep') < page.indexOf('case 3: return <AssetProfileStep'));
  assert.match(page, /dir=\{isRTL \? ['"]rtl['"] : ['"]ltr['"]\}/);
  assert.match(page, ARABIC);
  assert.match(page, /if \(step !== safeStep\) setStep\(safeStep\)/);
  assert.match(store, /partialize:\s*\(state\)\s*=>\s*\(\{\s*step:\s*state\.step,\s*intakeId:\s*state\.intakeId/);
  assert.doesNotMatch(store.slice(store.indexOf('partialize:'), store.indexOf('partialize:') + 260), /password|kycUrls|paymentManifest|signatureName|proofDocuments/);
  assert.match(payment, /getOwnerPaymentConfiguration/);
  assert.match(payment, /Math\.round\(annualTotal \* 0\.15\)/);
  assert.match(payment, /configHash/);
  assert.match(payment, ARABIC);
  assert.match(asset, /Mosque \/ Masjid/);
  assert.match(asset, /ASSESSMENT_REQUIRED/);
  assert.match(asset, /اسم المسجد مطلوب/);
});

test('profile audit keeps sensitive role-specific gaps visible', async (t) => {
  await t.test('Owner phone OTP and billing identity matching', { todo: true });
  await t.test('Tenant multiple active and historical lease records', { todo: true });
  await t.test('Tenant unit-link correction audit and rejection workflow', { todo: true });
  await t.test('Technician server-side credential expiry and unified dispatch gate', { todo: true });
  await t.test('Broker withdrawal MFA and immutable payout history', { todo: true });
  await t.test('Owner quote expiry and server plan mapping', { todo: true });
  await t.test('Protected five-role English and Arabic Playwright journeys', { todo: true });
});
