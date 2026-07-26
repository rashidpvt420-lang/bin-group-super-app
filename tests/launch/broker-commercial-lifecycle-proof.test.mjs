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
const brokerSpec = read('tests/e2e/business-broker.spec.ts');

test('Broker lead attribution is owner-bound, immutable and activation-driven', () => {
  assert.match(lifecycle, /linkBrokerLeadToOwnerOnboarding/);
  assert.match(lifecycle, /leadEmail !== owner\.email/);
  assert.match(lifecycle, /broker_attributed_onboardings/);
  assert.match(lifecycle, /idempotencyKey: `\$\{leadId\}:\$\{owner\.uid\}:\$\{intakeId\}`/);
  assert.match(lifecycle, /upper\(contract\.status\) !== "ACTIVE"/);
  assert.match(lifecycle, /createBrokerCommissionForContract\(intakeId/);
  assert.match(lifecycle, /reconcileBrokerAttributionOnContractWrite/);
});

test('Broker conversion is loop-safe and one commission is deterministic per contract', () => {
  assert.match(lifecycle, /reconciliationLeaseUntil/);
  assert.match(lifecycle, /RECONCILIATION_IN_PROGRESS/);
  assert.match(lifecycle, /commission_\$\{intakeId\}/);
  assert.match(lifecycle, /commissionLockKey: `commission_\$\{intakeId\}`/);
  assert.match(lifecycle, /broker_conversion_\$\{intakeId\}/);
  assert.match(commissionEngine, /const commissionId = `commission_\$\{contractId\}`/);
  assert.match(commissionEngine, /if \(existing\.exists\)/);
  assert.match(commissionEngine, /transaction\.create\(commissionRef/);
});

test('Broker payout OTP persists provider and branded-sender delivery evidence', () => {
  assert.match(payout, /const BRANDED_FROM = "BIN GROUP <ceo@bin-groups\.com>"/);
  assert.match(payout, /if \(from !== BRANDED_FROM\)/);
  assert.match(payout, /providerAccepted: true/);
  assert.match(payout, /accepted\.includes\(lower\(email\)\)/);
  assert.match(payout, /brandedSenderVerified/);
  assert.match(payout, /otpHash: hashOtp\(otp, salt\)/);
  assert.doesNotMatch(payout, /otp:\s*otp[,}]/);
});

test('Admin payout settlement requires real MFA and supports correction lifecycle', () => {
  assert.match(adminReview, /sign_in_second_factor/);
  assert.match(adminReview, /action must be APPROVE, REJECT or MARK_PAID/);
  assert.match(adminReview, /payoutStatus: "AVAILABLE"/);
  assert.match(adminReview, /payoutRequestId: FieldValue\.delete\(\)/);
  assert.match(adminReview, /status: "PAID"/);
  assert.match(adminReview, /ADMIN_BROKER_PAYOUT_\$\{action\}/);
  assert.match(runtime, /export \{ adminReviewBrokerPayoutRequest \} from "\.\/adminBrokerPayoutReview"/);
});

test('Protected Broker fixture no longer manufactures a commission', () => {
  assert.match(fixture, /no commission was seeded/i);
  assert.match(fixture, /broker_commissions.*where\('brokerId'/s);
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
});

test('Broker Playwright business suite performs the real Admin MFA settlement chain', () => {
  assert.match(brokerSpec, /E2E_ADMIN_REAL_MFA_CODE/);
  assert.match(brokerSpec, /Broker payout settlement requires a real enrolled Admin MFA session/);
  assert.match(brokerSpec, /runEvidence\('convert'/);
  assert.match(brokerSpec, /runEvidence\('submit-first'\)/);
  assert.match(brokerSpec, /rejectFirstPayout/);
  assert.match(brokerSpec, /runEvidence\('submit-second'\)/);
  assert.match(brokerSpec, /approveAndPayReplacement/);
  assert.match(brokerSpec, /runEvidence\('verify-paid'\)/);
  assert.doesNotMatch(brokerSpec, /request-only payout OTP/i);
  assert.doesNotMatch(brokerSpec, /deliberately not read|without reading or consuming/i);
});
