#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';

function replaceExact(path, before, after) {
  const source = readFileSync(path, 'utf8');
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one exact contract block, found ${count}.`);
  writeFileSync(path, source.replace(before, after), 'utf8');
}

function groupE2eEnvironmentWrites(path) {
  const source = readFileSync(path, 'utf8');
  const lines = source.split('\n');
  const stepIndex = lines.findIndex((line) => line.includes('- name: Create E2E environment for live proofs'));
  if (stepIndex < 0) throw new Error(`${path}: live-proof E2E environment step is missing.`);
  const runIndex = lines.findIndex((line, index) => index > stepIndex && line.trim() === 'run: |');
  if (runIndex < 0) throw new Error(`${path}: live-proof E2E run block is missing.`);
  const firstPrintf = lines.findIndex((line, index) => index > runIndex && /^\s+printf .+ > \.env\.e2e$/.test(line));
  if (firstPrintf < 0) throw new Error(`${path}: first .env.e2e write is missing.`);
  let lastPrintf = firstPrintf;
  while (lastPrintf + 1 < lines.length && /^\s+printf .+ >> \.env\.e2e$/.test(lines[lastPrintf + 1])) {
    lastPrintf += 1;
  }
  if (lastPrintf === firstPrintf) throw new Error(`${path}: expected multiple .env.e2e writes.`);
  const indent = lines[firstPrintf].match(/^\s*/)?.[0] || '';
  const commands = lines.slice(firstPrintf, lastPrintf + 1).map((line) => {
    const command = line.replace(/\s+(?:>>|>) \.env\.e2e$/, '').trimStart();
    return `${indent}  ${command}`;
  });
  lines.splice(firstPrintf, lastPrintf - firstPrintf + 1, `${indent}{`, ...commands, `${indent}} > .env.e2e`);
  writeFileSync(path, lines.join('\n'), 'utf8');
}

replaceExact(
  'tests/launch/broker-payout-otp-live-evidence.test.mjs',
  "const productionRunner = readFileSync('scripts/run-broker-production-evidence.mjs', 'utf8');\nconst brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');",
  "const productionRunner = readFileSync('scripts/run-broker-production-evidence.mjs', 'utf8');\nconst gmailReader = readFileSync('scripts/lib/gmail-otp-reader.mjs', 'utf8');\nconst brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');",
);
replaceExact(
  'tests/launch/broker-payout-otp-live-evidence.test.mjs',
  "  assert.match(productionRunner, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n  assert.match(productionRunner, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/profile/);\n  assert.match(productionRunner, /mailboxProfile\\.emailAddress/);\n  assert.match(productionRunner, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);",
  "  assert.match(productionRunner, /E2E_BROKER_MAILBOX_CLIENT_ID/);\n  assert.match(productionRunner, /exchangeGmailAccessToken, readGmailOtp/);\n  assert.match(productionRunner, /expectedMailboxEmail: brokerMailboxEmail/);\n  assert.match(productionRunner, /correlationId/);\n  assert.match(gmailReader, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/profile/);\n  assert.match(gmailReader, /gmail\\.googleapis\\.com\\/gmail\\/v1\\/users\\/me\\/messages/);\n  assert.match(gmailReader, /attachments\\/\\$\\{encodeURIComponent\\(attachmentId\\)\\}/);",
);

replaceExact(
  'tests/launch/owner-onboarding-production-proof.test.mjs',
  "const secureLifecycle = fs.readFileSync(new URL('../../scripts/run-owner-onboarding-production-evidence-secure.mjs', import.meta.url), 'utf8');\nconst wrapper = fs.readFileSync",
  "const secureLifecycle = fs.readFileSync(new URL('../../scripts/run-owner-onboarding-production-evidence-secure.mjs', import.meta.url), 'utf8');\nconst gmailReader = fs.readFileSync(new URL('../../scripts/lib/gmail-otp-reader.mjs', import.meta.url), 'utf8');\nconst wrapper = fs.readFileSync",
);
replaceExact(
  'tests/launch/owner-onboarding-production-proof.test.mjs',
  "  'functions:secrets:access',\n  'gmail.googleapis.com/gmail/v1/users/me/profile',\n  'authenticatedMailboxEmail === ownerEmail',\n  'gmail.googleapis.com/gmail/v1/users/me/messages',\n  \"subject !== 'BIN GROUP contract signature OTP'\",\n  'normalizeMailboxMessageId(providerMessageId) !== receivedMessageId',",
  "  'functions:secrets:access',\n  \"from './lib/gmail-otp-reader.mjs'\",\n  'expectedMailboxEmail: ownerMailboxEmail',\n  'recipient: ownerEmail',\n  \"subject: 'BIN GROUP contract signature OTP'\",\n  'correlationId: requestId',\n  'providerMessageId',",
);
replaceExact(
  'tests/launch/owner-onboarding-production-proof.test.mjs',
  "  'mailboxMessageIdHash: sha256(receivedMessageId)',",
  "  'mailboxMessageIdHash: receipt.messageIdHash',",
);
replaceExact(
  'tests/launch/owner-onboarding-production-proof.test.mjs',
  "for (const token of [\n  'defineSecret(\"OWNER_CONTRACT_OTP_PEPPER\")',",
  "for (const token of [\n  'gmail.googleapis.com/gmail/v1/users/me/profile',\n  'gmail.googleapis.com/gmail/v1/users/me/messages',\n  'attachments/${encodeURIComponent(attachmentId)}',\n  'matched multiple messages',\n  'strict base64url',\n]) {\n  assert.ok(gmailReader.includes(token), `Shared Gmail OTP reader is missing: ${token}`);\n}\n\nfor (const token of [\n  'defineSecret(\"OWNER_CONTRACT_OTP_PEPPER\")',",
);

groupE2eEnvironmentWrites('.github/workflows/firebase-production-deploy.yml');

console.log('[fix-launch-evidence-test-contracts] aligned shared Gmail contracts and grouped .env.e2e writes.');
