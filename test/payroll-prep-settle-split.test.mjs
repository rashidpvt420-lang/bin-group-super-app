// HR prepares payroll, Finance Admin (MFA) settles: separate screens, Settle hidden otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const page = fs.readFileSync('apps/admin-panel/src/pages/financials/PayrollManagementPage.tsx', 'utf8');
const app = fs.readFileSync('apps/admin-panel/src/App.tsx', 'utf8');
// Nov 9 P1-2 removed the client-side Technician interface; slice up to the component instead.
const seg = page.slice(page.indexOf('const SETTLE_ROLES'), page.indexOf('export default function PayrollManagementPage'));
const mod = await import('data:text/javascript,' + encodeURIComponent(ts.transpileModule(seg, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText));

test('separate routes for HR prep and Finance settle', () => {
  assert.match(app, /path="\/financials\/payroll" element=\{<ProtectedRoute adminOnly><PayrollManagementPage mode="settle" \/>/);
  assert.match(app, /path="\/hr\/payroll-prep" element=\{<ProtectedRoute adminOnly><PayrollManagementPage mode="prepare" \/>/);
});

test('Settle button only rendered when showSettle; prepare only when showPrepare', () => {
  assert.match(page, /const showSettle = mode === 'settle' && canSettlePayroll\(user, mfaVerified\)/);
  assert.match(page, /const showPrepare = mode === 'prepare' && canPreparePayroll\(user, mfaVerified\)/);
  assert.match(page, /\{showSettle \? <Button data-testid="payroll-settle"/);
  assert.match(page, /\{showPrepare && \(\s*<Button data-testid="payroll-prepare"/);
});

test('only admin/super_admin/ceo/finance_admin with MFA can settle', () => {
  for (const role of ['admin', 'super_admin', 'ceo', 'finance_admin']) {
    assert.equal(mod.canSettlePayroll({ role, claims: { role } }, true), true, role);
    assert.equal(mod.canSettlePayroll({ role, claims: { role } }, false), false, `${role} no MFA`);
  }
  for (const role of ['hr_admin', 'hr_manager', 'hr_staff', 'finance_staff', 'manager', 'operations_admin', 'finance_manager', 'payroll_admin']) {
    assert.equal(mod.canSettlePayroll({ role, claims: { role } }, true), false, role);
  }
  assert.equal(mod.canSettlePayroll({ role: 'finance_admin', claims: { role: 'finance_admin', suspended: true } }, true), false);
});

test('HR prep roles cannot settle; finance_admin does not prepare', () => {
  for (const role of ['hr_admin', 'hr_manager', 'payroll_admin']) assert.equal(mod.canPreparePayroll({ role, claims: { role } }, true), true);
  assert.equal(mod.canPreparePayroll({ role: 'payroll_admin', claims: { role: 'payroll_admin' } }, false), false, 'payroll_admin needs MFA');
  for (const role of ['finance_admin', 'finance_staff', 'hr_staff']) assert.equal(mod.canPreparePayroll({ role, claims: { role } }, true), false);
});
