import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('critical Playwright suites preserve isolated diagnostics', async () => {
  const runner = await read('scripts/run-critical-evidence.mjs');
  assert.match(runner, /const outputDir = path\.join\('test-results', suiteKey\)/);
  assert.match(runner, /`--output=\$\{outputDir\}`/);
});

test('production mail and push triggers retry transient provider failures but not exhausted SMTP credits', async () => {
  const [mail, push, retry] = await Promise.all([
    read('functions/mailDelivery.ts'),
    read('functions/notificationDelivery.ts'),
    read('functions/smtpDeliveryRetry.ts'),
  ]);
  assert.match(mail, /document: "mail\/\{mailId\}"[\s\S]*region: "europe-west3"[\s\S]*retry: true/);
  assert.match(push, /document: "notifications\/\{notificationId\}"[\s\S]*region: "europe-west3"[\s\S]*retry: true/);
  assert.match(mail, /sendSmtpWithRetry/);
  assert.match(mail, /if \(isTransientSmtpError\(error\)\) throw error/);
  assert.match(retry, /isPermanentSmtpCapacityError/);
  assert.match(retry, /maximum credits exceeded/);
  assert.match(retry, /if \(isPermanentSmtpCapacityError\(smtpError\)\) return false/);
  assert.match(retry, /responseCode >= 400 && responseCode < 500/);
  assert.match(retry, /maxAttempts = 3/);
});

test('Broker OTP evidence captures callable failures and starts the mailbox window before send', async () => {
  const broker = await read('tests/e2e/business-broker.spec.ts');
  const start = broker.indexOf('const otpStartMs = Date.now()');
  const click = broker.indexOf('await requestOtp.click()');
  assert.ok(start >= 0 && click > start);
  assert.match(broker, /requestBrokerPayoutOtp/);
  assert.match(broker, /requestBrokerPayoutOtp failed HTTP/);
});
