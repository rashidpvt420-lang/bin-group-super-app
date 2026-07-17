import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tenant correction UI exposes stable live-evidence selectors', async () => {
  const panel = await read('src/tenant/components/TenantCorrectionPanel.tsx');
  for (const testId of [
    'tenant-correction-panel',
    'tenant-correction-field',
    'tenant-correction-value',
    'tenant-correction-reason',
    'tenant-correction-submit',
    'tenant-correction-success',
    'tenant-correction-history',
    'tenant-correction-status',
    'tenant-correction-requested-value',
    'tenant-correction-events',
  ]) {
    assert.match(panel, new RegExp(testId), `missing ${testId}`);
  }
  assert.match(panel, /tenant-correction-request-\$\{item\.id\}/);
});

test('Gate 11 and live launch audit reset only the E2E Tenant correction evidence', async () => {
  const fixture = await read('scripts/prepare-tenant-correction-e2e.mjs');
  const gate11 = await read('scripts/seed-gate11-fixtures.mjs');
  const liveAudit = await read('scripts/run-live-launch-audit.mjs');

  assert.match(fixture, /E2E_TENANT_EMAIL/);
  assert.match(fixture, /emailVerified/);
  assert.match(fixture, /E2E Emergency Contact Baseline/);
  assert.match(fixture, /tenant_correction_requests/);
  assert.match(fixture, /where\('tenantUid', '==', tenantUid\)/);
  assert.match(fixture, /correction\.ref\.collection\('events'\)/);
  assert.match(fixture, /e2eTenantCorrectionBaseline: true/);
  assert.match(gate11, /prepare-tenant-correction-e2e\.mjs/);
  assert.match(liveAudit, /preparing repeatable Tenant correction evidence fixture/);
  assert.match(liveAudit, /prepare-tenant-correction-e2e\.mjs/);
  assert.match(liveAudit, /evidence fixture failed — live evidence will not run/);
});

test('Tenant production launch audit submits and verifies correction history under App Check', async () => {
  const audit = await read('tests/e2e/launch-audit-tenant.spec.ts');

  assert.match(audit, /attachAuthenticatedAppCheckMonitor/);
  assert.match(audit, /tenant correction submission and immutable history are reachable/);
  assert.match(audit, /toBeDisabled\(\)/);
  assert.match(audit, /Emergency contact name\|اسم جهة اتصال الطوارئ/);
  assert.match(audit, /tenant-correction-submit/);
  assert.match(audit, /tenant-correction-success/);
  assert.match(audit, /PENDING ADMIN REVIEW/);
  assert.match(audit, /tenant-correction-events/);
  assert.match(audit, /SUBMITTED/);
  assert.match(audit, /E2E Emergency Contact Baseline/);
  assert.doesNotMatch(audit, /test\.skip\(/);
});
