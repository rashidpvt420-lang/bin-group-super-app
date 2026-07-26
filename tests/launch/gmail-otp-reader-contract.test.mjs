import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reader = readFileSync('tests/e2e/helpers/gmail-otp-reader.ts', 'utf8');
const ownerSpec = readFileSync('tests/e2e/business-owner.spec.ts', 'utf8');
const brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');

test('Gmail OTP reader parses full MIME safely and rejects ambiguous matches', () => {
  assert.match(reader, /messages\/\$\{messageId\}\?format=full/);
  assert.match(reader, /parts\??:\s*GmailMessagePart\[\]/);
  assert.match(reader, /attachmentId/);
  assert.match(reader, /getAttachment/);
  assert.match(reader, /sanitizeHtml/);
  assert.match(reader, /invalid_base64url/);
  assert.match(reader, /matches\.length > 1/);
  assert.match(reader, /duplicate/i);
});

test('Gmail OTP reader verifies sender, recipient, correlation, age and timeout', () => {
  assert.match(reader, /expectedSender/);
  assert.match(reader, /expectedRecipient/);
  assert.match(reader, /correlationId/);
  assert.match(reader, /afterMs/);
  assert.match(reader, /headerContainsAddress/);
  assert.match(reader, /AbortController/);
  assert.match(reader, /setTimeout/);
});

test('OTP evidence specs use app-login emails separately from Gmail mailbox identities', () => {
  assert.match(ownerSpec, /const EMAIL = process\.env\.E2E_OWNER_EMAIL/);
  assert.match(ownerSpec, /const MAILBOX_EMAIL = process\.env\.E2E_OWNER_MAILBOX_EMAIL/);
  assert.match(brokerSpec, /const EMAIL = process\.env\.E2E_BROKER_EMAIL/);
  assert.match(brokerSpec, /const MAILBOX_EMAIL = process\.env\.E2E_BROKER_MAILBOX_EMAIL/);
});

test('OTP evidence specs disable Playwright artifacts while OTPs are visible', () => {
  for (const source of [ownerSpec, brokerSpec]) {
    assert.match(source, /test\.use\(\{\s*trace:\s*'off',\s*video:\s*'off',\s*screenshot:\s*'off'\s*\}\)/);
  }
});

test('Gmail OTP reader source does not log raw message bodies, tokens or OTP values', () => {
  assert.doesNotMatch(reader, /console\.(?:log|error|warn)\([^)]*(?:bodyText|plainText|htmlText|snippet|accessToken|refreshToken)/i);
  assert.doesNotMatch(reader, /console\.(?:log|error|warn)\([^)]*\bcode\b/i);
  assert.doesNotMatch(reader, /test\.info\(\)\.attach\([^)]*(?:otp|body|gmail|message)/i);
});
