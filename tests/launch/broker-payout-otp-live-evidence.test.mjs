import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = readFileSync('scripts/prepare-broker-payout-otp-e2e.mjs', 'utf8');
const criticalRunner = readFileSync('scripts/run-critical-evidence.mjs', 'utf8');
const productionRunner = readFileSync('scripts/run-broker-production-evidence.mjs', 'utf8');
const brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');
const page = readFileSync('src/broker/pages/BrokerCommissionsPage.tsx', 'utf8');

test('Broker fixture is restricted to the verified dedicated E2E Broker and does not seed a commission', () => {
  assert.match(fixture, /E2E_BROKER_EMAIL is required/);
  assert.match(fixture, /brokerUser\.emailVerified/);
  assert.match(fixture, /profile\.e2eLaunchSeed !== true/);
  assert.match(fixture, /dedicated E2E Broker/);
  assert.match(fixture, /reraVerified: true/);
  assert.match(fixture, /brokerKycStatus: 'verified'/);
  assert.match(fixture, /commissionAgreementAccepted: true/);
  assert.match(fixture, /ibanVerified: true/);
  assert.match(fixture, /broker_payout_otp_rate_limits/);
  assert.match(fixture, /no commission was seeded/i);
  assert.match(fixture, /batch\.delete\(db\.collection\('broker_commissions'\)/);
  assert.doesNotMatch(fixture, /batch\.set\(db\.collection\('broker_commissions'\)/);
  assert.doesNotMatch(fixture, /otpHash|timingSafeEqual|verifyBrokerPayoutOtp|submitBrokerPayoutRequest/);
});

test('critical evidence prepares only KYC and OTP hygiene before Broker browser execution', () => {
  const fixtureMap = criticalRunner.indexOf('const SUITE_FIXTURES = Object.freeze');
  const brokerEntry = criticalRunner.indexOf('businessBroker:', fixtureMap);
  const fixtureCommand = criticalRunner.indexOf("script: 'scripts/prepare-broker-payout-otp-e2e.mjs'", brokerEntry);
  const fixtureLookup = criticalRunner.indexOf('const fixture = SUITE_FIXTURES[suiteKey]');
  const playwrightExecution = criticalRunner.indexOf('const result = spawnNpmPlaywrightJson');

  assert.ok(fixtureMap >= 0, 'critical evidence must use the central suite fixture map');
  assert.ok(brokerEntry > fixtureMap, 'fixture must remain scoped to businessBroker');
  assert.ok(fixtureCommand > brokerEntry, 'businessBroker must prepare the dedicated Broker identity and private KYC');
  assert.ok(fixtureLookup > fixtureCommand, 'suite fixture lookup must use the central map');
  assert.ok(playwrightExecution > fixtureLookup, 'fixture preparation must happen before browser execution');
});

test('Broker protected runner binds one UI lead to contract activation and one deterministic commission', () => {
  assert.match(productionRunner, /PROJECT_ID = 'bin-group-57c60'/);
  assert.match(productionRunner, /GITHUB_SHA/);
  assert.match(productionRunner, /E2E_BROKER_LEAD_NAME/);
  assert.match(productionRunner, /profile\.e2eLaunchSeed === true/);
  assert.match(productionRunner, /collection\('brokerLeads'\)/);
  assert.match(productionRunner, /status: 'DRAFT'/);
  assert.match(productionRunner, /status: 'ACTIVE'/);
  assert.match(productionRunner, /commission_\$\{contractId\}/);
  assert.match(productionRunner, /source === 'CONTRACT_ACTIVATION'/);
  assert.match(productionRunner, /commissionGenerated: false/);
  assert.match(productionRunner, /commissionCountAfterReplay\.size === 1/);
  assert.match(productionRunner, /deterministic commission ID/);
});

test('Broker protected runner requires mailbox OTP verification and completed payout submission', () => {
  assert.match(productionRunner, /E2E_BROKER_MAILBOX_CLIENT_ID/);
  assert.match(productionRunner, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/profile/);
  assert.match(productionRunner, /mailboxProfile\.emailAddress/);
  assert.match(productionRunner, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages/);
  assert.match(productionRunner, /requestBrokerPayoutOtp/);
  assert.match(productionRunner, /verifyBrokerPayoutOtp/);
  assert.match(productionRunner, /submitBrokerPayoutRequest/);
  assert.match(productionRunner, /delivery\?\.messageId/);
  assert.match(productionRunner, /otpHashVersion/);
  assert.match(productionRunner, /HMAC_SHA256_V1/);
  assert.match(productionRunner, /mailboxReceiptVerified: true/);
  assert.match(productionRunner, /providerMessageIdHash/);
  assert.match(productionRunner, /mailboxMessageIdHash/);
  assert.doesNotMatch(productionRunner, /deriveOtp|value\.otpHash\b|value\.salt\b|number\s*<=\s*999999/);
  assert.match(productionRunner, /EMAIL_OTP_SINGLE_USE_PRIVATE_KYC/);
  assert.match(productionRunner, /status\) === 'CONSUMED'/);
  assert.match(productionRunner, /payoutStatus\) === 'REQUESTED'/);
  assert.match(productionRunner, /callFunctionExpectingFailure/);
  assert.match(productionRunner, /broker-production-evidence\.json/);
  assert.match(productionRunner, /hardLaunchClaim: false/);

  const evidenceStart = productionRunner.indexOf('const evidence =');
  assert.ok(evidenceStart >= 0, 'Broker production evidence object is missing');
  const evidenceBlock = productionRunner.slice(evidenceStart);
  assert.doesNotMatch(evidenceBlock, /providerMessageId:\s*otpDelivery\.providerMessageId/);
});

test('Broker browser proof creates the lead and requires the protected lifecycle artifact', () => {
  assert.match(brokerSpec, /broker-lead-client-name/);
  assert.match(brokerSpec, /Lead recorded with attribution/);
  assert.match(brokerSpec, /runBrokerLifecycleProof\(uniqueLead\)/);
  assert.match(brokerSpec, /broker-production-evidence/);
  assert.match(brokerSpec, /countAfterActivationReplay: 1/);
  assert.match(brokerSpec, /deterministicIdPreserved: true/);
  assert.match(brokerSpec, /otpVerified: true/);
  assert.match(brokerSpec, /otpConsumed: true/);
  assert.match(brokerSpec, /PENDING_ADMIN_REVIEW/);
  assert.match(brokerSpec, /replayRejected: true/);
  assert.doesNotMatch(brokerSpec, /request-only|broker-payout-otp-cancel/i);
});

test('Broker payout UI retains server-authoritative request, verify, and submit order', () => {
  assert.match(page, /data-testid="broker-payout-request-otp"/);
  assert.match(page, /data-testid="broker-payout-otp-dialog"/);
  assert.match(page, /'data-testid': 'broker-payout-otp-code'/);
  assert.match(page, /data-testid="broker-payout-otp-submit"/);

  const requestIndex = page.indexOf("httpsCallable(functions, 'requestBrokerPayoutOtp')");
  const verifyIndex = page.indexOf("httpsCallable(functions, 'verifyBrokerPayoutOtp')");
  const submitIndex = page.indexOf("httpsCallable(functions, 'submitBrokerPayoutRequest')");
  assert.ok(requestIndex >= 0);
  assert.ok(verifyIndex > requestIndex);
  assert.ok(submitIndex > verifyIndex);
});
