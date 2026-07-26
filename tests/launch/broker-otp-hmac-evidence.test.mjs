import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Broker payout OTP hashes use a protected server-side HMAC pepper', async () => {
  const source = await read('functions/secureBrokerPayoutOperations.ts');
  assert.match(source, /defineSecret\("BROKER_PAYOUT_OTP_PEPPER"\)/);
  assert.match(source, /OTP_HASH_VERSION\s*=\s*"HMAC_SHA256_V1"/);
  assert.match(source, /createHmac\("sha256", otpPepper\(\)\)/);
  assert.match(source, /challengeId[\s\S]*uid[\s\S]*bindingHash[\s\S]*otp[\s\S]*salt/);
  assert.match(source, /secrets:\s*\[smtpUser, smtpPass, brokerPayoutOtpPepper\]/);
  assert.match(source, /secrets:\s*\[brokerPayoutOtpPepper\]/);
  assert.match(source, /LEGACY_CHALLENGE/);
  assert.doesNotMatch(source, /createHash\("sha256"\)\.update\(`?\$?\{?otp/i);
});

test('Broker production evidence requires a real mailbox code and cannot derive it from Firestore', async () => {
  const source = await read('scripts/run-broker-production-evidence.mjs');
  assert.match(source, /E2E_BROKER_MAILBOX_CLIENT_ID/);
  assert.match(source, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages/);
  assert.match(source, /mailboxReceiptVerified:\s*true/);
  assert.match(source, /mailboxMessageIdHash/);
  assert.match(source, /otpHashVersion:\s*otpDelivery\.otpHashVersion/);
  assert.doesNotMatch(source, /deriveOtp/);
  assert.doesNotMatch(source, /value\.otpHash\b/);
  assert.doesNotMatch(source, /value\.salt\b/);
  assert.doesNotMatch(source, /number\s*<=\s*999999/);
  assert.doesNotMatch(source, /padStart\(6, ['"]0['"]\)/);
});
