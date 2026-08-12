import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

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
  assert.match(source, /projectNumberOf/);
  assert.match(source, /exchangeDebugToken/);
  assert.match(source, /firebaseappcheck\.googleapis\.com\/v1beta\/\$\{parent\}\/debugTokens/);
  assert.doesNotMatch(source, /method:\s*'DELETE'/);
});

test('repeated evidence hardening preserves strict business outcomes while fixing races', () => {
  const hardening = read('scripts/harden-repeated-business-evidence.mjs');
  const adminSpec = read('tests/e2e/business-admin.spec.ts');

  assert.match(hardening, /Technician before-work evidence must persist before Start Work/);
  assert.match(hardening, /cleanupStaleE2eCorrectionRequests/);
  assert.match(hardening, /tenant-correction-error/);
  assert.match(hardening, /Admin payment approval callable failed HTTP/);

  // The activation contract is enforced by the Admin business evidence spec,
  // not by the patching script itself. Assert it against the authoritative
  // source so this launch-regression test cannot fail before hardening runs.
  assert.match(adminSpec, /APPROVED\|ACTIVE\|ACTIVE\|true\|ACTIVE/);
});

test('repeated evidence hardening accepts the committed protected Admin callable contract', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'bin-group-repeated-business-evidence-'));

  try {
    mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
    mkdirSync(join(fixtureRoot, 'tests'), { recursive: true });
    cpSync('scripts/harden-repeated-business-evidence.mjs', join(fixtureRoot, 'scripts/harden-repeated-business-evidence.mjs'));
    cpSync('tests/e2e', join(fixtureRoot, 'tests/e2e'), { recursive: true });

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = spawnSync(process.execPath, ['scripts/harden-repeated-business-evidence.mjs'], {
        cwd: fixtureRoot,
        encoding: 'utf8',
      });
      assert.equal(
        result.status,
        0,
        `hardening attempt ${attempt} failed:\n${result.stderr || result.stdout}`,
      );
    }
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
