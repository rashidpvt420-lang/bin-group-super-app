import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const ARABIC = /[\u0600-\u06FF]/;

const profileContracts = [
  { role: 'Owner', router: 'src/owner/OwnerApp.tsx', page: 'src/owner/pages/OwnerProfilePage.tsx', component: 'OwnerProfilePage' },
  { role: 'Tenant', router: 'src/tenant/TenantApp.tsx', page: 'src/tenant/pages/TenantProfilePage.tsx', component: 'TenantProfilePage' },
  { role: 'Technician', router: 'src/technician/TechnicianApp.tsx', page: 'src/technician/pages/TechnicianProfilePage.tsx', component: 'TechnicianProfilePage' },
  { role: 'Broker', router: 'src/broker/BrokerApp.tsx', page: 'src/broker/pages/BrokerProfilePage.tsx', component: 'BrokerProfilePage' },
];

test('Owner, Tenant, Technician and Broker expose protected profile routes', async () => {
  for (const contract of profileContracts) {
    const router = await read(contract.router);
    assert.match(router, new RegExp(`import\\s+${contract.component}\\s+from`), `${contract.role} profile component is not imported`);
    assert.match(router, /<Route\s+path=["']\/profile["']\s+element=/, `${contract.role} /profile route is not registered`);
    assert.match(router, new RegExp(contract.component), `${contract.role} profile route does not retain the profile component`);
  }
});

test('all live profile pages retain bilingual, RTL, mobile and account-recovery contracts', async () => {
  for (const contract of profileContracts) {
    const source = await read(contract.page);
    assert.match(source, /useLanguage\(\)/, `${contract.role} profile does not use the language provider`);
    assert.match(source, /isRTL/, `${contract.role} profile does not consume RTL state`);
    assert.match(source, /lang\s*===\s*['"]ar['"]/, `${contract.role} profile has no Arabic branch`);
    assert.match(source, ARABIC, `${contract.role} profile contains no Arabic copy`);
    assert.match(source, /<Avatar\b/, `${contract.role} profile has no identity/avatar surface`);
    if (contract.role === 'Tenant') {
      assert.match(source, /TenantCorrectionPanel/, 'Tenant profile has no reviewed correction workflow');
      assert.doesNotMatch(source, /\bsetDoc\s*\(/, 'Tenant profile must not directly persist reviewed identity fields');
    } else {
      assert.match(source, /handleSave/, `${contract.role} profile has no save workflow`);
    }
    assert.match(source, /sendPasswordResetEmail/, `${contract.role} profile has no account-recovery workflow`);
    assert.match(source, /xs=/, `${contract.role} profile has no mobile grid breakpoint`);
  }
});

test('Admin personal security profile, MFA recovery and readable permissions are executable', async () => {
  const [router, profile, recovery] = await Promise.all([
    read('apps/admin-panel/src/App.tsx'),
    read('apps/admin-panel/src/pages/settings/AdminSecurityProfilePage.tsx'),
    read('functions/adminMfaRecovery.ts'),
  ]);
  assert.match(router, /path=["']\/profile["']/);
  assert.match(router, /path=["']\/mfa-recovery["']/);
  assert.match(profile, /getAdminSecurityProfile/);
  assert.match(profile, /admin-mfa-recovery-link/);
  assert.match(profile, /permissionDefinitions/);
  assert.match(profile, /eventLabel/);
  assert.match(profile, ARABIC);
  assert.match(recovery, /PENDING_SECOND_APPROVAL/);
  assert.match(recovery, /revokeRefreshTokens/);
});

test('Owner and Tenant profiles expose readiness instead of silent blockers', async () => {
  const [ownerRouter, ownerCard, ownerBackend, tenantRouter, tenantCard] = await Promise.all([
    read('src/owner/OwnerApp.tsx'),
    read('src/owner/components/OwnerProfileReadinessCard.tsx'),
    read('functions/ownerProfileReadiness.ts'),
    read('src/tenant/TenantApp.tsx'),
    read('src/tenant/components/TenantProfileReadinessCard.tsx'),
  ]);
  assert.match(ownerRouter, /OwnerProfileReadinessCard/);
  assert.match(ownerCard, /Owner Activation Readiness/);
  assert.match(ownerBackend, /identityVerified/);
  assert.match(ownerBackend, /propertyProofApproved/);
  assert.match(ownerBackend, /locationApproved/);
  assert.match(ownerBackend, /contractSigned/);
  assert.match(ownerBackend, /depositReceived/);
  assert.match(ownerBackend, /dashboardUnlocked/);
  assert.match(tenantRouter, /TenantProfileReadinessCard/);
  assert.match(tenantCard, /Unit link approved/);
  assert.match(tenantCard, /Lease verified/);
  assert.match(tenantCard, /Move-in evidence complete/);
});

test('Technician credential expiry, dispatch freeze and renewal evidence are enforced', async () => {
  const [profile, operations, profileBackend, runtime] = await Promise.all([
    read('src/technician/pages/TechnicianProfilePage.tsx'),
    read('functions/secureTechnicianOperations.ts'),
    read('functions/secureTechnicianProfileOperations.ts'),
    read('functions/runtime.ts'),
  ]);
  assert.match(operations, /medical card/);
  assert.match(operations, /driving licence/);
  assert.match(operations, /required certifications/);
  assert.match(operations, /registered device/);
  assert.match(operations, /fresh GPS location/);
  assert.match(operations, /getTechnicianOperationalReadiness/);
  assert.match(profileBackend, /submitTechnicianCredentialRenewal/);
  assert.match(profileBackend, /TECHNICIAN_CREDENTIAL_RENEWAL_SUBMITTED/);
  assert.match(profileBackend, /evidenceHash/);
  assert.match(profileBackend, /PENDING_ADMIN_REVIEW/);
  assert.match(profile, /Server-Authoritative Dispatch Readiness/);
  assert.match(profile, /Credential Renewal Evidence/);
  assert.match(profile, /submitTechnicianCredentialRenewal/);
  assert.match(runtime, /getTechnicianOperationalReadiness/);
  assert.match(runtime, /submitTechnicianCredentialRenewal/);
});

test('Broker browser receives masked KYC only and payout readiness is server-authoritative', async () => {
  const [profile, backend, payout] = await Promise.all([
    read('src/broker/pages/BrokerProfilePage.tsx'),
    read('functions/secureBrokerKycSubmission.ts'),
    read('functions/secureBrokerPayoutOperations.ts'),
  ]);
  assert.match(profile, /getBrokerKycProfileSummary/);
  assert.match(profile, /masked KYC/i);
  assert.doesNotMatch(profile, /broker_kyc_profiles/);
  assert.doesNotMatch(profile, /\bgetDoc\s*\(/);
  assert.match(backend, /reraLicenseMasked/);
  assert.match(backend, /bankIbanMasked/);
  assert.match(backend, /KYC_APPROVAL_NOT_BOUND_TO_CURRENT_SUBMISSION/);
  assert.match(backend, /authDisplayNameChangeDeferredUntilApproval/);
  assert.match(payout, /kycSubmissionHash/);
  assert.match(payout, /status: "CONSUMED"/);
});

test('owner onboarding is account-first, direct-to-Owner and location provenance safe', async () => {
  const [page, store, stateMachine, company, location, geo, payment, quote] = await Promise.all([
    read('src/pages/PropertyOnboardingPage.tsx'),
    read('src/store/onboardingStore.ts'),
    read('src/lib/onboardingStateMachine.ts'),
    read('src/components/onboarding/CompanyProfileStep.tsx'),
    read('src/components/onboarding/PropertyLocationStep.tsx'),
    read('src/utils/geoAnchor.ts'),
    read('src/components/onboarding/PaymentSummaryStep.tsx'),
    read('functions/ownerPortfolioQuote.ts'),
  ]);
  assert.ok(page.indexOf('case 2: return <AccountCreationStep') < page.indexOf('case 3: return <AssetProfileStep'));
  assert.match(stateMachine, /account_created/);
  assert.match(store, /version:\s*4/);
  assert.match(store, /partialize:\s*\(state\)\s*=>\s*\(\{\s*step:\s*state\.step,\s*intakeId:\s*state\.intakeId,?\s*\}\)/s);
  assert.match(company, /Rent is paid directly to the Owner/);
  assert.match(company, /BIN GROUP does not hold owner rent funds/);
  assert.match(company, /الإيجار مباشرة للمالك/);
  assert.match(location, /coordinatesUnchanged/);
  assert.match(location, /currentGeo\.verified/);
  assert.match(location, /source:\s*'device_gps'/);
  assert.match(location, /accuracyMeters <= 50/);
  assert.match(location, /البحث عن عنوان العقار/);
  assert.match(geo, /"device_gps"/);
  assert.match(geo, /dispatchReady/);
  assert.match(payment, /getOwnerPaymentConfiguration/);
  assert.match(payment, /Math\.round\(annualTotal \* 0\.15\)/);
  assert.match(quote, /QUOTE_TTL_MS/);
  assert.match(quote, /assertOwnerPortfolioQuoteRecord/);
});
