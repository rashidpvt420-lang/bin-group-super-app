import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const server = readFileSync('functions/secureBrokerPayoutOperations.ts', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');
const page = readFileSync('src/broker/pages/BrokerCommissionsPage.tsx', 'utf8');

test('Broker payout OTP server authority is protected and bound', () => {
  assert.match(server, /requestBrokerPayoutOtp/);
  assert.match(server, /verifyBrokerPayoutOtp/);
  assert.match(server, /submitBrokerPayoutRequest/);
  assert.match(server, /enforceAppCheck: true/);
  assert.match(server, /SMTP_USER/);
  assert.match(server, /SMTP_PASS/);
  assert.match(server, /OTP_TTL_MS = 10 \* 60 \* 1000/);
  assert.match(server, /EVIDENCE_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(server, /MAX_ATTEMPTS = 5/);
  assert.match(server, /MAX_REQUESTS_PER_HOUR = 5/);
  assert.match(server, /timingSafeEqual/);
  assert.match(server, /commissionIds.*AED.*amount\.toFixed\(2\)/s);
  assert.match(server, /bindingHash !== bindingHash/);
});

test('Broker payout evidence is single use and audited atomically', () => {
  assert.match(server, /db\.runTransaction/);
  assert.match(server, /status: "CONSUMED"/);
  assert.match(server, /consumedAt: now/);
  assert.match(server, /payoutRequestId: payoutRef\.id/);
  assert.match(server, /BROKER_PAYOUT_OTP_SENT/);
  assert.match(server, /BROKER_PAYOUT_OTP_VERIFIED/);
  assert.match(server, /BROKER_PAYOUT_REQUEST_SUBMITTED_WITH_OTP/);
  assert.match(server, /One or more commissions changed after OTP verification/);
});

test('Broker UI executes request verify submit in order', () => {
  const requestIndex = page.indexOf("httpsCallable(functions, 'requestBrokerPayoutOtp')");
  const verifyIndex = page.indexOf("httpsCallable(functions, 'verifyBrokerPayoutOtp')");
  const submitIndex = page.indexOf("httpsCallable(functions, 'submitBrokerPayoutRequest')");
  assert.ok(requestIndex >= 0);
  assert.ok(verifyIndex > requestIndex);
  assert.ok(submitIndex > verifyIndex);
  assert.match(page, /Six-digit verification code/);
  assert.match(page, /Verify and submit/);
  assert.match(page, /challengeId: otp\.challengeId/);
  assert.doesNotMatch(page, /submitBrokerPayoutRequest'\);\s*const result = await callable\(\{ commissionIds/s);
});

test('Broker payout callables override legacy runtime exports', () => {
  assert.match(runtime, /requestBrokerPayoutOtp/);
  assert.match(runtime, /verifyBrokerPayoutOtp/);
  assert.match(runtime, /submitBrokerPayoutRequest/);
  assert.match(runtime, /from "\.\/secureBrokerPayoutOperations"/);
});
