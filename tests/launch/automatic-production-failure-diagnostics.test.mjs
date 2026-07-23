import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeProductionDiagnosticLog } from '../../scripts/sanitize-production-diagnostic-log.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('automatic Firebase failure diagnostics upload only a fully redacted log', async () => {
  const source = await read('.github/workflows/firebase-production-failure-diagnostics.yml');

  assert.match(source, /Checkout exact failed source/);
  assert.match(source, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(source, /node-version: '22'/);
  assert.match(source, /raw_log="\$\(mktemp\)"/);
  assert.match(source, /trap 'rm -f "\$raw_log"' EXIT/);
  assert.match(source, /sanitize-production-diagnostic-log\.mjs/);
  assert.match(source, /launch_package\/firebase-production-failure\.log/);
  assert.match(source, /fullArtifactLogRedacted: true/);
  assert.match(source, /rawJobLogUploaded: false/);
  assert.match(source, /personalIdentifiersRedacted: true/);
  assert.match(source, /Normalized terminal errors/);
  assert.match(source, /gh api --paginate --slurp/);
  assert.doesNotMatch(
    source,
    /gh api "repos\/\$REPOSITORY\/actions\/jobs\/\$job_id\/logs" >> launch_package\/firebase-production-failure\.log/,
  );

  const uploadBlock = source.match(/- name: Upload redacted production failure evidence[\s\S]*?- name: Record sanitized failure/)?.[0] || '';
  assert.match(uploadBlock, /firebase-production-failure\.json/);
  assert.match(uploadBlock, /firebase-production-failure\.log/);
  assert.doesNotMatch(uploadBlock, /raw_log/);
});

test('automatic diagnostic sanitizer removes secret and identifier formats from terminal errors', () => {
  const raw = [
    'email=pilot.admin@example.com',
    'uid=AbCdEfGhIjKlMnOpQrStUvWxYz12',
    'refreshToken="refresh-secret-value"',
    'apiKey: "AIzaSyExampleSecretValue"',
    'otp=123456',
    'Authorization: Bearer eyJheader.payload.signature',
    'checkout=cs_live_sensitiveProviderId',
    'event=evt_sensitiveProviderId',
    'debug_token=123e4567-e89b-42d3-a456-426614174000',
    '[production-deploy] complete Firebase production stack failed after 3 attempts',
  ].join('\n');

  const sanitized = sanitizeProductionDiagnosticLog(raw);
  for (const value of [
    'pilot.admin@example.com',
    'AbCdEfGhIjKlMnOpQrStUvWxYz12',
    'refresh-secret-value',
    'AIzaSyExampleSecretValue',
    '123456',
    'eyJheader.payload.signature',
    'cs_live_sensitiveProviderId',
    'evt_sensitiveProviderId',
    '123e4567-e89b-42d3-a456-426614174000',
  ]) {
    assert.doesNotMatch(sanitized, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(sanitized, /complete Firebase production stack failed after 3 attempts/);
});
