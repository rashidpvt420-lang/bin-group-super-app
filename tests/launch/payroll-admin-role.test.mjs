// Payroll Admin role (Rashid, 9 Nov 2026): provisionable with no modules, payroll preparation only,
// never money authority, and no Super Admin / CEO-only assignment restriction.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (p) => readFileSync(p, 'utf8');
const provisioning = read('functions/adminUserProvisioning.ts');
const hr = read('functions/hrAutomation.ts');
const financeMfa = read('functions/financeAdminMfa.ts');
const policy = read('apps/admin-panel/src/security/staffAccessPolicy.ts');
const ui = read('apps/admin-panel/src/pages/admin/StaffAccessPage.tsx');

test('payroll_admin is provisionable with no admin modules and no extra assigner restriction', () => {
  assert.match(provisioning, /"payroll_admin",/);
  assert.equal((provisioning.match(/payroll_admin: \[\],/g) || []).length, 2);
  assert.doesNotMatch(provisioning, /FINANCE_TIER_ASSIGNER_ROLES|requireFinanceTierAssigner/);
  assert.match(policy, /value: 'payroll_admin'/);
  assert.match(ui, /value: 'payroll_admin'/);
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
