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
  "import { mkdirSync, writeFileSync } from 'node:fs';\nimport { execFileSync } from 'node:child_process';",
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

function decodeMailboxBase64Url(value) {
  const normalized = text(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function mailboxHeader(message, name) {
  const headers = Array.isArray(message?.payload?.headers) ? message.payload.headers : [];
  return text(headers.find((entry) => text(entry?.name).toLowerCase() === name.toLowerCase())?.value);
}

function mailboxBody(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const own = text(payload.body?.data) ? decodeMailboxBase64Url(payload.body.data) : '';
  const parts = Array.isArray(payload.parts) ? payload.parts : [];
  const plain = parts.find((part) => text(part.mimeType).toLowerCase() === 'text/plain');
  if (plain) return mailboxBody(plain);
  const nested = parts.map(mailboxBody).find(Boolean);
  return own || nested || '';
}

async function ownerMailboxAccessToken() {
  const clientId = resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_CLIENT_ID');
  const clientSecret = resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_CLIENT_SECRET');
  const refreshToken = resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_REFRESH_TOKEN');
  const body = await jsonRequest('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  }, 'Owner mailbox OAuth exchange');
  assert(text(body.access_token), 'Owner mailbox OAuth exchange did not return an access token.');
  return text(body.access_token);
}

async function verifyOwnerMailboxIdentity(accessToken) {
  const profile = await jsonRequest(
    'https://gmail.googleapis.com/gmail/v1/users/me/profile',
    { headers: { Authorization: \`Bearer \${accessToken}\` } },
    'Owner mailbox identity read',
  );
  const authenticatedMailboxEmail = text(profile.emailAddress).toLowerCase();
  assert(authenticatedMailboxEmail, 'Owner mailbox profile did not return an email address.');
  assert(
    authenticatedMailboxEmail === ownerEmail,
    'Authenticated Gmail mailbox does not belong to the Owner test identity.',
  );
  return authenticatedMailboxEmail;
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
  await verifyOwnerMailboxIdentity(accessToken);
  const deadline = Date.now() + timeoutMs;
  const query = \`from:ceo@bin-groups.com to:\${ownerEmail} subject:"BIN GROUP contract signature OTP" newer_than:1d\`;
  while (Date.now() < deadline) {
    const list = await jsonRequest(
      \`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10&q=\${encodeURIComponent(query)}\`,
      { headers: { Authorization: \`Bearer \${accessToken}\` } },
      'Owner mailbox message search',
    );
    for (const candidate of Array.isArray(list.messages) ? list.messages : []) {
      const message = await jsonRequest(
        \`https://gmail.googleapis.com/gmail/v1/users/me/messages/\${encodeURIComponent(candidate.id)}?format=full\`,
        { headers: { Authorization: \`Bearer \${accessToken}\` } },
        'Owner mailbox message read',
      );
      const receivedAtMs = Number(message.internalDate || 0);
      if (!Number.isFinite(receivedAtMs) || receivedAtMs < requestedAt - 10000) continue;
      const from = mailboxHeader(message, 'From');
      const to = mailboxHeader(message, 'To').toLowerCase();
      const subject = mailboxHeader(message, 'Subject');
      const receivedMessageId = normalizeMailboxMessageId(mailboxHeader(message, 'Message-ID'));
      if (!/ceo@bin-groups\\.com/i.test(from)) continue;
      if (!to.includes(ownerEmail) || subject !== 'BIN GROUP contract signature OTP') continue;
      if (normalizeMailboxMessageId(providerMessageId) !== receivedMessageId) continue;
      const match = mailboxBody(message.payload).match(/contract signature OTP:\\s*(\\d{6})/i);
      if (!match) continue;
      return {
        code: match[1],
        providerMessageId,
        mailboxReceiptVerified: true,
        mailboxReceivedAt: new Date(receivedAtMs).toISOString(),
        mailboxMessageIdHash: sha256(receivedMessageId),
      };
    }
    await sleep(5000);
  }
  throw new Error('Timed out waiting for the provider-confirmed Owner OTP in the verified mailbox.');
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
  'gmail.googleapis.com/gmail/v1/users/me/profile',
  'authenticatedMailboxEmail === ownerEmail',
  'gmail.googleapis.com/gmail/v1/users/me/messages',
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