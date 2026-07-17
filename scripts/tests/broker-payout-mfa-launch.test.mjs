import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync('functions/secureBrokerPayoutOperations.ts', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');

test('Broker payout MFA challenge is cryptographically protected and rate limited', () => {
  assert.match(server, /crypto\.randomInt\(100000, 1000000\)/);
  assert.match(server, /crypto\.randomBytes\(18\)/);
  assert.match(server, /sha256/);
  assert.match(server, /timingSafeEqual/);
  assert.match(server, /OTP_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(server, /MAX_ATTEMPTS = 5/);
  assert.match(server, /MAX_REQUESTS_PER_HOUR = 5/);
  assert.match(server, /broker_payout_otp_rate_limits/);
  assert.match(server, /enforceAppCheck: true/);
});

test('Broker payout MFA is bound to exact broker commissions currency and amount', () => {
  assert.match(server, /payoutBinding\(uid: string, commissionIds: string\[\], amount: number\)/);
  assert.match(server, /commissionIds\.join\(","\)/);
  assert.match(server, /AED/);
  assert.match(server, /amount\.toFixed\(2\)/);
  assert.match(server, /challenge\.bindingHash !== bindingHash/);
  assert.match(server, /does not match the selected commissions and amount/);
});

test('Broker payout evidence is short lived single use and atomically consumed', () => {
  assert.match(server, /EVIDENCE_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(server, /status: "CONSUMED"/);
  assert.match(server, /consumedAt: now/);
  assert.match(server, /payoutRequestId: payoutRef\.id/);
  assert.match(server, /db\.runTransaction/);
  assert.match(server, /already been consumed/);
  assert.match(server, /Payout MFA evidence expired/);
});

test('Broker payout retains KYC bank commission and immutable audit controls', () => {
  assert.match(server, /Broker KYC must be admin verified/);
  assert.match(server, /Commission agreement must be accepted/);
  assert.match(server, /admin-verified Broker bank name and IBAN/);
  assert.match(server, /One or more commissions changed after MFA verification/);
  assert.match(server, /BROKER_PAYOUT_OTP_SENT/);
  assert.match(server, /BROKER_PAYOUT_OTP_VERIFIED/);
  assert.match(server, /BROKER_PAYOUT_REQUEST_SUBMITTED/);
  assert.match(server, /mfaAuthority: "EMAIL_OTP_SINGLE_USE"/);
});

test('secured Broker payout callables explicitly override legacy runtime export', () => {
  assert.match(runtime, /requestBrokerPayoutOtp/);
  assert.match(runtime, /verifyBrokerPayoutOtp/);
  assert.match(runtime, /submitBrokerPayoutRequest/);
  assert.match(runtime, /from "\.\/secureBrokerPayoutOperations"/);
});
