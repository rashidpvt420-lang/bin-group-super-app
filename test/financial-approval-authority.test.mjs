// Static guard: every deployed financial-approval callable must go through an MFA Finance Admin gate
// (or the painting Finance Manager / Controller gate). Prevents the role list from silently widening.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
const src = (f) => readFileSync(new URL(`../functions/${f}`, import.meta.url), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
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

// Audit D-01 (Nov 2026): payment approve / reject is limited to finance roles on the server.
test('payment decision role set is finance roles only (no operations_admin)', () => {
  const file = src('financeAdminMfa.ts');
  assert.match(file, /PAYMENT_DECISION_ROLES[^=]*= new Set\(\[\.\.\.FINANCE_ADMIN_ROLES\]\)/);
  assert.doesNotMatch(code(file), /operations_admin/);
  // A stray admin:true boolean never upgrades an explicit non-finance role.
  assert.match(file, /return role === "" && \(claims\.admin === true \|\| claims\.isAdmin === true\)/);
});
test('payment approve / reject go through the finance payment gate with MFA and dual control', () => {
  const wrapper = src('securePaymentApproval.ts');
  assert.match(wrapper, /await requireMfaPaymentDecisionActor\(\{ auth \}\)/);
  assert.match(body(wrapper, 'adminApprovePayment'), /requireMfaFinanceAdmin\(request\.auth\)/);
  assert.match(body(wrapper, 'adminRejectPayment'), /requireMfaFinanceAdmin\(request\.auth\)/);
  const inner = src('paymentTransactionApproval.ts');
  assert.doesNotMatch(code(inner), /operations_admin/);
  assert.doesNotMatch(inner, /const ADMIN_ROLES/);
  assert.match(inner, /await requireMfaPaymentDecisionActor\(\{ auth \}\)/);
  for (const name of ['adminApprovePayment', 'adminRejectPayment']) {
    const fn = body(inner, name);
    assert.match(fn, /await requireAdmin\(request\.auth\);\s*await requirePrivilegedMfaSession\(request\.auth\);/);
  }
  assert.match(inner, /D5_RECORDER_IS_NOT_APPROVER/);
});
test('cheque clearance and replacement payments use the finance payment gate', () => {
  const ledger = src('ownerPaymentLedgerCallables.ts');
  for (const name of ['adminSetOwnerChequeClearance', 'adminRecordReplacementInvoicePayment', 'adminVerifyReplacementInvoicePayment']) {
    assert.match(body(ledger, name), /requirePrivilegedMfaSession\(request\.auth\);\s*const actor = await requireMfaPaymentDecisionActor\(request\)/);
  }
  assert.doesNotMatch(code(ledger), /operations_admin/);
});
