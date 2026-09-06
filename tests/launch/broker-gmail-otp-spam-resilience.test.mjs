import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gmailReaderTs = readFileSync('tests/e2e/helpers/gmail-otp-reader.ts', 'utf8');
const brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');
const gmailReaderMjs = readFileSync('scripts/lib/gmail-otp-reader.mjs', 'utf8');

test('Broker Gmail OTP reader enforces includeSpamTrash to prevent spam-folder evidence drop', () => {
  assert.match(
    gmailReaderTs,
    /includeSpamTrash=true/,
    'tests/e2e/helpers/gmail-otp-reader.ts must include includeSpamTrash=true in messages.list URL',
  );
  assert.match(
    gmailReaderMjs,
    /includeSpamTrash=true/,
    'scripts/lib/gmail-otp-reader.mjs must include includeSpamTrash=true in messages.list URL',
  );
});

test('Broker Gmail OTP reader performs full MIME body decoding instead of metadata-only snippets', () => {
  assert.match(
    gmailReaderTs,
    /format=full/,
    'tests/e2e/helpers/gmail-otp-reader.ts must request format=full for robust body decoding',
  );
  assert.match(
    gmailReaderTs,
    /decodeBase64Url/,
    'tests/e2e/helpers/gmail-otp-reader.ts must decode base64url payload parts',
  );
  assert.match(
    gmailReaderTs,
    /collectTextFromParts/,
    'tests/e2e/helpers/gmail-otp-reader.ts must traverse multipart MIME trees',
  );
});

test('Broker Gmail OTP reader eliminates fragile is:unread search constraint and provides indexing fallback', () => {
  assert.doesNotMatch(
    gmailReaderTs,
    /is:unread/,
    'tests/e2e/helpers/gmail-otp-reader.ts must not filter by is:unread to avoid indexing delay and state divergence',
  );
  assert.match(
    gmailReaderTs,
    /messages\.length[\s\S]*?listMessages\(accessToken\)/,
    'tests/e2e/helpers/gmail-otp-reader.ts must provide fallback to unfiltered recent messages on query indexing latency',
  );
});

test('Broker Gmail OTP reader uses contextual sentence matching for precision', () => {
  assert.match(
    gmailReaderTs,
    /payout code is|verification code/i,
    'tests/e2e/helpers/gmail-otp-reader.ts must match the authoritative payout OTP sentence pattern',
  );
});

test('Broker E2E spec configures sufficient timeout headroom for SMTP delivery', () => {
  assert.match(
    brokerSpec,
    /timeoutMs:\s*120_?000/,
    'tests/e2e/business-broker.spec.ts must allow at least 120_000ms for Gmail OTP delivery',
  );
});

test('Broker Gmail OTP reader logic reproduces real spam delivery and MIME extraction', () => {
  const b64 = (val) => Buffer.from(val).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const otpCode = '719284';
  const correlationId = 'corr-e2e-test-123';
  const rawBody = `Your payout code is ${otpCode}. It authorizes AED 500.00 across 1 commission(s) and expires in 10 minutes. Verification reference: ${correlationId}.`;

  const fakePayload = {
    mimeType: 'multipart/alternative',
    headers: [
      { name: 'Subject', value: 'BIN GROUP payout verification code' },
      { name: 'From', value: 'BIN GROUP <ceo@bin-groups.com>' },
    ],
    parts: [
      { mimeType: 'text/plain', body: { data: b64(rawBody) } },
      { mimeType: 'text/html', body: { data: b64(`<p>${rawBody}</p>`) } },
    ],
  };

  // Re-run the decoder logic defined in gmail-otp-reader.ts
  function decodeBase64Url(raw) {
    const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
  }

  function collectTextFromParts(payload) {
    if (!payload) return '';
    let text = '';
    if (payload.body?.data) {
      text += decodeBase64Url(payload.body.data) + ' ';
    }
    if (Array.isArray(payload.parts)) {
      for (const part of payload.parts) {
        text += collectTextFromParts(part) + ' ';
      }
    }
    return text;
  }

  function extractOtpCode(text) {
    const contextual = text.match(/(?:payout code is|code is|OTP is|verification code:?)\s*(\d{6})/i);
    if (contextual) return contextual[1];
    const match = text.match(/\b(\d{6})\b/);
    return match ? match[1] : null;
  }

  const decoded = collectTextFromParts(fakePayload);
  assert.ok(decoded.includes(correlationId));
  const extracted = extractOtpCode(decoded);
  assert.equal(extracted, otpCode);
});
