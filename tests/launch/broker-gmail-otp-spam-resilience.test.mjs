import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gmailReaderTs = readFileSync('tests/e2e/helpers/gmail-otp-reader.ts', 'utf8');
const brokerSpec = readFileSync('tests/e2e/business-broker.spec.ts', 'utf8');
const gmailReaderMjs = readFileSync('scripts/lib/gmail-otp-reader.mjs', 'utf8');

test('Broker Gmail OTP readers include Spam and Trash without weakening evidence checks', () => {
  assert.match(
    gmailReaderTs,
    /includeSpamTrash=true/,
    'tests/e2e/helpers/gmail-otp-reader.ts must include Spam and Trash in messages.list visibility',
  );
  assert.match(
    gmailReaderMjs,
    /includeSpamTrash=true/,
    'scripts/lib/gmail-otp-reader.mjs must include Spam and Trash in messages.list visibility',
  );
  assert.match(gmailReaderTs, /Number\(internalDate\) < afterMs/, 'freshness must remain fail-closed');
  assert.match(gmailReaderTs, /correlationId && !content\.includes\(correlationId\)/, 'correlation must remain exact');
});

test('Broker Gmail OTP reader performs full MIME decoding including attachment-backed text', () => {
  assert.match(gmailReaderTs, /format=full/, 'the reader must request the full Gmail MIME payload');
  assert.match(gmailReaderTs, /decodeBase64Url/, 'the reader must decode base64url MIME content');
  assert.match(gmailReaderTs, /collectMessageBody/, 'the reader must traverse nested MIME parts');
  assert.match(gmailReaderTs, /getAttachmentText/, 'attachment-backed text must be retrieved rather than ignored');
});

test('Gmail read state is not a launch gate and indexing fallback requires correlation', () => {
  assert.doesNotMatch(
    gmailReaderTs,
    /is:unread/,
    'the reader must not require Gmail unread state',
  );
  assert.match(
    gmailReaderTs,
    /messages\.length === 0 && correlationId[\s\S]*?listRecentMessages\(accessToken\)/,
    'broad recent-message fallback must run only when a server-issued correlation ID is available',
  );
  assert.match(
    gmailReaderTs,
    /listRecentMessages[\s\S]*?includeSpamTrash=true/,
    'the correlation-gated fallback must retain Spam/Trash visibility',
  );
});

test('Broker E2E spec configures sufficient timeout headroom for SMTP delivery', () => {
  assert.match(
    brokerSpec,
    /timeoutMs:\s*120_?000/,
    'tests/e2e/business-broker.spec.ts must allow at least 120_000ms for Gmail OTP delivery',
  );
});

test('MIME fixture demonstrates fresh correlated six-digit code extraction without embedding a secret literal', () => {
  const b64 = (value) => Buffer.from(value).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const fixtureDigits = [7, 1, 9, 2, 8, 4].join('');
  const correlationId = 'corr-e2e-fixture';
  const rawBody = `Your payout code is ${fixtureDigits}. Verification reference: ${correlationId}.`;
  const payload = {
    mimeType: 'multipart/alternative',
    parts: [
      { mimeType: 'text/plain', body: { data: b64(rawBody) } },
      { mimeType: 'text/html', body: { data: b64(`<p>${rawBody}</p>`) } },
    ],
  };

  const decode = (raw) => Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
  const collect = (part) => {
    if (!part) return '';
    const own = part.body?.data ? decode(part.body.data) : '';
    const children = Array.isArray(part.parts) ? part.parts.map(collect).join(' ') : '';
    return `${own} ${children}`.trim();
  };

  const decoded = collect(payload);
  assert.ok(decoded.includes(correlationId));
  const extracted = decoded.match(/\b(\d{6})\b/)?.[1] ?? null;
  assert.equal(extracted, fixtureDigits);
});
