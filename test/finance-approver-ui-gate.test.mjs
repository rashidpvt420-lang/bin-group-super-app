// UI money gates must match #2014 finance segregation: CEO/Super Admin/Admin alone never approve.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const src = fs.readFileSync('apps/admin-panel/src/security/staffAccessPolicy.ts', 'utf8');
const { outputText } = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext } });
const mod = await import('data:text/javascript,' + encodeURIComponent(outputText));

test('Finance approver UI helper allows only explicit finance roles with MFA', () => {
  for (const role of ['finance_admin', 'finance_manager', 'finance_controller']) {
    assert.equal(mod.claimsGrantFinanceApproverUi({ role, claims: { role } }, true), true, role);
    assert.equal(mod.claimsGrantFinanceApproverUi({ role, claims: { role } }, false), false, `${role} no MFA`);
  }
  assert.equal(mod.claimsGrantFinanceApproverUi({ role: 'ceo', claims: { role: 'ceo', finance_admin: true } }, true), true, 'CEO plus explicit finance claim');
  for (const role of ['admin', 'super_admin', 'ceo', 'hr_admin', 'finance_staff', 'payroll_admin', 'manager', 'broker']) {
    assert.equal(mod.claimsGrantFinanceApproverUi({ role, claims: { role } }, true), false, role);
  }
  assert.equal(mod.claimsGrantFinanceApproverUi({ role: 'finance_admin', claims: { role: 'finance_admin', suspended: true } }, true), false);
});

test('Payroll settle UI helper allows only Finance Admin with MFA', () => {
  assert.equal(mod.claimsGrantPayrollSettleUi({ role: 'finance_admin', claims: { role: 'finance_admin' } }, true), true);
  assert.equal(mod.claimsGrantPayrollSettleUi({ role: 'finance_admin', claims: { role: 'finance_admin' } }, false), false);
  assert.equal(mod.claimsGrantPayrollSettleUi({ role: 'ceo', claims: { role: 'ceo', finance_admin: true } }, true), true);
  for (const role of ['admin', 'super_admin', 'ceo', 'finance_manager', 'finance_controller', 'hr_admin', 'payroll_admin']) {
    assert.equal(mod.claimsGrantPayrollSettleUi({ role, claims: { role } }, true), false, role);
  }
});
