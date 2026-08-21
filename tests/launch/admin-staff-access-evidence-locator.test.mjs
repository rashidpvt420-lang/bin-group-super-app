import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { patchAdminBusinessEvidence } from '../../scripts/apply-five-role-business-evidence-fixes.mjs';

const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

test('protected Admin business evidence follows the canonical HR Staff Access tab', () => {
  const source = read('tests/e2e/business-admin.spec.ts');
  const stale = "await page.getByTestId('admin-open-secure-staff-access').click();";
  const current = "await page.getByRole('tab', { name: 'STAFF ACCESS', exact: true }).click();";

  assert.ok(source.includes(stale), 'fixture must retain the retired locator that caused production run 32466441256 to fail');
  const patched = patchAdminBusinessEvidence(source);
  assert.ok(patched.includes(current), 'protected replay must target the current Staff Access tab');
  assert.ok(!patched.includes(stale), 'protected replay must remove the retired Staff Access test id');

  const hrUi = read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');
  assert.ok(hrUi.includes('<Tab label="STAFF ACCESS" disabled={!isHRManager} />'));
  assert.ok(hrUi.includes('{tab === 4 && isHRManager && <StaffAccessPage />}'));
});
