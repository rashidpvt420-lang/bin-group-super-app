// Payroll Admin role (Rashid, 9 Nov 2026): provisionable with no modules, payroll preparation only,
// never money authority. D-04: only Super Admin / CEO may assign the finance tiers (incl. payroll_admin).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const provisioning = read('functions/adminUserProvisioning.ts');
const hr = read('functions/hrAutomation.ts');
const financeMfa = read('functions/financeAdminMfa.ts');
const policy = read('apps/admin-panel/src/security/staffAccessPolicy.ts');
const ui = read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx');

test('payroll_admin is provisionable with no admin modules; D-04 Super Admin/CEO assigner only', () => {
  assert.match(provisioning, /"payroll_admin",/);
  assert.equal((provisioning.match(/payroll_admin: \[\],/g) || []).length, 2);
  assert.match(provisioning, /const FINANCE_TIER_ASSIGNER_ROLES = new Set\(\["super_admin", "ceo"\]\)/);
  assert.equal((provisioning.match(/await requireFinanceTierAssigner\(request\)/g) || []).length, 3);
  assert.match(policy, /value: 'payroll_admin'/);
  assert.match(policy, /FINANCE_TIER_ROLES = new Set\(\['finance_manager', 'finance_controller', 'payroll_admin'\]\)/);
  assert.match(ui, /value: 'payroll_admin'/);
  assert.match(ui, /canAssignFinanceTierRoles/);
});

test('payroll_admin prepares payroll only; settlement stays MFA Finance Admin', () => {
  assert.match(hr, /"finance_admin", "payroll_admin"\]\.includes\(role\)/);
  const settle = hr.slice(hr.indexOf('export const adminSettlePayrollRecord'));
  assert.match(settle.slice(0, 600), /requireMfaFinanceAdminActor\(request\)/);
  assert.doesNotMatch(financeMfa, /payroll_admin/);
});

test('the admin panel opens only the payroll preparation page for payroll_admin', () => {
  assert.match(policy, /PAYROLL_PREP_PATH = '\/hr\/payroll-prep'/);
  assert.match(policy, /normalizedPath === PAYROLL_PREP_PATH/);
});
