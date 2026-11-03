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
