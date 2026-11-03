import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('Owner command counts mark capped approval and ticket sources as incomplete', async () => {
  const hook = await read('src/owner/hooks/useOwnerCommandCounts.ts');
  const dashboard = await read('src/owner/pages/OwnerSimpleDashboardPage.tsx');
  assert.match(hook, /snap\.size >= 100/);
  assert.match(hook, /snap\.size >= 150/);
  assert.match(hook, /truncatedSources: Array\.from\(truncated\)/);
  assert.match(dashboard, /owner-command-counts-incomplete/);
  assert.match(dashboard, /truncatedSources\.includes\('tickets'\)/);
  assert.match(dashboard, /incompleteSources\.length === 0/);
});

test('Owner approval center warns when either bounded source reaches its cap', async () => {
  const page = await read('src/owner/pages/OwnerApprovalCenterPage.tsx');
  assert.match(page, /setRequestsMayBeTruncated\(snap\.size >= 50\)/);
  assert.match(page, /setSignOffsMayBeTruncated\(snap\.size >= 150\)/);
  assert.match(page, /owner-approval-requests-capped/);
  assert.match(page, /owner-signoffs-capped/);
  assert.match(page, /!signOffsMayBeTruncated/);
  assert.match(page, /!requestsMayBeTruncated/);
});

test('Finance queues identify visible query caps instead of implying the queue is complete', async () => {
  const page = await read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx');
  assert.match(page, /Pending payment queue', snapshot\.size >= 50/);
  assert.match(page, /Paid awaiting approval queue', snapshot\.size >= 50/);
  assert.match(page, /Receipt repair queue', snapshot\.size >= 30/);
  assert.match(page, /admin-payment-queue-capped/);
});

test('Technician history makes the 50-record KPI scope explicit', async () => {
  const page = await read('src/technician/pages/TechnicianHistoryPage.tsx');
  assert.match(page, /setHistoryMayBeTruncated\(snap\.size >= 50\)/);
  assert.match(page, /technician-history-capped/);
  assert.match(page, /MISSIONS IN LOADED HISTORY/);
});

test('Owner, Tenant and Technician live audits wait for authenticated role shells', async () => {
  const owner = await read('tests/e2e/launch-audit-owner.spec.ts');
  const tenant = await read('tests/e2e/launch-audit-tenant.spec.ts');
  const technician = await read('tests/e2e/launch-audit-technician.spec.ts');
  const broker = await read('tests/e2e/launch-audit-broker.spec.ts');
  assert.match(owner, /Owner identity must resolve/);
  assert.match(tenant, /wait for authenticated Tenant identity resolution/);
  assert.match(technician, /Technician identity must resolve/);
  assert.match(broker, /waitForResolvedBrokerShell/);
});
