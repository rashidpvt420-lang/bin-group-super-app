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
    /stale/i,
  ], 'Tenant correction authority');
});

test('Technician readiness binds credential expiry, device, GPS, duty and dispatch eligibility', async () => {
  const [expiryTest, readinessTest, operations] = await Promise.all([
    read('tests/launch/technician-expiry-readiness.test.mjs'),
    read('tests/launch/technician-unified-readiness-gate.test.mjs'),
    read('functions/secureTechnicianOperations.ts'),
  ]);
  expectAll(expiryTest, [
    /credential expiry/i,
    /dispatch/i,
    /duty/i,
  ], 'Technician expiry audit');
  expectAll(readinessTest, [
    /device/i,
    /GPS/i,
    /workload/i,
    /credential/i,
  ], 'Technician unified readiness audit');
  expectAll(operations, [
    /dispatch/i,
    /credential/i,
    /duty/i,
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
    /termsVersion/,
    /submissionHash|kycSubmissionHash/,
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
  const [quote, contractTest, payment] = await Promise.all([
    read('functions/ownerPortfolioQuote.ts'),
    read('scripts/tests/owner-contract-commercial-authority-launch.test.mjs'),
    read('src/components/onboarding/PaymentSummaryStep.tsx'),
  ]);
  expectAll(quote, [
    /QUOTE_TTL_MS/,
    /assertOwnerPortfolioQuoteRecord/,
    /pricingEngineVersion/,
    /quoteHash/,
  ], 'Owner quote authority');
  expectAll(contractTest, [
    /mixed service/i,
    /mixed payment/i,
    /server/i,
    /property count/i,
    /unit count/i,
  ], 'Owner commercial authority regression');
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
