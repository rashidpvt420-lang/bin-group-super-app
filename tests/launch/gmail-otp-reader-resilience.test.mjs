import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readerSource = readFileSync(new URL('../e2e/helpers/gmail-otp-reader.ts', import.meta.url), 'utf8');
const canonicalReaderSource = readFileSync(new URL('../../scripts/lib/gmail-otp-reader.mjs', import.meta.url), 'utf8');
const brokerSource = readFileSync(new URL('../e2e/business-broker.spec.ts', import.meta.url), 'utf8');

test('production OTP reader is freshness-bound and independent of Gmail read state', () => {
  assert.doesNotMatch(readerSource, /gmailQuery\s*=\s*[^;]*is:unread/);
  assert.match(readerSource, /Number\(internalDate\) < afterMs/);
  assert.match(readerSource, /freshMessageCount/);
});

test('all protected Broker OTP readers search Gmail Spam and Trash without weakening freshness', () => {
  assert.match(readerSource, /includeSpamTrash=true/);
  assert.match(canonicalReaderSource, /messages\?maxResults=20&includeSpamTrash=true&q=/);
  assert.match(readerSource, /freshSpamMessageCount/);
  assert.match(readerSource, /freshTrashMessageCount/);
  assert.match(readerSource, /mailboxLocation\(labelIds\)/);
  assert.match(readerSource, /correlationId && !content\.includes\(correlationId\)/);
  assert.match(canonicalReaderSource, /internalDate < requestedAt - 10000/);
  assert.match(canonicalReaderSource, /correlationText\.includes\(expectedCorrelation\)/);
  assert.doesNotMatch(readerSource, /return\s+.*stale/i);
});

test('production OTP reader inspects full inline and attachment-backed Gmail MIME text', () => {
  assert.match(readerSource, /format=full/);
  assert.match(readerSource, /collectMessageBody\(json\.payload, accessToken, messageId\)/);
  assert.match(readerSource, /attachments\/\$\{encodeURIComponent\(attachmentId\)\}/);
  assert.match(readerSource, /body\?\.attachmentId/);
  assert.match(readerSource, /Buffer\.from\([^\n]+['"]base64['"]\)/);
  assert.match(readerSource, /mimeType\.startsWith\(['"]text\//);
});

test('Broker payout mailbox proof is bound to the server-issued current challenge correlation', () => {
  assert.match(readerSource, /correlationId\?: string/);
  assert.match(readerSource, /correlationId && !content\.includes\(correlationId\)/);
  assert.match(brokerSource, /const correlationId = String\(requestOtpPayload\?\.result\?\.correlationId/);
  assert.match(brokerSource, /subjectHint: 'payout verification',[\s\S]*correlationId,/);
});
