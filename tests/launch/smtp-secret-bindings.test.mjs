import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mailDelivery = readFileSync('functions/mailDelivery.ts', 'utf8');
const contractOtp = readFileSync('functions/contractSignatureOtpMailbox.ts', 'utf8');
const brokerPayoutOtp = readFileSync('functions/secureBrokerPayoutOperations.ts', 'utf8');
const runtime = readFileSync('functions/runtime.ts', 'utf8');
const productionSecretPreflight = readFileSync('scripts/verify-firebase-production-secrets.mjs', 'utf8');

for (const [label, source] of [
  ['mailDelivery', mailDelivery],
  ['contractSignatureOtpMailbox', contractOtp],
  ['secureBrokerPayoutOperations', brokerPayoutOtp],
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

test('Owner contract OTP callables separate SMTP delivery from the HMAC pepper', () => {
  assert.match(contractOtp, /defineSecret\(["']OWNER_CONTRACT_OTP_PEPPER["']\)/);
  const requestBlock = contractOtp.slice(
    contractOtp.indexOf('export const requestContractSignatureOtp'),
    contractOtp.indexOf('export const verifyContractSignatureOtp'),
  );
  const verifyBlock = contractOtp.slice(contractOtp.indexOf('export const verifyContractSignatureOtp'));
  assert.match(requestBlock, /secrets:\s*\[\s*smtpUser\s*,\s*smtpPass\s*,\s*ownerContractOtpPepper\s*\]/);
  assert.match(verifyBlock, /secrets:\s*\[\s*ownerContractOtpPepper\s*\]/);
  assert.doesNotMatch(contractOtp, /retrieveContractSignatureOtpForTestEvidence/);
  assert.doesNotMatch(contractOtp, /testEvidence/);
});

test('production secret preflight requires the Owner OTP pepper for every launch mode', () => {
  const deploymentContract = productionSecretPreflight.slice(
    productionSecretPreflight.indexOf('requiredFirebaseDeploymentSecrets'),
    productionSecretPreflight.indexOf('requiredFirebaseBankPilotSecrets'),
  );
  assert.match(deploymentContract, /OWNER_CONTRACT_OTP_PEPPER/);
  assert.match(productionSecretPreflight, /requiredFirebaseBankPilotSecrets = Object\.freeze\(\[\s*\.\.\.requiredFirebaseDeploymentSecrets/);
  assert.match(productionSecretPreflight, /requiredFirebasePublicSecrets = Object\.freeze\(\[\s*\.\.\.requiredFirebaseDeploymentSecrets/);
});

test('Broker payout OTP request binds SMTP secrets and its dedicated HMAC pepper', () => {
  const requestBlock = brokerPayoutOtp.slice(
    brokerPayoutOtp.indexOf('export const requestBrokerPayoutOtp'),
    brokerPayoutOtp.indexOf('export const verifyBrokerPayoutOtp'),
  );
  assert.match(requestBlock, /secrets:\s*\[\s*smtpUser\s*,\s*smtpPass\s*,\s*brokerPayoutOtpPepper\s*\]/);
});

test('corrected mail and OTP functions are exported by the deployed runtime', () => {
  assert.match(runtime, /export\s+\*\s+from\s+["']\.\/mailDelivery["']/);
  assert.match(runtime, /export\s+\*\s+from\s+["']\.\/contractSignatureOtpMailbox["']/);
  assert.doesNotMatch(runtime, /export\s+\*\s+from\s+["']\.\/contractSignatureOtpSecure["']/);
  assert.doesNotMatch(runtime, /export\s+\*\s+from\s+["']\.\/contractSignatureOtp["']/);
  assert.match(runtime, /requestBrokerPayoutOtp/);
  assert.match(runtime, /from\s+["']\.\/secureBrokerPayoutOperations["']/);
});