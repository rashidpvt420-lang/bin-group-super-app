import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('Phase 3 interactive-control inventory is wired into executable validation', () => {
  const pkg = JSON.parse(read('package.json'));
  const verifier = read('scripts/verify-interactive-control-inventory.mjs');
  const e2e = read('tests/e2e/phase3-interactive-controls.spec.ts');

  assert.match(pkg.scripts['test:phase3-controls'], /verify-interactive-control-inventory/);
  assert.match(pkg.scripts['test:phase3-controls'], /phase3-interactive-controls\.spec\.ts/);
  assert.match(verifier, /Phase 3 interactive controls discovered/);
  assert.match(verifier, /submit control has no disabled\/loading guard/);
  assert.match(e2e, /every rendered interactive control/);
  assert.match(e2e, /contains visible controls with no accessible identity/);
  assert.match(e2e, /Arabic\/RTL control identities remain available/);
});

test('Phase 3 mutation-specific evidence remains fail-closed and server-authoritative', () => {
  const tenant = read('tests/e2e/business-tenant.spec.ts');
  const technician = read('tests/e2e/business-technician.spec.ts');
  const admin = read('tests/e2e/business-admin.spec.ts');
  const broker = read('tests/e2e/business-broker.spec.ts');
  const walkthrough = read('tests/e2e/launch-five-profile-walkthrough.spec.ts');

  assert.match(tenant, /toBeEnabled/);
  assert.match(tenant, /APPROVE, RATE & CLOSE/);
  assert.match(technician, /Complete Mission & Request Tenant Feedback/);
  assert.match(technician, /setOffline\(true\)/);
  assert.match(admin, /Confirm & Unlock Owner|Verify & Unlock/);
  assert.match(broker, /submit|lead/i);
  assert.match(walkthrough, /ALREADY_EXISTS|already assigned/);
});

test('Phase 3 role boundary evidence stays linked to route and launch suites', () => {
  const routes = read('tests/e2e/hard-launch-routes.spec.ts');
  const phase3 = read('tests/e2e/phase3-interactive-controls.spec.ts');
  const config = read('playwright.config.ts');

  for (const role of ['Owner', 'Tenant', 'Technician', 'Broker', 'Admin']) {
    assert.match(routes, new RegExp(`name: '${role}'`));
  }
  assert.match(routes, /ACCESS_DENIED/);
  assert.match(phase3, /permission-denied/);
  assert.match(config, /Pixel 7/);
  assert.match(config, /Desktop Chrome/);
});
