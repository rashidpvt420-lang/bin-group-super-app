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
  `.owner-onboarding-production-evidence-mailbox-${process.pid}-${randomUUID()}.mjs`,
);

if (!existsSync(templatePath)) {
  throw new Error(`Owner production evidence template is missing: ${templatePath}`);
}

let source = readFileSync(templatePath, 'utf8');
source = source.replace(
  "import { mkdirSync, writeFileSync } from 'node:fs';",
  "import { mkdirSync, writeFileSync } from 'node:fs';\nimport { execFileSync } from 'node:child_process';\nimport { exchangeGmailAccessToken, readGmailOtp } from './lib/gmail-otp-reader.mjs';",
);

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

const mailboxBlock = `function resolveOwnerMailboxSecret(name) {
  const configured = text(process.env[name]);
  if (configured) return configured;
  try {
    return text(execFileSync(
      'npx',
      ['firebase', 'functions:secrets:access', name, '--project', PROJECT_ID],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ));
  } catch {
    throw new Error(\`\${name} is required as an environment value or Firebase Secret Manager secret for verified Owner mailbox evidence.\`);
  }
}

const normalizeMailboxMessageId = (value) => text(value).replace(/^<|>$/g, '').toLowerCase();
const ownerMailboxEmail = text(process.env.E2E_OWNER_MAILBOX_EMAIL).toLowerCase();
assert(ownerMailboxEmail, 'E2E_OWNER_MAILBOX_EMAIL is required for verified Owner mailbox evidence.');

async function ownerMailboxAccessToken() {
  return exchangeGmailAccessToken({
    clientId: resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_CLIENT_ID'),
    clientSecret: resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_CLIENT_SECRET'),
    refreshToken: resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_REFRESH_TOKEN'),
    label: 'Owner mailbox',
  });
}

async function retrieveOwnerMailboxOtp(requestId, timeoutMs = 120000) {
  const snapshot = await db.collection('contract_signature_otps').doc(requestId).get();
  assert(snapshot.exists, \`OTP evidence \${requestId} was not persisted.\`);
  const value = snapshot.data() || {};
  assert(value.otpHashAlgorithm === 'HMAC_SHA256_OWNER_CONTRACT_V1', 'Owner OTP evidence is not protected by the required HMAC algorithm.');
  assert(value.otp === undefined && value.code === undefined, 'Owner OTP evidence must never store a plaintext code.');
  assert(value.testEvidence === undefined, 'Owner OTP evidence must not expose encrypted test-retrieval material.');
  const providerMessageId = text(value.delivery?.messageId);
  assert(providerMessageId, 'Contract OTP SMTP provider did not return a message ID.');
  assert(text(value.delivery?.from) === BRANDED_FROM, 'Contract OTP did not use the approved BIN GROUP sender.');
  assert(value.delivery?.providerAccepted === true, 'Contract OTP provider did not accept the Owner mailbox.');
  const requestedAt = value.delivery?.sentAt?.toMillis?.() || value.createdAt?.toMillis?.() || Date.now() - 60000;
  const accessToken = await ownerMailboxAccessToken();
  const receipt = await readGmailOtp({
    accessToken,
    expectedMailboxEmail: ownerMailboxEmail,
    sender: 'ceo@bin-groups.com',
    recipient: ownerEmail,
    subject: 'BIN GROUP contract signature OTP',
    correlationId: requestId,
    providerMessageId,
    requestedAtMs: requestedAt,
    otpPattern: /contract signature OTP:\\s*(\\d{6})/i,
    timeoutMs,
    label: 'Owner contract OTP',
  });
  return {
    code: receipt.otp,
    providerMessageId,
    mailboxReceiptVerified: true,
    mailboxReceivedAt: receipt.receivedAt,
    mailboxMessageIdHash: receipt.messageIdHash,
  };
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
  assert(requested.deliveryConfirmed === true, 'Contract OTP callable did not confirm provider acceptance.');
  assert(requested.brandedSenderVerified === true, 'Contract OTP callable did not confirm the approved sender.');
  const mailboxEvidence = await retrieveOwnerMailboxOtp(requestId);
  const verified = await callFunction('verifyContractSignatureOtp', {
    requestId,
    otp: mailboxEvidence.code,
    signature: signatureName,
  }, appCheckToken, ownerSession.idToken);
  assert(verified.ok === true && text(verified.verificationId) === requestId, 'Contract OTP verification failed.');
  return {
    verificationId: requestId,
    providerMessageId: mailboxEvidence.providerMessageId,
    mailboxReceiptVerified: mailboxEvidence.mailboxReceiptVerified,
    mailboxReceivedAt: mailboxEvidence.mailboxReceivedAt,
    mailboxMessageIdHash: mailboxEvidence.mailboxMessageIdHash,
  };
}

`;

source = `${source.slice(0, start)}${mailboxBlock}${source.slice(end)}`;
source = source.replace(
  "source: 'run-owner-onboarding-production-evidence',",
  "source: 'run-owner-onboarding-production-evidence-mailbox',",
);
source = source.replace(
  'contractOtpInitialProviderMessageId: initialOtp.providerMessageId,',
  `contractOtpInitialProviderMessageId: initialOtp.providerMessageId,
      contractOtpInitialMailboxReceiptVerified: initialOtp.mailboxReceiptVerified,
      contractOtpInitialMailboxReceivedAt: initialOtp.mailboxReceivedAt,
      contractOtpInitialMailboxMessageIdHash: initialOtp.mailboxMessageIdHash,`,
);
source = source.replace(
  'contractOtpResubmissionProviderMessageId: resubmissionOtp.providerMessageId,',
  `contractOtpResubmissionProviderMessageId: resubmissionOtp.providerMessageId,
      contractOtpResubmissionMailboxReceiptVerified: resubmissionOtp.mailboxReceiptVerified,
      contractOtpResubmissionMailboxReceivedAt: resubmissionOtp.mailboxReceivedAt,
      contractOtpResubmissionMailboxMessageIdHash: resubmissionOtp.mailboxMessageIdHash,`,
);

const forbiddenRetrievalCall = ["callFunction(", "'retrieveContractSignatureOtpForTestEvidence'"].join('');
for (const forbidden of [
  'for (let number = 0; number <= 999999; number += 1)',
  forbiddenRetrievalCall,
  'beforeData.testEvidence',
  'protected_test_callable',
]) {
  if (source.includes(forbidden)) {
    throw new Error(`Mailbox-authoritative Owner evidence still contains forbidden OTP bypass: ${forbidden}`);
  }
}
for (const required of [
  "from './lib/gmail-otp-reader.mjs'",
    'expectedMailboxEmail: ownerMailboxEmail',
    'correlationId: requestId',
  'E2E_OWNER_MAILBOX_REFRESH_TOKEN',
  'mailboxReceiptVerified: true',
  'HMAC_SHA256_OWNER_CONTRACT_V1',
]) {
  if (!source.includes(required)) {
    throw new Error(`Mailbox-authoritative Owner evidence is missing required control: ${required}`);
  }
}

writeFileSync(temporaryPath, source, { mode: 0o600 });
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
