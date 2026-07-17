import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = readFileSync('scripts/prepare-broker-payout-otp-e2e.mjs', 'utf8');
const runner = readFileSync('scripts/run-critical-evidence.mjs', 'utf8');
const brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');
const page = readFileSync('src/broker/pages/BrokerCommissionsPage.tsx', 'utf8');

test('Broker payout OTP fixture is restricted to the verified dedicated E2E Broker', () => {
  assert.match(fixture, /E2E_BROKER_EMAIL is required/);
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
  assert.doesNotMatch(fixture, /otpHash|timingSafeEqual|verifyBrokerPayoutOtp|submitBrokerPayoutRequest/);
});

test('critical evidence prepares the Broker payout fixture before browser execution', () => {
  const suiteGuard = runner.indexOf("suiteKey !== 'businessBroker'");
  const fixtureCommand = runner.indexOf("'scripts/prepare-broker-payout-otp-e2e.mjs'");
  const fixtureFailure = runner.indexOf('fixture preparation failed — evidence not recorded');
  const playwrightExecution = runner.indexOf('const result = spawnNpmPlaywrightJson');

  assert.ok(suiteGuard >= 0, 'fixture preparation must be restricted to businessBroker');
  assert.ok(fixtureCommand > suiteGuard, 'businessBroker must execute the dedicated fixture script');
  assert.ok(fixtureFailure > fixtureCommand, 'fixture failure must block evidence');
  assert.ok(playwrightExecution > fixtureFailure, 'fixture preparation must happen before browser execution');
});

test('Broker live evidence requests and cancels an OTP challenge without consuming it', () => {
  assert.match(brokerSpec, /broker-payout-request-otp/);
  assert.ok(brokerSpec.includes('REQUEST PAYOUT \\(1\\)'), 'live evidence must require exactly one prepared commission');
  assert.match(brokerSpec, /broker-payout-otp-dialog/);
  assert.match(brokerSpec, /broker-payout-otp-code/);
  assert.match(brokerSpec, /toHaveValue\(''\)/);
  assert.match(brokerSpec, /broker-payout-otp-submit/);
  assert.match(brokerSpec, /toBeDisabled\(\)/);
  assert.match(brokerSpec, /broker-payout-otp-cancel/);
  assert.doesNotMatch(brokerSpec, /getByTestId\('broker-payout-otp-code'\)\.fill/);
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
