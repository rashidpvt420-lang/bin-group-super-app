import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('same-commit live audit verifies exact registered routes for all five profiles', async () => {
  const source = await read('tests/e2e/hard-launch-routes.spec.ts');
  for (const role of ['Owner', 'Tenant', 'Technician', 'Broker', 'Admin']) {
    assert.match(source, new RegExp(`name: '${role}'`), `${role} exact-route evidence is missing`);
  }
  for (const route of [
    '/owner/contracts',
    '/owner/activation',
    '/tenant/request',
    '/tenant/profile',
    '/technician/jobs',
    '/technician/map',
    '/broker/commissions',
    '/broker/profile',
    '/contracts',
    '/audit',
  ]) {
    assert.match(source, new RegExp(route.replaceAll('/', '\\/')), `exact-route evidence is missing ${route}`);
  }
  assert.match(source, /new URL\(page\.url\(\)\)\.pathname/);
  assert.match(source, /must remain on its registered route rather than a wildcard redirect/);
  assert.match(source, /attachAuthenticatedAppCheckMonitor/);
  assert.match(source, /monitor\.assertAuthenticatedFirebaseRead/);
  assert.match(source, /E2E_ADMIN_BASE_URL/);
  assert.doesNotMatch(source, /test\.skip|\.skip\(/);
});

test('the critical launchAuditLive suite automatically includes the exact-route audit', async () => {
  const [launchHonesty, runner, wrapper] = await Promise.all([
    read('scripts/lib/launch-honesty.mjs'),
    read('scripts/run-critical-evidence.mjs'),
    read('scripts/run-live-launch-audit.mjs'),
  ]);
  assert.match(launchHonesty, /'tests\/e2e\/hard-launch-routes\.spec\.ts'/);
  assert.match(runner, /SUITE_SPECS/);
  assert.match(runner, /\.\.\.def\.specs/);
  assert.match(wrapper, /run-critical-evidence\.mjs/);
  assert.match(wrapper, /launchAuditLive/);
});
