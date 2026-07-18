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
  assert.match(adminPage, /AdminMfaEnrollmentCard/);
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

test('resolved profile-audit gaps remain executable launch contracts', async () => {
  const [
    ownerPhone,
    ownerProfileBackend,
    tenantPanel,
    tenantBackend,
    technicianPage,
    technicianBackend,
    brokerProfile,
    brokerPayout,
    quoteBackend,
    adminEnrollment,
    adminLogin,
    adminAuth,
  ] = await Promise.all([
    read('src/owner/components/OwnerPhoneVerificationCard.tsx'),
    read('functions/secureOwnerProfileOperations.ts'),
    read('src/tenant/components/TenantCorrectionPanel.tsx'),
    read('functions/tenantCorrectionOperations.ts'),
    read('src/technician/pages/TechnicianProfilePage.tsx'),
    read('functions/secureTechnicianProfileOperations.ts'),
    read('src/broker/pages/BrokerProfilePage.tsx'),
    read('functions/secureBrokerPayoutOperations.ts'),
    read('functions/ownerPortfolioQuote.ts'),
    read('apps/admin-panel/src/components/security/AdminMfaEnrollmentCard.tsx'),
    read('apps/admin-panel/src/components/UnifiedLogin.tsx'),
    read('apps/admin-panel/src/context/AuthContext.tsx'),
  ]);

  assert.match(ownerPhone, /updatePhoneNumber\(currentUser, credential\)/);
  assert.match(ownerPhone, /syncVerifiedOwnerPhone/);
  assert.match(ownerProfileBackend, /Owner full name must match the verified Owner KYC identity/);
  assert.match(ownerProfileBackend, /Billing email must match the verified account or verified billing email/);

  assert.match(tenantPanel, /submitTenantCorrectionRequest/);
  assert.match(tenantPanel, /item\.events\.map/);
  assert.match(tenantBackend, /ADMIN_APPROVE_TENANT_CORRECTION/);
  assert.match(tenantBackend, /ADMIN_REJECT_TENANT_CORRECTION/);

  assert.match(technicianPage, /updateTechnicianProfilePreferences/);
  assert.match(technicianPage, /technician-authoritative-trade/);
  assert.doesNotMatch(technicianPage, /\bsetDoc\s*\(/);
  assert.match(technicianBackend, /TECHNICIAN_PROFILE_PREFERENCES_UPDATED/);

  assert.match(brokerProfile, /requestBrokerPayoutOtp/);
  assert.match(brokerProfile, /verifyBrokerPayoutOtp/);
  assert.match(brokerPayout, /kycSubmissionHash/);
  assert.match(brokerPayout, /status: "CONSUMED"/);

  assert.match(quoteBackend, /QUOTE_TTL_MS/);
  assert.match(quoteBackend, /assertOwnerPortfolioQuoteRecord/);
  assert.match(quoteBackend, /pricingEngineVersion/);

  assert.match(adminEnrollment, /multiFactor\(user\)\.enroll/);
  assert.match(adminLogin, /getMultiFactorResolver/);
  assert.match(adminAuth, /sign_in_second_factor/);
});

test('protected same-commit English and Arabic role evidence remains wired', async () => {
  const [runner, owner, tenant, technician, broker, admin] = await Promise.all([
    read('scripts/run-critical-evidence.mjs'),
    read('tests/e2e/launch-audit-owner.spec.ts'),
    read('tests/e2e/launch-audit-tenant.spec.ts'),
    read('tests/e2e/launch-audit-technician.spec.ts'),
    read('tests/e2e/launch-audit-broker.spec.ts'),
    read('tests/e2e/launch-audit-admin.spec.ts'),
  ]);
  assert.match(runner, /launchAuditLive/);
  for (const [role, source] of Object.entries({ owner, tenant, technician, broker, admin })) {
    assert.match(source, /AppCheck|App Check|appCheck/i, `${role} audit has no App Check proof`);
    assert.match(source, /Arabic|AR\/EN|language|RTL|العربية/i, `${role} audit has no bilingual proof`);
  }
});

test('remaining profile gaps stay explicit until implemented', async (t) => {
  await t.test('Tenant multiple active and historical lease timeline with document-level evidence', { todo: true });
  await t.test('Technician credential expiry, renewal evidence, and dispatch freeze on expired credentials', { todo: true });
  await t.test('Admin recovery-factor lifecycle and controlled factor replacement after device loss', { todo: true });
});
