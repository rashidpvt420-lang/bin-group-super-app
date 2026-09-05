import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../e2e/helpers/gmail-otp-reader.ts', import.meta.url), 'utf8');

test('production OTP reader is freshness-bound and independent of Gmail read state', () => {
  assert.doesNotMatch(source, /gmailQuery\s*=\s*[^;]*is:unread/);
  assert.match(source, /Number\(internalDate\) < afterMs/);
  assert.match(source, /freshMessageCount/);
});

test('production OTP reader inspects the complete Gmail MIME payload, not only the snippet', () => {
  assert.match(source, /format=full/);
  assert.match(source, /collectMessageBody\(json\.payload\)/);
  assert.match(source, /Buffer\.from\([^\n]+['"]base64['"]\)/);
  assert.match(source, /mimeType\.startsWith\(['"]text\//);
});
