import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const lifecycle = read('functions/brokerCommercialLifecycle.ts');
const commissionEngine = read('functions/brokerCommissions.ts');
const payout = read('functions/secureBrokerPayoutOperations.ts');
const adminReview = read('functions/adminBrokerPayoutReview.ts');
const runtime = read('functions/runtime.ts');
const fixture = read('scripts/prepare-broker-payout-otp-e2e.mjs');
const runner = read('scripts/run-broker-commercial-lifecycle-evidence.mjs');
const mailbox = read('scripts/lib/gmail-mailbox-proof.mjs');
const brokerSpec = read('tests/e2e/business-broker.spec.ts');
const page = read('src/broker/pages/BrokerCommissionsPage.tsx');

test('Broker lead attribution is Owner-bound, immutable and activation-driven', () => {
  assert.match(lifecycle, /linkBrokerLeadToOwnerOnboarding/);
  assert.match(lifecycle, /leadEmail !== owner\.email/);
  assert.match(lifecycle, /broker_attributed_onboardings/);
  assert.match(lifecycle, /idempotencyKey: `\$\{leadId\}:\$\{owner\.uid\}:\$\{intakeId\}`/);
  assert.match(lifecycle, /upper\(contract\.status\) !== "ACTIVE"/);
  assert.match(lifecycle, /createBrokerCommissionForContract\(intakeId/);
  assert.match(lifecycle, /reconcileBrokerAttributionOnContractWrite/);
});

test('Broker conversion is loop-safe and one commission is deterministic per real Owner contract', () => {
  assert.match(lifecycle, /reconciliationLeaseUntil/);
  assert.match(lifecycle, /RECONCILIATION_IN_PROGRESS/);
  assert.match(lifecycle, /commission_\$\{intakeId\}/);
  assert.match(lifecycle, /commissionLockKey: `commission_\$\{intakeId\}`/);
  assert.match(commissionEngine, /collection\("broker_commissions"\)\.doc\(`commission_\$\{contractId\}`\)/);
  assert.match(commissionEngine, /existingCommission\.exists/);
  assert.match(commissionEngine, /transaction\.create\(commissionRef/);
  assert.match(runner, /ensureOwnerLifecycleEvidence/);
  assert.match(runner, /ownerEvidence\.onboarding\.intakeId/);
  assert.doesNotMatch(runner, /status: 'DRAFT'/);
  assert.doesNotMatch(runner, /annualContractValue = 10000/);
});

test('Broker payout OTP proves branded SMTP acceptance and actual Gmail mailbox receipt', () => {
  assert.match(payout, /const BRANDED_FROM = "BIN GROUP <ceo@bin-groups\.com>"/);
  assert.match(payout, /if \(from !== BRANDED_FROM\)/);
  assert.match(payout, /providerAccepted: true/);
  assert.match(payout, /accepted\.includes\(lower\(email\)\)/);
  assert.match(payout, /brandedSenderVerified/);
  assert.match(mailbox, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages/);
  assert.match(mailbox, /E2E_BROKER_GMAIL_REFRESH_TOKEN/);
  assert.match(mailbox, /mailboxMessageId === expectedProviderId/);
  assert.match(mailbox, /mailboxReceived: true/);
  assert.match(runner, /waitForBrokerMailboxReceipt/);
  assert.match(brokerSpec, /mailboxReceived: true/);
  assert.doesNotMatch(payout, /otp:\s*otp[,}]/);
});

test('Admin payout settlement requires real MFA and supports correction and resubmission', () => {
  assert.match(adminReview, /sign_in_second_factor/);
  assert.match(adminReview, /action must be APPROVE, REJECT or MARK_PAID/);
  assert.match(adminReview, /payoutStatus: "AVAILABLE"/);
  assert.match(adminReview, /payoutRequestId: FieldValue\.delete\(\)/);
  assert.match(adminReview, /status: "PAID"/);
  assert.match(adminReview, /ADMIN_BROKER_PAYOUT_\$\{action\}/);
  assert.match(runtime, /export \{ adminReviewBrokerPayoutRequest \} from "\.\/adminBrokerPayoutReview"/);
  assert.match(brokerSpec, /E2E_ADMIN_REAL_MFA_CODE/);
  assert.match(brokerSpec, /rejectFirstPayout/);
  assert.match(brokerSpec, /approveAndPayReplacement/);
});

test('Protected Broker fixture clears prior commercial state and never manufactures a commission', () => {
  assert.match(fixture, /dedicated E2E Broker/);
  assert.match(fixture, /broker_commissions.*where\('brokerId'/s);
  assert.match(fixture, /broker_payout_requests.*where\('brokerId'/s);
  assert.match(fixture, /broker_attributed_onboardings.*where\('brokerId'/s);
  assert.match(fixture, /no commission was seeded/i);
  assert.doesNotMatch(fixture, /batch\.set\(db\.collection\('broker_commissions'\)/);
  assert.doesNotMatch(fixture, /amount:\s*500/);
});

test('Exact-SHA Broker evidence covers conversion, OTP, rejection, resubmission and paid settlement', () => {
  assert.match(runner, /Broker evidence requires an exact lowercase commit SHA/);
  assert.match(runner, /Owner lifecycle evidence is not bound to the exact Broker evidence SHA/);
  assert.match(runner, /commissionQuery\.size === 1/);
  assert.match(runner, /Consumed Broker OTP evidence was accepted twice/);
  assert.match(runner, /Admin did not reject the first Broker payout request/);
  assert.match(runner, /ADMIN_BROKER_PAYOUT_REJECT/);
  assert.match(runner, /ADMIN_BROKER_PAYOUT_APPROVE/);
  assert.match(runner, /ADMIN_BROKER_PAYOUT_MARK_PAID/);
  assert.match(runner, /evidence\.status = 'passed'/);
  assert.match(brokerSpec, /runEvidence\('convert'/);
  assert.match(brokerSpec, /runEvidence\('submit-first'\)/);
  assert.match(brokerSpec, /runEvidence\('submit-second'\)/);
  assert.match(brokerSpec, /runEvidence\('verify-paid'\)/);
  assert.doesNotMatch(brokerSpec, /request-only|broker-payout-otp-cancel/i);
});

test('Broker payout UI retains server-authoritative request, verify and submit order', () => {
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
