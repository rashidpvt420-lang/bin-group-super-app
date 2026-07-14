import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mailDelivery = readFileSync('functions/mailDelivery.ts', 'utf8');
const contractOtp = readFileSync('functions/contractSignatureOtp.ts', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');

for (const [label, source] of [
  ['mailDelivery', mailDelivery],
  ['contractSignatureOtp', contractOtp],
]) {
  test(`${label} imports Firebase Secret Manager parameters`, () => {
    assert.match(source, /import\s*\{\s*defineSecret\s*\}\s*from\s*["']firebase-functions\/params["']/);
    assert.doesNotMatch(source, /const\s+defineSecret\s*=|function\s+defineSecret\s*\(/);
    assert.match(source, /defineSecret\(["']SMTP_USER["']\)/);
    assert.match(source, /defineSecret\(["']SMTP_PASS["']\)/);
  });
}

test('queued mail trigger binds both SMTP secrets at deployment', () => {
  const triggerBlock = mailDelivery.slice(
    mailDelivery.indexOf('export const sendQueuedMailOnCreate'),
    mailDelivery.indexOf('export const adminRetryMailDelivery'),
  );
  assert.match(triggerBlock, /secrets:\s*\[\s*smtpUser\s*,\s*smtpPass\s*\]/);
});

test('admin retry callable binds both SMTP secrets at deployment', () => {
  const callableBlock = mailDelivery.slice(mailDelivery.indexOf('export const adminRetryMailDelivery'));
  assert.match(callableBlock, /secrets:\s*\[\s*smtpUser\s*,\s*smtpPass\s*\]/);
});

test('contract signature OTP request binds both SMTP secrets at deployment', () => {
  const requestBlock = contractOtp.slice(
    contractOtp.indexOf('export const requestContractSignatureOtp'),
    contractOtp.indexOf('export const verifyContractSignatureOtp'),
  );
  assert.match(requestBlock, /secrets:\s*\[\s*smtpUser\s*,\s*smtpPass\s*\]/);
});

test('corrected mail and OTP functions are exported by the deployed runtime', () => {
  assert.match(runtime, /export\s+\*\s+from\s+["']\.\/mailDelivery["']/);
  assert.match(runtime, /export\s+\*\s+from\s+["']\.\/contractSignatureOtp["']/);
});
