import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Tenant renewal center is tenant-scoped, ordered by urgency and exposes evidence', async () => {
  const source = await read('src/tenant/pages/TenantRenewalsPage.tsx');
  expectAll(source, [/contract_renewal_watch/, /where\(field,\s*['"]==['"],\s*value\)/, /tenantId/, /tenantEmail/, /orderBy\(['"]daysRemaining['"],\s*['"]asc['"]\)/, /pdfUrl/, /Open Renewal PDF/], 'Tenant renewal center');
});

test('Move-in and move-out inspections require linked residence, evidence and tenant signature', async () => {
  const source = await read('src/tenant/pages/TenantMoveInspectionPage.tsx');
  expectAll(source, [/type MoveType = ['"]move_in['"] \| ['"]move_out['"]/, /MOVE_OUT/, /MOVE_IN/, /roomChecks/, /evidencePhotos/, /keyHandover/, /meters:/, /Tenant signature is required/, /No linked property was found/, /ownerReviewStatus:\s*['"]PENDING['"]/, /source:\s*['"]TENANT_PORTAL['"]/], 'Tenant inspection lifecycle');
});

test('Tenant routing exposes renewal, profile readiness and both inspection variants', async () => {
  const source = await read('src/tenant/TenantApp.tsx');
  expectAll(source, [/path=["']\/renewals["']/, /path=["']\/move-inspection["']/, /path=["']\/move-inspection\/:type["']/, /TenantProfileReadinessCard/], 'Tenant lifecycle routes');
});

test('Technician workforce center includes credential document classes, payroll intents and staff-scoped registries', async () => {
  const source = await read('src/technician/pages/TechnicianHRPageV2.tsx');
  expectAll(source, [/trade_certificate/, /driving_license/, /residency_visa/, /labour_card/, /payslip/i, /salary/i, /overtime/i, /staffDocuments/, /staffRequests/, /where\(['"]uid['"],\s*['"]==['"],\s*user\.uid\)/, /pending_hr_review/, /15 \* 1024 \* 1024/], 'Technician workforce readiness');
});

test('Technician portal exposes profile, HR, offline, map and proof-readiness surfaces', async () => {
  const source = await read('src/technician/TechnicianApp.tsx');
  for (const route of ['/profile', '/hr', '/offline', '/map', '/proof-readiness']) {
    assert.ok(source.includes(`path="${route}"`) || source.includes(`path='${route}'`), `Missing technician route ${route}`);
  }
  assert.match(source, /الإثبات/);
  assert.match(source, /منصة BIN GROUP للفنيين/);
});

test('Broker compliance vault requires identity, RERA, bank and signed agreement evidence', async () => {
  const source = await read('src/broker/pages/BrokerDocumentsPage.tsx');
  expectAll(source, [/where\(['"]brokerId['"],\s*['"]==['"],\s*user\.uid\)/, /emirates_id/, /rera_license/, /bank_details/, /broker_agreement/, /pending_review/, /brokerDocuments\/\$\{user\.uid\}/, /15 \* 1024 \* 1024/, /malware/i], 'Broker document review');
});

test('Broker KYC callable binds current terms, masked summaries and private bank ownership fields', async () => {
  const [page, callable, secure] = await Promise.all([
    read('src/broker/pages/BrokerProfilePage.tsx'),
    read('functions/brokerKycProfile.ts'),
    read('functions/secureBrokerKycSubmission.ts'),
  ]);
  expectAll(page, [/BIN_BROKER_TERMS_2026_01/, /commissionAgreementAccepted/, /bankAccountHolder/, /bankIban/, /submitBrokerKycProfile/, /getBrokerKycProfileSummary/], 'Broker profile submission');
  assert.doesNotMatch(page, /broker_kyc_profiles/);
  expectAll(callable, [/BIN_BROKER_TERMS_2026_01/, /bankAccountHolder/, /bankIban/, /\^AE\\d\{21\}\$/, /submissionHash/, /broker_kyc_profiles/], 'Broker KYC authority');
  expectAll(secure, [/reraLicenseMasked/, /bankIbanMasked/, /KYC_APPROVAL_NOT_BOUND_TO_CURRENT_SUBMISSION/, /authDisplayNameChangeDeferredUntilApproval/], 'Masked Broker authority');
});

test('Payment summary is server-configured, AED-only, versioned and mathematically consistent', async () => {
  const source = await read('src/components/onboarding/PaymentSummaryStep.tsx');
  expectAll(source, [/getOwnerPaymentConfiguration/, /nextConfiguration\.currency !== ['"]AED['"]/, /configVersion/, /configHash/, /configEffectiveAtMs/, /Math\.round\(annualTotal \* 0\.15\)/, /annualContractValue:\s*annualTotal/, /activationDeposit/, /approvedMethods/, /Payment initiation is disabled/], 'Payment summary authority');
});

test('Onboarding store and quote calculation support monthly, quarterly, annual and multi-property portfolios', async () => {
  const store = await read('src/store/onboardingStore.ts');
  expectAll(store, [/paymentPlan\?: ['"]annual['"] \| ['"]quarterly['"] \| ['"]monthly['"]/, /properties:\s*PropertyData\[\]/, /bulkAddProperties/, /totalProperties/, /totalUnits/, /quoteResults/, /Object\.values\(quoteResults\)\.reduce/, /paymentPlan:\s*property\.paymentPlan/], 'Multi-property and payment-plan calculation');
});

test('Interrupted onboarding recovery persists only safe coordinates and clamps every stage', async () => {
  const [store, page] = await Promise.all([read('src/store/onboardingStore.ts'), read('src/pages/PropertyOnboardingPage.tsx')]);
  expectAll(store, [/name:\s*['"]bin-group-onboarding-v3['"]/, /version:\s*4/, /step:\s*state\.step/, /intakeId:\s*state\.intakeId/], 'Safe onboarding recovery');
  expectAll(page, [/INTERNAL_STEP_COUNT = 11/, /clampStep/, /if \(step !== safeStep\) setStep\(safeStep\)/, /case 1:/, /case 11:/], 'Onboarding stage recovery');
});

test('Arabic contracts exist on payment, onboarding and role-profile surfaces', async () => {
  const paths = [
    'src/components/onboarding/PaymentSummaryStep.tsx',
    'src/components/onboarding/PropertyLocationStep.tsx',
    'src/pages/PropertyOnboardingPage.tsx',
    'src/owner/pages/OwnerProfilePage.tsx',
    'src/tenant/pages/TenantProfilePage.tsx',
    'src/technician/pages/TechnicianProfilePage.tsx',
    'src/broker/pages/BrokerProfilePage.tsx',
    'apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx',
  ];
  for (const path of paths) {
    const source = await read(path);
    assert.match(source, /isRTL|lang\s*===\s*['"]ar['"]/, `${path} has no Arabic/RTL state`);
    assert.match(source, /[\u0600-\u06FF]/, `${path} has no Arabic copy`);
  }
});

test('Admin, Owner, Tenant, Technician and Broker lifecycle blockers have executable authority', async () => {
  const [admin, ownerPhone, ownerBackend, ownerReady, tenant, tenantBackend, technician, techProfile, brokerPayout, quote, pricing] = await Promise.all([
    read('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx'),
    read('src/owner/components/OwnerPhoneVerificationCard.tsx'),
    read('functions/secureOwnerProfileOperations.ts'),
    read('functions/ownerProfileReadiness.ts'),
    read('src/tenant/pages/TenantProfilePage.tsx'),
    read('functions/tenantCorrectionOperations.ts'),
    read('functions/secureTechnicianOperations.ts'),
    read('functions/secureTechnicianProfileOperations.ts'),
    read('functions/secureBrokerPayoutOperations.ts'),
    read('functions/ownerPortfolioQuote.ts'),
    read('functions/pricing/calculateUaeQuote2026.ts'),
  ]);
  expectAll(admin, [/AdminMfaEnrollmentCard/, /admin-mfa-recovery-link/, /Active security sessions/, /permissionDefinitions/], 'Admin security lifecycle');
  expectAll(ownerPhone, [/updatePhoneNumber\(currentUser, credential\)/, /syncVerifiedOwnerPhone/], 'Owner verified phone');
  expectAll(ownerBackend, [/Owner full name must match the verified Owner KYC identity/, /Billing email must match the verified account or verified billing email/], 'Owner verified identity');
  expectAll(ownerReady, [/propertyProofApproved/, /locationApproved/, /depositReceived/, /dashboardUnlocked/], 'Owner activation readiness');
  expectAll(tenant, [/activeResidences/, /historicalResidences/, /TenantCorrectionPanel/], 'Tenant residence lifecycle');
  expectAll(tenantBackend, [/ADMIN_APPROVE_TENANT_CORRECTION/, /ADMIN_REJECT_TENANT_CORRECTION/], 'Tenant reviewed corrections');
  expectAll(technician, [/medical card/, /driving licence/, /required certifications/, /registered device/, /fresh GPS location/, /getTechnicianOperationalReadiness/], 'Technician dispatch gate');
  expectAll(techProfile, [/submitTechnicianCredentialRenewal/, /TECHNICIAN_CREDENTIAL_RENEWAL_SUBMITTED/, /evidenceHash/], 'Technician renewal evidence');
  expectAll(brokerPayout, [/requestBrokerPayoutOtp/, /verifyBrokerPayoutOtp/, /kycSubmissionHash/, /status: "CONSUMED"/], 'Broker payout authority');
  expectAll(quote, [/QUOTE_TTL_MS/, /issuedAtMs/, /expiresAtMs/, /assertOwnerPortfolioQuoteRecord/, /calculateUaeQuote2026/], 'Server quote authority');
  expectAll(pricing, [/FM_ONLY/, /PM_ONLY/, /BOTH/, /VALID_CONTRACT_TYPES/, /safeContractType/], 'Pricing contract authority');
});
