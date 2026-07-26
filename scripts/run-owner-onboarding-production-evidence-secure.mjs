#!/usr/bin/env node

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, 'run-owner-onboarding-production-evidence.mjs');
const temporaryPath = path.join(
  __dirname,
  `.owner-onboarding-production-evidence-secure-${process.pid}-${randomUUID()}.mjs`,
);

if (!existsSync(templatePath)) {
  throw new Error(`Owner production evidence template is missing: ${templatePath}`);
}

const source = readFileSync(templatePath, 'utf8');
const startMarker = 'async function deriveOtp(requestId) {';
const endMarker = 'function paymentManifest(configuration, quote, receipt, reference) {';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);
if (start < 0 || end < 0 || end <= start) {
  throw new Error('Owner evidence OTP template block was not found. Refusing an unverified source transformation.');
}

const legacyBlock = source.slice(start, end);
if (!legacyBlock.includes('for (let number = 0; number <= 999999; number += 1)')) {
  throw new Error('Owner evidence template no longer matches the reviewed legacy OTP block. Refusing to guess.');
}

const secureBlock = `async function retrieveProtectedOtpEvidence(ownerSession, appCheckToken, requestId) {
  const before = await db.collection('contract_signature_otps').doc(requestId).get();
  assert(before.exists, \`OTP evidence \${requestId} was not persisted.\`);
  const beforeData = before.data() || {};
  assert(beforeData.otpHashAlgorithm === 'HMAC_SHA256_SMTP_SECRET_V1', 'OTP evidence is not protected by the required HMAC algorithm.');
  assert(/^[a-f0-9]{64}$/.test(text(beforeData.otpHash)), 'OTP HMAC evidence is missing or malformed.');
  assert(beforeData.otp === undefined && beforeData.code === undefined, 'OTP evidence must never store a plaintext code.');
  assert(beforeData.testEvidence?.algorithm === 'AES_256_GCM_SMTP_SECRET_V1', 'Encrypted E2E OTP evidence is missing.');
  assert(text(beforeData.testEvidence?.ciphertext), 'Encrypted E2E OTP evidence has no ciphertext.');
  assert(text(beforeData.delivery?.messageId), 'Contract OTP SMTP provider did not return a message ID.');

  const result = await callFunction('retrieveContractSignatureOtpForTestEvidence', {
    requestId,
  }, appCheckToken, ownerSession.idToken);
  assert(result.ok === true && text(result.requestId) === requestId, 'Protected OTP evidence retrieval failed.');
  assert(/^\\d{6}$/.test(text(result.otp)), 'Protected OTP evidence did not return a six-digit code.');
  assert(text(result.providerMessageId) === text(beforeData.delivery?.messageId), 'Protected OTP evidence is not bound to the SMTP provider message ID.');
  assert(text(result.channel) === 'protected_test_callable', 'Protected OTP evidence used an unexpected channel.');

  const after = await db.collection('contract_signature_otps').doc(requestId).get();
  const afterData = after.data() || {};
  assert(afterData.testEvidence?.retrieved === true, 'Protected OTP evidence was not marked as retrieved.');
  assert(!text(afterData.testEvidence?.ciphertext), 'Protected OTP ciphertext was not destroyed after one-time retrieval.');
  return { code: text(result.otp), providerMessageId: text(result.providerMessageId) };
}

async function verifyContractOtp(ownerSession, appCheckToken, intakeId, quoteHash, signatureName, propertyName) {
  const requested = await callFunction('requestContractSignatureOtp', {
    email: ownerEmail,
    contractId: intakeId,
    contractHash: quoteHash,
    propertyName,
  }, appCheckToken, ownerSession.idToken);
  const requestId = text(requested.requestId);
  assert(requestId, 'Contract OTP request did not return a request ID.');
  const protectedEvidence = await retrieveProtectedOtpEvidence(ownerSession, appCheckToken, requestId);
  const verified = await callFunction('verifyContractSignatureOtp', {
    requestId,
    otp: protectedEvidence.code,
    signature: signatureName,
  }, appCheckToken, ownerSession.idToken);
  assert(verified.ok === true && text(verified.verificationId) === requestId, 'Contract OTP verification failed.');
  return { verificationId: requestId, providerMessageId: protectedEvidence.providerMessageId };
}

`;

const transformed = `${source.slice(0, start)}${secureBlock}${source.slice(end)}`;
if (transformed.includes('for (let number = 0; number <= 999999; number += 1)')) {
  throw new Error('Protected Owner evidence still contains the six-digit OTP search loop.');
}
if (!transformed.includes("callFunction('retrieveContractSignatureOtpForTestEvidence'")) {
  throw new Error('Protected Owner evidence is not bound to the secure one-time OTP callable.');
}

writeFileSync(temporaryPath, transformed, { mode: 0o600 });
try {
  const result = spawnSync(process.execPath, [temporaryPath], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(temporaryPath, { force: true });
}
