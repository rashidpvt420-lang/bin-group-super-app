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

test('all launch-audit entry points centrally prepare only the E2E Tenant correction evidence', async () => {
  const fixture = await read('scripts/prepare-tenant-correction-e2e.mjs');
  const gate11 = await read('scripts/seed-gate11-fixtures.mjs');
  const criticalRunner = await read('scripts/run-critical-evidence.mjs');
  const liveAudit = await read('scripts/run-live-launch-audit.mjs');

  assert.match(fixture, /E2E_TENANT_EMAIL/);
  assert.match(fixture, /emailVerified/);
  assert.match(fixture, /E2E Emergency Contact Baseline/);
  assert.match(fixture, /tenant_correction_requests/);
  assert.match(fixture, /where\('tenantUid', '==', tenantUid\)/);
  assert.match(fixture, /correction\.ref\.collection\('events'\)/);
  assert.match(fixture, /e2eTenantCorrectionBaseline: true/);
  assert.match(gate11, /prepare-tenant-correction-e2e\.mjs/);

  assert.match(criticalRunner, /const SUITE_FIXTURES = Object\.freeze/);
  assert.match(criticalRunner, /businessBroker:[\s\S]*prepare-broker-payout-otp-e2e\.mjs/);
  assert.match(criticalRunner, /launchAuditLive:[\s\S]*prepare-tenant-correction-e2e\.mjs/);
  assert.match(criticalRunner, /const fixture = SUITE_FIXTURES\[suiteKey\]/);
  assert.match(criticalRunner, /fixture preparation failed — evidence not recorded/);
  assert.match(criticalRunner, /\[\.\.\.allBusiness, 'launchAuditLive'\]/);

  assert.match(liveAudit, /run-critical-evidence\.mjs', '--suite', 'launchAuditLive'/);
  assert.doesNotMatch(liveAudit, /prepare-tenant-correction-e2e\.mjs/);
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
