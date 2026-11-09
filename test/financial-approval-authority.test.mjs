// Static guard: every deployed financial-approval callable must go through an MFA Finance Admin gate
// (or the painting Finance Manager / Controller gate). Prevents the role list from silently widening.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const src = (f) => readFileSync(new URL(`../functions/${f}`, import.meta.url), 'utf8');
const body = (s, name) => { const i = s.indexOf(`export const ${name} = onCall`); assert.ok(i >= 0, name); return s.slice(i, i + 1200); };

test('finance admin role set is admin-tier only', () => {
  const m = src('financeAdminMfa.ts').match(/FINANCE_ADMIN_ROLES = new Set\(\[([^\]]*)\]/);
  const roles = m[1].split(',').map((r) => r.trim().replace(/"/g, '')).sort();
  assert.deepEqual(roles, ['admin', 'ceo', 'finance_admin', 'super_admin']);
});
test('commission and payroll decisions require MFA Finance Admin', () => {
  assert.match(body(src('brokerCommissions.ts'), 'adminReviewBrokerCommission'), /requireMfaFinanceAdminActor\(request\)/);
  assert.match(body(src('hrAutomation.ts'), 'adminSettlePayrollRecord'), /requireMfaFinanceAdminActor\(request\)/);
});
test('painting payments stay with Finance Manager / Controller', () => {
  assert.match(body(src('paintingProjects.ts'), 'financeDecidePaintingPayment'), /requirePaintingFinanceApprover/);
});

// Nov 9 follow-up (from #1996 D-01, kept to Rashid's 3 Nov rule): a stray admin:true boolean never
// upgrades an explicit non-finance role, and the inner payment handler shares the Finance Admin gate.
test('stray admin boolean does not grant finance authority to an explicit non-finance role', () => {
  const file = src('financeAdminMfa.ts');
  assert.match(file, /return role === "" && \(claims\.admin === true \|\| claims\.isAdmin === true\)/);
  const m = file.match(/FINANCE_ADMIN_ROLES = new Set\(\[([^\]]*)\]/);
  assert.deepEqual(m[1].split(',').map((r) => r.trim().replace(/"/g, '')).sort(), ['admin', 'ceo', 'finance_admin', 'super_admin']);
});
test('inner payment handler uses the Finance Admin MFA gate and never accepts operations_admin', () => {
  const inner = src('paymentTransactionApproval.ts');
  const code = inner.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /operations_admin/);
  assert.match(inner, /await requireMfaFinanceAdminActor\(\{ auth \}\)/);
  assert.match(inner, /D5_RECORDER_IS_NOT_APPROVER/);
});
