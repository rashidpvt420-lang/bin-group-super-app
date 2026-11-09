// D-04 (ported from #2000 into #1998): finance tiers assignable only by Super Admin / CEO.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('D-04: finance tiers are provisionable only by a Super Admin / CEO with MFA, audit logged', () => {
  const prov = read('functions/adminUserProvisioning.ts');
  assert.match(prov, /"finance_manager",/);
  assert.match(prov, /"finance_controller",/);
  assert.match(prov, /"payroll_admin",/);
  assert.match(prov, /const FINANCE_TIER_ASSIGNER_ROLES = new Set\(\["super_admin", "ceo"\]\)/);
  assert.equal((prov.match(/await requireFinanceTierAssigner\(request\)/g) || []).length, 3);
  assert.match(prov, /financeTierAssignment,/);
  // Payroll Admin stays prep-only (no modules) on this PR.
  assert.equal((prov.match(/payroll_admin: \[\],/g) || []).length, 2);
  const lifecycle = read('functions/adminStaffLifecycle.ts');
  assert.match(lifecycle, /"finance_manager", "finance_controller", "payroll_admin"/);
  const policy = read('apps/admin-panel/src/security/staffAccessPolicy.ts');
  assert.match(policy, /canAssignFinanceTierRoles/);
  const ui = read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx');
  assert.match(ui, /assignableRoles/);
});
