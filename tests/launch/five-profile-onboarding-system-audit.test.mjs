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

test('property onboarding is a real five-page inspection-first Owner workflow', async () => {
  const [page, store, account, finalSubmission, backend, intakeAdmin, paymentAdmin, asset] = await Promise.all([
    read('src/pages/PropertyOnboardingPage.tsx'),
    read('src/store/onboardingStore.ts'),
    read('src/components/onboarding/AccountCreationStep.tsx'),
    read('src/components/onboarding/InspectionSubmissionStep.tsx'),
    read('functions/inspectionFirstOwnerOnboarding.ts'),
    read('apps/admin-panel/src/pages/admin/IntakeVaultPage.tsx'),
    read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx'),
    read('src/components/onboarding/AssetProfileStep.tsx'),
  ]);

  assert.match(page, /PAGE_COUNT = 5/);
  assert.match(page, /pageProgress = safePage \* 20/);
  assert.match(page, /InspectionSubmissionStep/);
  assert.doesNotMatch(page, /PaymentSummaryStep|PaymentSubmissionStep|INTERNAL_STEP_COUNT\s*=\s*11/);
  assert.ok(page.indexOf('<CompanyProfileStep') < page.indexOf('<AccountCreationStep'));
  assert.ok(page.indexOf('<AccountCreationStep') < page.indexOf('<AssetProfileStep'));
  assert.match(page, /Submit for Visit/);
  assert.match(page, /dir=\{isRTL \? ['"]rtl['"] : ['"]ltr['"]\}/);
  assert.match(page, ARABIC);

  assert.match(account, /createUserWithEmailAndPassword/);
  assert.match(account, /sendEmailVerification/);
  assert.match(account, /upsertOwnerOnboardingProfile/);
  assert.doesNotMatch(account, /submitPendingOwnerRegistration/);
  assert.match(account, /No payment is collected on these five pages/);

  assert.match(finalSubmission, /submitOwnerInspectionFirstOnboarding/);
  assert.match(finalSubmission, /uploadOwnerInspectionProofDocument/);
  assert.match(finalSubmission, /No payment is collected now/);
  assert.doesNotMatch(finalSubmission, /paymentReceipt|createStripeCheckoutSession/);

  assert.match(backend, /OWNER_FIVE_PAGE_INSPECTION_FIRST_V1/);
  assert.match(backend, /SUBMITTED_FOR_PROPERTY_INSPECTION/);
  assert.match(backend, /NOT_DUE_UNTIL_INSPECTION_COMPLETE/);
  assert.match(backend, /INSPECTION_REQUIRED_BEFORE_PAYMENT/);
  assert.match(backend, /adminRecordOwnerMobilizationPaymentEvidence/);
  assert.match(backend, /Number\(quote\.annualContractValue\) \* 0\.15/);

  assert.match(intakeAdmin, /adminCreateOwnerPropertyInspection/);
  assert.match(intakeAdmin, /adminLinkOwnerPropertyInspection/);
  assert.match(intakeAdmin, /adminCompleteOwnerPortfolioInspections/);
  assert.match(intakeAdmin, /RECORD 15% & APPROVE/);
  assert.doesNotMatch(intakeAdmin, /approveOwnerSubmissionOperationalFlow/);

  assert.match(paymentAdmin, /adminRecordOwnerMobilizationPaymentEvidence/);
  assert.match(paymentAdmin, /adminApprovePayment/);
  assert.match(paymentAdmin, /inspectionVerified/);
  assert.match(paymentAdmin, /Verify 15% & Approve Owner/);

  assert.match(store, /OWNER_PAGE_COUNT = 5/);
  assert.match(store, /version: 5/);
  const persistence = store.slice(store.indexOf('partialize:'), store.indexOf('partialize:') + 1400);
  assert.match(persistence, /companyProfile/);
  assert.match(persistence, /ownerAccount/);
  assert.match(persistence, /properties/);
  assert.match(persistence, /proofDocuments/);
  assert.doesNotMatch(persistence, /password|paymentManifest|paymentMethod/);

  assert.match(asset, /Mosque \/ Masjid/);
  assert.match(asset, /ASSESSMENT_REQUIRED/);
  assert.match(asset, /اسم المسجد/);
  assert.match(asset, /مساحة المسجد المقاسة/);
});

test('resolved profile-audit gaps remain executable launch contracts', async () => {
  const [
    ownerPhone,
    ownerProfileBackend,
    tenantProfile,
    tenantPanel,
    tenantBackend,
    technicianPage,
    technicianBackend,
    brokerCommissions,
    brokerPayout,
    quoteBackend,
    adminEnrollment,
    adminLogin,
    adminAuth,
  ] = await Promise.all([
    read('src/owner/components/OwnerPhoneVerificationCard.tsx'),
    read('functions/secureOwnerProfileOperations.ts'),
    read('src/tenant/pages/TenantProfilePage.tsx'),
    read('src/tenant/components/TenantCorrectionPanel.tsx'),
    read('functions/tenantCorrectionOperations.ts'),
    read('src/technician/pages/TechnicianProfilePage.tsx'),
    read('functions/secureTechnicianProfileOperations.ts'),
    read('src/broker/pages/BrokerCommissionsPage.tsx'),
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

  assert.match(tenantProfile, /const activeResidences = useMemo/);
  assert.match(tenantProfile, /const historicalResidences = useMemo/);
  assert.match(tenantProfile, /isHistoricalResidence/);
  assert.match(tenantProfile, /Lease start/);
  assert.match(tenantProfile, /Lease end/);
  assert.match(tenantPanel, /submitTenantCorrectionRequest/);
  assert.match(tenantPanel, /item\.events\.map/);
  assert.match(tenantBackend, /ADMIN_APPROVE_TENANT_CORRECTION/);
  assert.match(tenantBackend, /ADMIN_REJECT_TENANT_CORRECTION/);

  assert.match(technicianPage, /updateTechnicianProfilePreferences/);
  assert.match(technicianPage, /Identity, trade and dispatch authority are read-only/);
  assert.match(technicianPage, /Verified Full Name/);
  assert.match(technicianPage, /Verified Phone Number/);
  assert.match(technicianPage, /Approved Primary Trade/);
  assert.doesNotMatch(technicianPage, /\bsetDoc\s*\(/);
  assert.match(technicianBackend, /TECHNICIAN_PROFILE_PREFERENCES_UPDATED/);

  assert.match(brokerCommissions, /requestBrokerPayoutOtp/);
  assert.match(brokerCommissions, /verifyBrokerPayoutOtp/);
  assert.match(brokerCommissions, /submitBrokerPayoutRequest/);
  assert.match(brokerCommissions, /broker-payout-otp-dialog/);
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
  await t.test('Technician credential expiry, renewal evidence, and dispatch freeze on expired credentials', { todo: true });
  await t.test('Admin recovery-factor lifecycle and controlled factor replacement after device loss', { todo: true });
});
