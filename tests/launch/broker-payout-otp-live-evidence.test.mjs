import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = readFileSync('scripts/prepare-broker-payout-otp-e2e.mjs', 'utf8');
const runner = readFileSync('scripts/run-critical-evidence.mjs', 'utf8');
const productionEvidence = readFileSync('scripts/run-broker-production-evidence.mjs', 'utf8');
const brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');
const page = readFileSync('src/broker/pages/BrokerCommissionsPage.tsx', 'utf8');

test('Broker payout OTP fixture is restricted to the verified dedicated E2E Broker', () => {
  assert.match(fixture, /E2E_BROKER_MAILBOX_EMAIL is required/);
  assert.match(fixture, /brokerUser\.emailVerified/);
  assert.match(fixture, /profile\.e2eLaunchSeed !== true/);
  assert.match(fixture, /dedicated E2E Broker/);
  assert.match(fixture, /reraVerified: true/);
  assert.match(fixture, /brokerKycStatus: 'verified'/);
  assert.match(fixture, /commissionAgreementAccepted: true/);
  assert.match(fixture, /ibanVerified: true/);
  assert.match(fixture, /status: 'APPROVED'/);
  assert.match(fixture, /payoutStatus: 'NOT_REQUESTED'/);
  assert.match(fixture, /broker_payout_otp_rate_limits/);
  assert.match(fixture, /\['PENDING', 'VERIFIED', 'EXPIRED'\]/);
  assert.match(fixture, /productionEvidenceType = 'broker-contract-to-payout-production-proof'/);
  assert.match(fixture, /broker_commissions'\)\s*\.where\('brokerId', '==', brokerUid\)/);
  assert.match(fixture, /data\.e2eEvidenceType === productionEvidenceType/);
  assert.match(fixture, /staleProductionEvidenceCommissions/);
  assert.match(fixture, /staleProductionEvidencePayouts/);
  assert.doesNotMatch(fixture, /otpHash|timingSafeEqual|verifyBrokerPayoutOtp|submitBrokerPayoutRequest/);
});

test('critical evidence prepares the Broker payout fixture before browser execution', () => {
  const fixtureMap = runner.indexOf('const SUITE_FIXTURES = Object.freeze');
  const brokerEntry = runner.indexOf('businessBroker:', fixtureMap);
  const fixtureCommand = runner.indexOf("script: 'scripts/prepare-broker-payout-otp-e2e.mjs'", brokerEntry);
  const fixtureLookup = runner.indexOf('const fixture = SUITE_FIXTURES[suiteKey]');
  const fixtureFailure = runner.indexOf('fixture preparation failed — evidence not recorded');
  const playwrightExecution = runner.indexOf('const result = spawnNpmPlaywrightJson');

  assert.ok(fixtureMap >= 0, 'critical evidence must use the central suite fixture map');
  assert.ok(brokerEntry > fixtureMap, 'fixture preparation must remain scoped to businessBroker');
  assert.ok(fixtureCommand > brokerEntry, 'businessBroker must execute the dedicated fixture script');
  assert.ok(fixtureLookup > fixtureCommand, 'suite fixture lookup must use the central map');
  assert.ok(fixtureFailure > fixtureLookup, 'fixture failure must block evidence');
  assert.ok(playwrightExecution > fixtureFailure, 'fixture preparation must happen before browser execution');
});

test('Broker evidence remains deterministic across Playwright retries and Firestore visibility delay', () => {
  const beforeEach = brokerSpec.indexOf('test.beforeEach');
  const retryFixture = brokerSpec.indexOf("['scripts/prepare-broker-payout-otp-e2e.mjs']", beforeEach);
  const login = brokerSpec.indexOf('await login(page)', beforeEach);

  assert.ok(beforeEach >= 0);
  assert.ok(retryFixture > beforeEach, 'each Broker test attempt must reset the single-use payout fixture');
  assert.ok(login > retryFixture, 'the payout fixture must be reset before the Broker signs in');
  assert.match(productionEvidence, /async function waitForUiLead/);
  assert.match(productionEvidence, /while \(Date\.now\(\) < deadline\)/);
  assert.match(productionEvidence, /not server-visible after/);
  assert.match(productionEvidence, /const leadDocument = await waitForUiLead\(brokerUid, leadName\)/);
});

test('Broker live evidence fetches a real OTP from Gmail and submits it — cancel path is forbidden', () => {
  // Must import the Gmail OAuth2 reader
  assert.match(brokerSpec, /gmail-otp-reader/);
  assert.match(brokerSpec, /getLatestOtp/);

  // Must use the mailbox email env key
  assert.match(brokerSpec, /E2E_BROKER_MAILBOX_EMAIL/);

  // Must issue the OTP request
  assert.match(brokerSpec, /broker-payout-request-otp/);
  assert.ok(brokerSpec.includes('REQUEST PAYOUT \\(1\\)'), 'live evidence must require exactly one prepared commission');
  assert.match(brokerSpec, /requestOtpResponsePromise/);
  assert.match(brokerSpec, /response\.request\(\)\.method\(\) === 'POST'/);
  assert.match(brokerSpec, /requestBrokerPayoutOtp failed HTTP/);
  assert.match(brokerSpec, /broker-payout-otp-dialog/);
  assert.match(brokerSpec, /broker-payout-otp-code/);

  // Must fill and submit the real code
  assert.match(brokerSpec, /otpCode\.fill\(otp\)/);
  assert.match(brokerSpec, /broker-payout-otp-submit/);
  assert.match(brokerSpec, /submitOtp\.click\(\)/);

  // Cancel path must NOT be used — that was the false-pass escape hatch
  assert.doesNotMatch(brokerSpec, /broker-payout-otp-cancel/);

  // Server-authoritative callable names must not appear in the client spec
  assert.doesNotMatch(brokerSpec, /verifyBrokerPayoutOtp|submitBrokerPayoutRequest/);
});


test('Broker payout UI exposes stable evidence selectors while retaining server-authoritative order', () => {
  assert.match(page, /data-testid="broker-payout-request-otp"/);
  assert.match(page, /data-testid="broker-payout-otp-dialog"/);
  assert.match(page, /'data-testid': 'broker-payout-otp-code'/);
  assert.match(page, /data-testid="broker-payout-otp-cancel"/);
  assert.match(page, /data-testid="broker-payout-otp-submit"/);

  const requestIndex = page.indexOf("httpsCallable(functions, 'requestBrokerPayoutOtp')");
  const verifyIndex = page.indexOf("httpsCallable(functions, 'verifyBrokerPayoutOtp')");
  const submitIndex = page.indexOf("httpsCallable(functions, 'submitBrokerPayoutRequest')");
  assert.ok(requestIndex >= 0);
  assert.ok(verifyIndex > requestIndex);
  assert.ok(submitIndex > verifyIndex);
});