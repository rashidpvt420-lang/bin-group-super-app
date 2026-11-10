// Frontend capability map: only admin/super_admin/ceo get blanket permissions; money caps need an explicit finance role.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const src = fs.readFileSync('src/context/RoleContext.tsx', 'utf8');
const start = src.indexOf('export const FULL_ADMIN_ROLES');
const end = src.indexOf('const normalizeRole');
const out = ts.transpileModule(src.slice(start, end).replace(/new Set<SovereignPermission>/g, 'new Set'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const mod = await import('data:text/javascript,' + encodeURIComponent(out));

test('hasPermission has no isAdmin blanket bypass and manager claim is not admin', () => {
  assert.doesNotMatch(src, /if \(isAdmin\) return true;/);
  assert.doesNotMatch(src, /claims\.manager === true/);
  assert.match(src, /return resolvePermission\(role, claimFullAdmin, permissions, permission\)/);
});

test('full admin is only admin, super_admin, ceo', () => {
  assert.deepEqual([...mod.FULL_ADMIN_ROLES].sort(), ['admin', 'ceo', 'super_admin']);
  for (const r of ['admin', 'super_admin', 'ceo']) assert.equal(mod.resolvePermission(r, false, {}, 'canEditPricing'), true);
});

test('departmental admins do not get full permissions', () => {
  for (const r of ['manager', 'operations_admin', 'hr_admin', 'support_admin', 'finance_admin']) {
    assert.equal(mod.resolvePermission(r, false, {}, 'canEditPricing'), false, r);
    assert.equal(mod.resolvePermission(r, false, {}, 'canManageCompanyProfile'), false, r);
  }
  assert.equal(mod.resolvePermission('finance_admin', false, {}, 'canVerifyPayments'), true);
  assert.equal(mod.resolvePermission('hr_admin', false, {}, 'canViewHR'), true);
  assert.equal(mod.resolvePermission('hr_admin', false, {}, 'canManagePayroll'), false);
});

test('profile permission flags never grant money capabilities to non-finance roles', () => {
  const flags = { canVerifyPayments: true, canApproveExpenses: true, canManagePayroll: true, canExportReports: true };
  for (const r of ['manager', 'operations_admin', 'hr_admin', 'hr_manager', 'support_admin', 'finance_staff']) {
    for (const p of ['canVerifyPayments', 'canApproveExpenses', 'canManagePayroll']) assert.equal(mod.resolvePermission(r, false, flags, p), false, `${r}:${p}`);
  }
  assert.equal(mod.resolvePermission('manager', false, flags, 'canExportReports'), true);
});

test('full-admin claims respect explicit role precedence', () => {
  assert.equal(mod.claimsGrantFullAdmin({ admin: true }), true, 'legacy role-less admin claim remains supported');
  assert.equal(mod.claimsGrantFullAdmin({ superAdmin: true }), true, 'explicit super-admin claim remains supported');
  assert.equal(mod.claimsGrantFullAdmin({ manager: true, role: 'manager' }), false);
  assert.equal(mod.claimsGrantFullAdmin({ role: 'finance_admin' }), false);
  for (const role of ['technician', 'hr_admin', 'hr_manager', 'operations_admin', 'finance_staff']) {
    assert.equal(mod.claimsGrantFullAdmin({ role, admin: true }), false, role);
    assert.equal(mod.claimsGrantFullAdmin({ role, isAdmin: true }), false, role);
  }
  assert.equal(mod.claimsGrantFullAdmin({ role: 'hr_admin', superAdmin: true }), true, 'explicit super-admin override is retained');
});

test('generic admin booleans cannot turn a non-admin role into an Admin portal identity', () => {
  assert.match(src, /claimRole === '' && \(claims\.admin === true \|\| claims\.isAdmin === true\)/);
});

test('server HR lifecycle full-admin fallback matches Firestore role precedence', () => {
  const backend = fs.readFileSync('functions/adminStaffLifecycle.ts', 'utf8');
  const helper = backend.slice(backend.indexOf('function isFullAdminToken'), backend.indexOf('async function requireActiveActor'));
  assert.match(helper, /FULL_ADMIN_ROLES\.has\(role\)/);
  assert.match(helper, /role === "" && \(token\?\.admin === true \|\| token\?\.isAdmin === true\)/);
  assert.doesNotMatch(helper, /FULL_ADMIN_ROLES\.has\(role\) \|\| token\?\.admin === true/);
});

const staffPolicySrc = fs.readFileSync('apps/admin-panel/src/security/staffAccessPolicy.ts', 'utf8');
const staffPolicyOut = ts.transpileModule(staffPolicySrc, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const staffPolicy = await import('data:text/javascript,' + encodeURIComponent(staffPolicyOut));

test('admin-panel route policy does not promote explicit non-admin roles from generic booleans', () => {
  for (const role of ['technician', 'hr_admin', 'hr_manager', 'operations_admin', 'finance_staff']) {
    assert.equal(staffPolicy.isFullAdminUser({ role, claims: { role, admin: true } }), false, role);
    assert.equal(staffPolicy.isFullAdminUser({ role, claims: { role, isAdmin: true } }), false, role);
  }
  assert.equal(staffPolicy.isFullAdminUser({ claims: { admin: true } }), true, 'legacy role-less admin claim remains supported');
  assert.equal(staffPolicy.isFullAdminUser({ role: 'hr_admin', claims: { role: 'hr_admin', superAdmin: true } }), true);
});
