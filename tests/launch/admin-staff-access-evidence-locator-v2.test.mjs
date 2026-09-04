import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { patchAdminBusinessEvidence } from '../../scripts/apply-five-role-business-evidence-fixes.mjs';
import { patchAdminStaffAccessInteraction } from '../../scripts/patch-protected-admin-staff-access-interaction.mjs';

const read = (file) => readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

test('protected Admin replay separates Phase 1 payment repair from the canonical HR Staff Access migration', () => {
  const source = read('tests/e2e/business-admin.spec.ts');
  const stale = "await page.getByTestId('admin-open-secure-staff-access').click();";
  const current = "await page.getByRole('tab', { name: 'STAFF ACCESS', exact: true }).click();";

  assert.ok(source.includes(stale), 'fixture must retain the retired locator that exposed the production contract drift');

  const paymentPatched = patchAdminBusinessEvidence(source);
  assert.ok(paymentPatched.includes(stale), 'Phase 1 payment replay must not mutate the Staff Access interaction contract');
  assert.ok(!paymentPatched.includes(current), 'canonical Staff Access migration must remain a separate protected replay step');

  const replayPatched = patchAdminStaffAccessInteraction(paymentPatched);
  assert.ok(replayPatched.includes(current), 'protected replay must target the current Staff Access tab');
  assert.ok(!replayPatched.includes(stale), 'protected replay must remove the retired Staff Access test id');
  assert.equal(
    patchAdminStaffAccessInteraction(replayPatched),
    replayPatched,
    'Staff Access replay migration must be idempotent',
  );

  const runner = read('scripts/run-protected-business-evidence.mjs');
  const guardIndex = runner.indexOf("if (!protectedPhase1)");
  const migrationIndex = runner.indexOf("run('scripts/patch-protected-admin-staff-access-interaction.mjs');");
  assert.ok(guardIndex >= 0 && migrationIndex > guardIndex, 'Staff Access migration must run only after the protected production guard');

  const hrUi = read('apps/admin-panel/src/pages/admin/HRManagementPage.tsx');
  assert.ok(hrUi.includes('<Tab label="STAFF ACCESS" disabled={!isProvisioningAdmin} />'));
  assert.ok(hrUi.includes('{tab === 4 && isProvisioningAdmin && <StaffAccessPage />}'));
  assert.ok(hrUi.includes("provisioningAdminRoles = new Set(['super_admin', 'admin', 'ceo'])"));
});
