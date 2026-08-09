import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

for (const script of [
  'scripts/harden-repeated-business-evidence.mjs',
  'scripts/ensure-protected-appcheck-debug-tokens.mjs',
  'scripts/run-protected-business-evidence.mjs',
]) {
  test(`${script} parses under the launch Node runtime`, () => {
    const result = spawnSync(process.execPath, ['--check', script], { encoding: 'utf8' });
    assert.equal(result.status, 0, `${script} syntax check failed:\n${result.stderr || result.stdout}`);
  });
}

test('protected business runner verifies dual-app App Check before live evidence', () => {
  const runner = read('scripts/run-protected-business-evidence.mjs');
  const appCheck = runner.indexOf("run('scripts/ensure-protected-appcheck-debug-tokens.mjs')");
  const hardening = runner.indexOf("run('scripts/harden-repeated-business-evidence.mjs')");
  const evidence = runner.indexOf('runCriticalBusinessEvidence(releaseId, 1)');
  assert.ok(appCheck > 0 && hardening > appCheck && evidence > hardening);
});

test('App Check synchronization is scoped to protected main and never deletes tokens', () => {
  const source = read('scripts/ensure-protected-appcheck-debug-tokens.mjs');
  assert.match(source, /GITHUB_REF !== 'refs\/heads\/main'/);
  assert.match(source, /GITHUB_WORKFLOW !== 'Firebase Production Deploy'/);
  assert.match(source, /REACT_APP_ADMIN_FIREBASE_APP_ID/);
  assert.match(source, /exchangeDebugToken/);
  assert.match(source, /firebaseappcheck\.googleapis\.com\/v1\/\$\{parent\}\/debugTokens/);
  assert.doesNotMatch(source, /method:\s*'DELETE'/);
});

test('repeated evidence hardening preserves strict business outcomes while fixing races', () => {
  const source = read('scripts/harden-repeated-business-evidence.mjs');
  assert.match(source, /Technician before-work evidence must persist before Start Work/);
  assert.match(source, /cleanupStaleE2eCorrectionRequests/);
  assert.match(source, /tenant-correction-error/);
  assert.match(source, /Admin payment approval callable failed HTTP/);
  assert.match(source, /APPROVED\|ACTIVE\|ACTIVE\|true\|ACTIVE/);
});
