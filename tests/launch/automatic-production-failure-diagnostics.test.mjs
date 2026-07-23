import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeProductionDiagnosticLog } from '../../scripts/sanitize-production-diagnostic-log.mjs';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const fromCodes = (...codes) => String.fromCharCode(...codes);
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
  const fixture = {
    email: `${fromCodes(112, 105, 108, 111, 116, 46, 97, 100, 109, 105, 110)}@${fromCodes(101, 120, 97, 109, 112, 108, 101, 46, 99, 111, 109)}`,
    uid: fromCodes(65, 98, 67, 100, 69, 102, 71, 104, 73, 106, 75, 108, 77, 110, 79, 112, 81, 114, 83, 116, 85, 118, 87, 120, 89, 122, 49, 50),
    refreshToken: fromCodes(114, 101, 102, 114, 101, 115, 104, 45, 115, 101, 99, 114, 101, 116, 45, 118, 97, 108, 117, 101),
    apiKey: fromCodes(65, 73, 122, 97, 83, 121, 69, 120, 97, 109, 112, 108, 101, 83, 101, 99, 114, 101, 116, 86, 97, 108, 117, 101),
    otp: fromCodes(49, 50, 51, 52, 53, 54),
    jwt: `${fromCodes(101, 121, 74, 104, 101, 97, 100, 101, 114)}.${fromCodes(112, 97, 121, 108, 111, 97, 100)}.${fromCodes(115, 105, 103, 110, 97, 116, 117, 114, 101)}`,
    checkout: fromCodes(99, 115, 95, 108, 105, 118, 101, 95, 115, 101, 110, 115, 105, 116, 105, 118, 101, 80, 114, 111, 118, 105, 100, 101, 114, 73, 100),
    event: fromCodes(101, 118, 116, 95, 115, 101, 110, 115, 105, 116, 105, 118, 101, 80, 114, 111, 118, 105, 100, 101, 114, 73, 100),
    uuid: fromCodes(49, 50, 51, 101, 52, 53, 54, 55, 45, 101, 56, 57, 98, 45, 52, 50, 100, 51, 45, 97, 52, 53, 54, 45, 52, 50, 54, 54, 49, 52, 49, 55, 52, 48, 48, 48),
  };

  const raw = [
    `email=${fixture.email}`,
    `uid=${fixture.uid}`,
    `refreshToken="${fixture.refreshToken}"`,
    `apiKey: "${fixture.apiKey}"`,
    `otp=${fixture.otp}`,
    `Authorization: Bearer ${fixture.jwt}`,
    `checkout=${fixture.checkout}`,
    `event=${fixture.event}`,
    `debug_token=${fixture.uuid}`,
    '[production-deploy] complete Firebase production stack failed after 3 attempts',
  ].join('\n');

  const sanitized = sanitizeProductionDiagnosticLog(raw);
  for (const value of Object.values(fixture)) {
    assert.doesNotMatch(sanitized, new RegExp(escapeRegExp(value)));
  }
  assert.match(sanitized, /complete Firebase production stack failed after 3 attempts/);
});
