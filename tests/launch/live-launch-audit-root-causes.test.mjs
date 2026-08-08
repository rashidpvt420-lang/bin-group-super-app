import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');

test('protected live launch audit rebuilds canonical five-role state after auth seeding', () => {
  const source = read('scripts/run-live-launch-audit.mjs');
  const authSeed = source.indexOf("'scripts/seed-e2e-auth.mjs'");
  const liveSeed = source.indexOf("'scripts/seed-live-role-test-data.mjs'");
  const evidence = source.indexOf("'scripts/run-critical-evidence.mjs'");
  assert.ok(authSeed >= 0, 'live audit must seed E2E Auth');
  assert.ok(liveSeed > authSeed, 'canonical live-role data must be rebuilt after Auth seeding');
  assert.ok(evidence > liveSeed, 'critical launch evidence must run only after canonical live-role state is restored');
});

test('strict live Playwright evidence is serialized and retry-free', () => {
  const source = read('playwright.config.ts');
  assert.match(source, /strictLiveMode/);
  assert.match(source, /workers:\s*strictLiveMode\s*\?\s*1\s*:\s*undefined/);
  assert.match(source, /retries:\s*strictLiveMode\s*\?\s*0\s*:/);
});

test('Admin hard-launch exact-route proof uses canonical Founder MFA', () => {
  const source = read('tests/e2e/hard-launch-routes.spec.ts');
  assert.match(source, /loginAdminWithRealMfa/);
  assert.match(source, /requireAdminMfaCredentials\('E2E_FOUNDER'\)/);
  assert.match(source, /ceo@bin-groups\.com/);
});

test('portal language proofs bind to explicit controls instead of substring selectors', () => {
  const cases = [
    ['tests/e2e/launch-audit-owner.spec.ts', 'owner-language-toggle'],
    ['tests/e2e/launch-audit-tenant.spec.ts', 'tenant-language-toggle'],
    ['tests/e2e/launch-audit-technician.spec.ts', 'technician-language-toggle'],
    ['tests/e2e/launch-audit-broker.spec.ts', 'broker-language-toggle'],
  ];
  for (const [path, testId] of cases) {
    const source = read(path);
    assert.match(source, new RegExp(`getByTestId\\('${testId}'\\)`));
    assert.doesNotMatch(source, /button:has-text\("AR"\)|button:has-text\("EN"\)/);
  }
});

test('live launch audit has a protected no-deploy workflow with always-on diagnostics', () => {
  const workflow = read('.github/workflows/live-launch-audit.yml');
  assert.match(workflow, /name:\s*Live Launch Audit/);
  assert.match(workflow, /environment:\s*production/);
  assert.match(workflow, /npm run test:e2e:launch-audit:live/);
  assert.match(workflow, /if:\s*\$\{\{ always\(\) \}\}/);
  assert.match(workflow, /launch_package\/artifacts\/\*\.json/);
  assert.doesNotMatch(workflow, /deploy-firebase-production\.mjs|firebase deploy|Deploy and verify Firebase production stack/i);
});
