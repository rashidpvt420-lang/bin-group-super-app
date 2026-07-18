import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const ARABIC = /[\u0600-\u06FF]/;

const expectAll = (source, patterns, label) => {
  for (const pattern of patterns) assert.match(source, pattern, `${label}: missing ${pattern}`);
};

test('Owner verified identity, Firebase phone authority and billing privacy remain enforced', async () => {
  const [phoneCard, backend, profile] = await Promise.all([
    read('src/owner/components/OwnerPhoneVerificationCard.tsx'),
    read('functions/secureOwnerProfileOperations.ts'),
    read('src/owner/pages/OwnerProfilePage.tsx'),
  ]);
  expectAll(phoneCard, [
    /updatePhoneNumber\(currentUser, credential\)/,
    /syncVerifiedOwnerPhone/,
    /6-digit SMS code/,
  ], 'Owner Firebase phone verification');
  expectAll(backend, [
    /phoneAuthority: "FIREBASE_AUTH_PHONE"/,
    /OWNER_PHONE_VERIFIED_SYNCED/,
    /Owner full name must match the verified Owner KYC identity/,
    /Billing name must match the verified Owner KYC identity/,
    /sensitiveValuesExcluded: true/,
  ], 'Owner authority backend');
  assert.match(profile, /OwnerPhoneVerificationCard/);
});

test('Tenant profile supports active and historical residences with reviewed correction history', async () => {
  const [profile, panel, backend] = await Promise.all([
    read('src/tenant/pages/TenantProfilePage.tsx'),
    read('src/tenant/components/TenantCorrectionPanel.tsx'),
    read('functions/tenantCorrectionOperations.ts'),
  ]);
  expectAll(profile, [
    /activeResidences/,
    /historicalResidences/,
    /isHistoricalResidence/,
    /Lease start/,
    /Lease end/,
  ], 'Tenant residence history');
  expectAll(panel, [
    /submitTenantCorrectionRequest/,
    /listTenantCorrectionRequests/,
    /item\.events\.map/,
  ], 'Tenant correction history');
  expectAll(backend, [
    /ADMIN_APPROVE_TENANT_CORRECTION/,
    /ADMIN_REJECT_TENANT_CORRECTION/,
    /status: "PENDING_ADMIN_REVIEW"/,
    /"aborted"/,
    /record changed after this correction was submitted/,
    /transaction\.create\(eventRef/,
  ], 'Tenant correction authority');
});

test('Technician readiness binds credential expiry, device, GPS, duty and dispatch eligibility', async () => {
  const [profileNormalizer, readinessTest, operations] = await Promise.all([
    read('src/technician/utils/normalizeTechnicianProfile.ts'),
    read('tests/launch/technician-unified-readiness-gate.test.mjs'),
    read('functions/secureTechnicianOperations.ts'),
  ]);
  expectAll(profileNormalizer, [
    /expiryMs !== null && expiryMs <= nowMs/,
    /complianceBlocked = medicalCardStatus !== 'valid'/,
    /dispatchReadiness: explicitBlocked \|\| complianceBlocked/,
    /dutyStatus/,
    /complianceBlockReasons/,
  ], 'Technician profile readiness');
  expectAll(readinessTest, [
    /registeredDeviceId/,
    /lastGpsAt/,
    /workload capacity/,
    /Credential expiry enforcement/,
  ], 'Technician unified readiness audit');
  expectAll(operations, [
    /evaluateTechnicianReadiness/,
    /action !== "RESUME_DUTY" && !onDuty/,
    /action !== "RESUME_DUTY" && !available/,
    /action !== "RESUME_DUTY" && !hasCapacity/,
  ], 'Technician server operations');
});

test('Broker KYC, agreement evidence, payout ownership, MFA and history are server-authoritative', async () => {
  const [kyc, payout, commissions] = await Promise.all([
    read('functions/brokerKycProfile.ts'),
    read('functions/secureBrokerPayoutOperations.ts'),
    read('src/broker/pages/BrokerCommissionsPage.tsx'),
  ]);
  expectAll(kyc, [
    /commissionAgreementAccepted/,
    /TERMS_VERSION/,
    /commissionTermsVersion/,
    /submissionHash/,
    /Unsupported Broker KYC fields/,
  ], 'Broker KYC agreement evidence');
  expectAll(payout, [
    /requestBrokerPayoutOtp|verifyBrokerPayoutOtp|submitBrokerPayoutRequest/,
    /commissionIds/,
    /status: "CONSUMED"/,
    /audit/i,
  ], 'Broker payout authority');
  expectAll(commissions, [
    /requestBrokerPayoutOtp/,
    /verifyBrokerPayoutOtp/,
    /submitBrokerPayoutRequest/,
    /broker-payout-otp-dialog/,
  ], 'Broker payout UI');
});

test('Owner onboarding quote and contract values remain server-authoritative for multi-property portfolios', async () => {
  const [quote, contractAuthority, payment] = await Promise.all([
    read('functions/ownerPortfolioQuote.ts'),
    read('functions/secureOwnerRegistrationRequest.ts'),
    read('src/components/onboarding/PaymentSummaryStep.tsx'),
  ]);
  expectAll(quote, [
    /QUOTE_TTL_MS/,
    /assertOwnerPortfolioQuoteRecord/,
    /pricingEngineVersion/,
    /quoteHash/,
  ], 'Owner quote authority');
  expectAll(contractAuthority, [
    /A single contract cannot mix maintenance, property-management, and hybrid service modes/,
    /All properties in one contract must use the same payment plan/,
    /selected contract plan does not match the server-priced property strategy/,
    /submitted payment cadence does not match the server-priced property cadence/,
    /properties: properties\.length/,
    /totalUnits/,
    /assertCanonicalCommercialTerms/,
  ], 'Owner commercial authority');
  expectAll(payment, [
    /getOwnerPaymentConfiguration/,
    /Math\.round\(annualTotal \* 0\.15\)/,
    /configHash/,
  ], 'Owner payment summary authority');
});

test('launch-critical profile and onboarding surfaces contain Arabic and RTL controls', async () => {
  const files = [
    'apps/admin-panel/src/App.tsx',
    'apps/admin-panel/src/components/Navigation.tsx',
    'src/components/onboarding/AssetProfileStep.tsx',
    'src/components/onboarding/PaymentSummaryStep.tsx',
    'src/owner/pages/OwnerProfilePage.tsx',
    'src/tenant/pages/TenantProfilePage.tsx',
    'src/technician/pages/TechnicianProfilePage.tsx',
    'src/broker/pages/BrokerProfilePage.tsx',
  ];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, ARABIC, `${file} contains no Arabic launch copy`);
    assert.match(source, /isRTL|direction|dir=/, `${file} contains no RTL control`);
  }
});
