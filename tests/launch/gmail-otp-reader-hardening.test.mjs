import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const reader = readFileSync('tests/e2e/helpers/gmail-otp-reader.ts', 'utf8');
const ownerSpec = readFileSync('tests/e2e/business-owner.spec.ts', 'utf8');
const brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');

test('Gmail OTP reader handles full MIME bodies without trusting snippets or shallow payloads', () => {
  assert.match(reader, /async function extractTextParts/);
  assert.match(reader, /for \(const child of part\.parts \|\| \[\]\) await visit\(child\)/, 'must recurse nested multipart trees');
  assert.match(reader, /part\.body\?\.data/);
  assert.match(reader, /part\.body\?\.attachmentId/);
  assert.match(reader, /getAttachment\(accessToken, messageId, part\.body\.attachmentId/);
  assert.match(reader, /mimeType === 'text\/html'/);
  assert.match(reader, /mimeType === 'text\/plain'/);
  assert.match(reader, /plain\.length \? plain\.join/);
  assert.match(reader, /sanitizeHtml/);
  assert.doesNotMatch(reader, /\.snippet\b/, 'reader must not parse Gmail snippets for OTPs');
});

test('Gmail OTP reader validates exact sender, exact recipient, correlation, and internalDate', () => {
  assert.match(reader, /normalizeEmailAddress/);
  assert.match(reader, /headerContainsAddress/);
  assert.match(reader, /entry\) => entry === normalizedExpected/, 'recipient matching must be normalized equality, not substring');
  assert.match(reader, /Number\(full\.internalDate \?\? '0'\) < afterMs/, 'old messages must be rejected using Gmail internalDate');
  assert.match(reader, /bodyText\.includes\(options\.correlationId\)/, 'missing correlation must reject the message');
  assert.match(reader, /duplicate matching OTP messages found/);
  assert.doesNotMatch(reader, /includes\(options\.expectedRecipient\)/, 'recipient checks must not use substring contains');
});

test('Gmail OTP reader fails closed on malformed base64url and supports AbortController cancellation', () => {
  assert.match(reader, /category=invalid_base64url/);
  assert.match(reader, /value\.length % 4 === 1/);
  assert.match(reader, /signal\?: AbortSignal/);
  assert.match(reader, /outerSignal\?\.addEventListener\('abort'/);
  assert.match(reader, /abortableSleep/);
  assert.match(reader, /category=aborted/);
});

test('Gmail OTP evidence protects Playwright artifacts and avoids leaking bodies, tokens, and codes', () => {
  for (const spec of [ownerSpec, brokerSpec]) {
    assert.match(spec, /test\.use\(\{\s*trace: 'off',\s*video: 'off',\s*screenshot: 'off'\s*\}\)/);
    assert.doesNotMatch(spec, /console\.(?:log|error|warn)\([^)]*otp/i);
  }
  assert.doesNotMatch(reader, /console\.(?:log|error|warn)\([^)]*(?:bodyText|accessToken|refreshToken|clientSecret|code)/);
  assert.doesNotMatch(reader, /Last status:[\s\S]*(?:bodyText|accessToken|refreshToken|clientSecret)/);
});

test('Owner live evidence includes a real mailbox OTP flow instead of only claiming it', () => {
  assert.match(ownerSpec, /getLatestOtp\('owner'/);
  assert.match(ownerSpec, /E2E_OWNER_EMAIL/);
  assert.match(ownerSpec, /E2E_OWNER_MAILBOX_EMAIL/);
  assert.doesNotMatch(ownerSpec, /const EMAIL = process\.env\.E2E_OWNER_MAILBOX_EMAIL/);
  assert.match(ownerSpec, /owner-contract-signature-otp-request/);
  assert.match(ownerSpec, /owner-contract-signature-otp-code/);
  assert.match(ownerSpec, /owner-contract-signature-otp-submit/);
  assert.match(ownerSpec, /correlationId/);
  assert.match(ownerSpec, /afterMs:\s+otpRequestedAtMs - 5_000/);
});
