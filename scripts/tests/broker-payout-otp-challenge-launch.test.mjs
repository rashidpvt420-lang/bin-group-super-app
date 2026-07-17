import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync('functions/brokerPayoutOtp.ts', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');

test('Broker payout OTP challenge is cryptographically protected', () => {
  assert.match(server, /crypto\.randomInt\(100000, 1000000\)/);
  assert.match(server, /crypto\.randomBytes\(18\)/);
  assert.match(server, /createHash\("sha256"\)/);
  assert.match(server, /crypto\.timingSafeEqual/);
  assert.match(server, /OTP_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(server, /EVIDENCE_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(server, /MAX_ATTEMPTS = 5/);
  assert.match(server, /MAX_REQUESTS_PER_HOUR = 5/);
});

test('Broker payout OTP is bound to exact commissions and amount', () => {
  assert.match(server, /commissionIds\.join\(","\)/);
  assert.match(server, /amount\.toFixed\(2\)/);
  assert.match(server, /bindingHash/);
  assert.match(server, /broker_commissions/);
  assert.match(server, /One or more commissions are not eligible/);
});

test('Broker payout OTP requires active verified Broker authority', () => {
  assert.match(server, /admin\.auth\(\)\.getUser/);
  assert.match(server, /record\.emailVerified !== true/);
  assert.match(server, /role !== "broker"/);
  assert.match(server, /reraVerified !== true/);
  assert.match(server, /brokerKycStatus/);
  assert.match(server, /enforceAppCheck: true/);
});

test('Broker payout OTP records immutable audit events', () => {
  assert.match(server, /BROKER_PAYOUT_OTP_SENT/);
  assert.match(server, /BROKER_PAYOUT_OTP_VERIFIED/);
  assert.match(server, /audit_logs/);
});

test('Broker payout OTP exports are unique and explicit', () => {
  assert.match(runtime, /export \{ requestBrokerPayoutOtp, verifyBrokerPayoutOtp \} from "\.\/brokerPayoutOtp"/);
  assert.doesNotMatch(runtime, /export \* from "\.\/brokerPayoutOtp"/);
});
