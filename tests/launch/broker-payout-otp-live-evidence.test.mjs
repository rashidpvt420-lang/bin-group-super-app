import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fixture = readFileSync('scripts/prepare-broker-payout-otp-e2e.mjs', 'utf8');
const runner = readFileSync('scripts/run-critical-evidence.mjs', 'utf8');
const brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');
const page = readFileSync('src/broker/pages/BrokerCommissionsPage.tsx', 'utf8');
const brokerFunctions = readFileSync('functions/secureBrokerPayoutOperations.ts', 'utf8');

test('Broker payout OTP fixture is restricted to the verified dedicated E2E Broker', () => {
  assert.match(fixture, /E2E_BROKER_EMAIL is required/);
  assert.doesNotMatch(fixture, /E2E_BROKER_MAILBOX_EMAIL\s*\|\|\s*process\.env\.E2E_BROKER_EMAIL/);
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

test('Broker live evidence fetches a real OTP from Gmail and submits it — cancel path is forbidden', () => {
  // Must import the Gmail OAuth2 reader
  assert.match(brokerSpec, /gmail-otp-reader/);
  assert.match(brokerSpec, /getLatestOtp/);

  // Must sign in with app-login identity and read OTP from mailbox identity.
  assert.match(brokerSpec, /E2E_BROKER_EMAIL/);
  assert.match(brokerSpec, /E2E_BROKER_MAILBOX_EMAIL/);
  assert.doesNotMatch(brokerSpec, /const EMAIL = process\.env\.E2E_BROKER_MAILBOX_EMAIL/);

  // Must issue the OTP request
  assert.match(brokerSpec, /broker-payout-request-otp/);
  assert.ok(brokerSpec.includes('REQUEST PAYOUT \\(1\\)'), 'live evidence must require exactly one prepared commission');
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

  // OTP reader must receive the three required security parameters
  assert.match(brokerSpec, /expectedSender/, 'getLatestOtp must specify expectedSender to filter by origin');
  assert.match(brokerSpec, /expectedRecipient/, 'getLatestOtp must specify expectedRecipient to prevent cross-mailbox matches');
  assert.match(brokerSpec, /correlationId/, 'getLatestOtp must specify correlationId to bind OTP to this specific request');
  assert.match(brokerSpec, /test\.use\(\{\s*trace: 'off',\s*video: 'off',\s*screenshot: 'off'\s*\}\)/, 'OTP evidence must disable Playwright trace/video/screenshot artifacts');

  // Timestamp must be captured BEFORE the OTP-request click, not after
  const requestClickIndex   = brokerSpec.indexOf('await requestOtp.click()');
  const timestampCaptureIndex = brokerSpec.indexOf('otpRequestedAtMs = Date.now()');
  assert.ok(timestampCaptureIndex >= 0, 'otpRequestedAtMs must be captured before requestOtp.click()');
  assert.ok(timestampCaptureIndex < requestClickIndex, 'timestamp capture must precede requestOtp.click()');
});

test('Broker payout OTP backend binds the request correlation id across storage and email content', () => {
  assert.match(brokerFunctions, /const correlationId = ref\.id/);
  assert.match(brokerFunctions, /subject: `BIN GROUP payout verification code \$\{correlationId\}`/);
  assert.match(brokerFunctions, /Request reference: \$\{correlationId\}/);
  assert.match(brokerFunctions, /correlationId,/);
  assert.match(brokerFunctions, /return \{ status: "OTP_SENT"[\s\S]*correlationId/);
  assert.match(page, /data-correlation-id=\{otp\.correlationId\}/);
  assert.match(brokerSpec, /await otpDialog\.getAttribute\('data-correlation-id'\)/);
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
