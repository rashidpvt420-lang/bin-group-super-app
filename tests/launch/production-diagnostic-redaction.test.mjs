import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeProductionDiagnosticLog } from '../../scripts/sanitize-production-diagnostic-log.mjs';

const workflow = await readFile(
  new URL('../../.github/workflows/owner-production-diagnosis.yml', import.meta.url),
  'utf8',
);

test('production diagnostic sanitizer removes text and JSON secrets while preserving failure context', () => {
  const uid = 'AbCdEfGhIjKlMnOpQrStUvWxYz12';
  const shortUid = 'shortUid12';
  const sensitivePassword = ['diagnostic', 'password', 'value'].join('-');
  const sensitiveApiValue = ['diagnostic', 'api', 'value'].join('-');
  const jsonRefreshValue = ['json', 'refresh', 'value'].join('-');
  const jsonApiValue = ['json', 'api', 'value'].join('-');
  const raw = [
    '\u001b[31m[critical-evidence] business-tenant failed\u001b[0m',
    'tests/e2e/business-tenant.spec.ts:42:7',
    'Error: expect(locator).toHaveText("Maintenance requests") timed out after 15000ms',
    'email=test.tenant@example.com',
    `uid=${uid}`,
    'Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature',
    `password=${sensitivePassword}`,
    `api_key=${sensitiveApiValue}`,
    'otp=123456',
    'Set-Cookie: session=private-session-value; Secure; HttpOnly',
    'https://example.test/path?debug_token=debug-value&safe=1',
    'checkout=cs_live_testfixture event=evt_testfixture webhook=whsec_testfixture',
    'challengeId=123e4567-e89b-12d3-a456-426614174000',
    JSON.stringify({ refreshToken: jsonRefreshValue, apiKey: jsonApiValue, uid: shortUid, otp: '654321' }),
  ].join('\n');

  const sanitized = sanitizeProductionDiagnosticLog(raw);

  assert.match(sanitized, /\[critical-evidence\] business-tenant failed/);
  assert.match(sanitized, /tests\/e2e\/business-tenant\.spec\.ts:42:7/);
  assert.match(sanitized, /expect\(locator\).*timed out after 15000ms/);

  for (const forbidden of [
    'test.tenant@example.com',
    uid,
    shortUid,
    'eyJhbGci',
    sensitivePassword,
    sensitiveApiValue,
    jsonRefreshValue,
    jsonApiValue,
    '123456',
    '654321',
    'private-session-value',
    'debug-value',
    'cs_live_testfixture',
    'evt_testfixture',
    'whsec_testfixture',
    '123e4567-e89b-12d3-a456-426614174000',
  ]) {
    assert.doesNotMatch(sanitized, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(sanitized, /<redacted-email>/);
  assert.match(sanitized, /<redacted-id>/);
  assert.match(sanitized, /<redacted-secret>/);
  assert.match(sanitized, /<redacted-provider-id>/);
  assert.match(sanitized, /"refreshToken":"<redacted-secret>"/);
  assert.match(sanitized, /"apiKey":"<redacted-secret>"/);
  assert.match(sanitized, /"uid":"<redacted-id>"/);
  assert.match(sanitized, /"otp":"<redacted-secret>"/);
});

test('diagnosis workflow uploads only the sanitized artifact log', () => {
  assert.match(workflow, /raw_log="\$\(mktemp\)"/);
  assert.match(workflow, /trap 'rm -f "\$raw_log"' EXIT/);
  assert.match(workflow, /sanitize-production-diagnostic-log\.mjs/);
  assert.match(workflow, /launch_package\/firebase-production-failure\.log/);
  assert.match(workflow, /fullArtifactLogRedacted:\s*true/);
  assert.match(workflow, /rawJobLogUploaded:\s*false/);
  assert.doesNotMatch(workflow, /launch_package\/firebase-production-failure\.raw\.log/);
  assert.doesNotMatch(workflow, /gh api "repos\/\$REPOSITORY\/actions\/jobs\/\$job_id\/logs" >> launch_package\/firebase-production-failure\.log/);
});
