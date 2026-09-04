// Exact-head validation trigger after the deterministic source repair completed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Admin property review evidence does not block on a slow browser alert', () => {
  const source = read('tests/e2e/business-admin.spec.ts');
  assert.doesNotMatch(source, /const approvalDialogPromise = page\.waitForEvent\('dialog'/);
  assert.match(source, /page\.on\('dialog', propertyApprovalDialogHandler\)/);
  assert.match(source, /page\.off\('dialog', propertyApprovalDialogHandler\)/);
  assert.match(source, /toBe\('APPROVED'\)/);
  assert.match(source, /page\.on\('dialog', propertyRejectionDialogHandler\)/);
  assert.match(source, /toBe\('REJECTED'\)/);
});

test('Technician after-work proof has one canonical protected hidden input contract', () => {
  const protectedEvidence = read('src/technician/components/TechnicianAfterWorkEvidence.tsx');
  const jobDetail = read('src/technician/pages/TechnicianJobDetailPage.tsx');
  const tenantEvidence = read('tests/e2e/business-tenant.spec.ts');

  assert.match(protectedEvidence, /data-testid="technician-after-work-file"/);
  assert.doesNotMatch(jobDetail, /data-testid="technician-after-work-file"/);
  assert.match(tenantEvidence, /getByTestId\('technician-after-work-file'\)/);
  assert.doesNotMatch(tenantEvidence, /const completionInput = await firstVisible/);

  const producerCount = (protectedEvidence.match(/data-testid="technician-after-work-file"/g) || []).length
    + (jobDetail.match(/data-testid="technician-after-work-file"/g) || []).length;
  assert.equal(producerCount, 1, 'Exactly one Technician after-work file input must exist across the protected job route.');
});

test('Offline replay waits for the authenticated mission UI before disconnecting', () => {
  const source = read('tests/e2e/business-technician.spec.ts');
  const missionReadyIndex = source.indexOf("const offlineStartTrip = page.getByRole('button', { name: /On The Way/i }).first();");
  const offlineIndex = source.indexOf('await context.setOffline(true);', missionReadyIndex);
  assert.ok(missionReadyIndex >= 0, 'Expected a stable mission-ready locator.');
  assert.ok(offlineIndex > missionReadyIndex, 'The browser must disconnect only after the mission UI is ready.');
  assert.match(source, /window\.dispatchEvent\(new Event\('offline'\)\)/);
  assert.match(source, /await offlineStartTrip\.click\(\)/);
});
