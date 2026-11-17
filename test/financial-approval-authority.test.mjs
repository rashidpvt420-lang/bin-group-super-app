// Centralized Finance Authorization Policy Guard:
// CEO status alone and Super Admin status alone must NEVER grant financial approval authority.
// Financial approvals must be restricted to explicitly authorized Finance approver identities:
// finance_admin, finance_manager, finance_controller, with verified MFA and segregation-of-duties controls.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const src = (f) => readFileSync(`${root}functions/${f}`, 'utf8');
const body = (s, name) => { const i = s.indexOf(`export const ${name} = onCall`); assert.ok(i >= 0, name); return s.slice(i, i + 1200); };

function bundleModule(entryRelPath) {
  const res = buildSync({
    entryPoints: [`${root}functions/${entryRelPath}`],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    external: ['firebase-admin', 'firebase-functions', 'firebase-functions/*'],
    logLevel: 'silent',
  });
  const mod = { exports: {} };
  const fn = new Function('module', 'exports', 'require', res.outputFiles[0].text);
  fn(mod, mod.exports, (name) => ({
    apps: [{}],
    initializeApp: () => {},
    firestore: () => ({}),
    HttpsError: class HttpsError extends Error {
      constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
      }
    },
  }));
  return mod.exports;
}

const { claimsGrantFinanceAdmin, FINANCE_ADMIN_ROLES } = bundleModule('financeAdminMfa.ts');
const { paymentDualControlViolation, assertPaymentDualControl } = bundleModule('paymentDualControl.ts');

test('finance admin role set contains only authorized finance approver roles and strictly excludes ceo, super_admin, admin', () => {
  const m = src('financeAdminMfa.ts').match(/FINANCE_ADMIN_ROLES = new Set\(\[([^\]]*)\]/);
  const roles = m[1].split(',').map((r) => r.trim().replace(/"/g, '')).sort();
  assert.deepEqual(roles, ['finance_admin', 'finance_controller', 'finance_manager']);
  assert.equal(roles.includes('ceo'), false, 'CEO must NOT be in FINANCE_ADMIN_ROLES');
  assert.equal(roles.includes('super_admin'), false, 'Super Admin must NOT be in FINANCE_ADMIN_ROLES');
  assert.equal(roles.includes('admin'), false, 'Generic Admin must NOT be in FINANCE_ADMIN_ROLES');
});

test('claimsGrantFinanceAdmin returns false for CEO-only, Super Admin-only, and generic Admin claims', () => {
  const deniedClaims = [
    { role: 'ceo' },
    { role: 'ceo', ceo: true },
    { ceo: true },
    { role: 'super_admin' },
    { role: 'super_admin', superAdmin: true },
    { superAdmin: true },
    { role: 'admin' },
    { role: 'admin', admin: true },
    { admin: true },
    { isAdmin: true },
  ];
  for (const c of deniedClaims) {
    assert.equal(claimsGrantFinanceAdmin(c), false, `Claim ${JSON.stringify(c)} must NOT grant finance admin authority`);
  }
});

test('claimsGrantFinanceAdmin returns false for non-finance roles and ordinary staff', () => {
  const nonFinance = ['owner', 'tenant', 'technician', 'broker', 'manager', 'operations_admin', 'hr_admin', 'hr_manager', 'support_admin', 'finance_staff'];
  for (const role of nonFinance) {
    assert.equal(claimsGrantFinanceAdmin({ role }), false, `Role ${role} must NOT grant finance admin authority`);
    assert.equal(claimsGrantFinanceAdmin({ role, admin: true }), false, `Role ${role} + admin boolean must NOT grant finance authority`);
  }
});

test('claimsGrantFinanceAdmin returns true for explicitly authorized Finance approver roles', () => {
  for (const role of ['finance_admin', 'finance_manager', 'finance_controller']) {
    assert.equal(claimsGrantFinanceAdmin({ role }), true, `Role ${role} must grant finance authority`);
  }
});

test('claimsGrantFinanceAdmin returns true when CEO or Super Admin holds separately assigned explicit Finance claim', () => {
  assert.equal(claimsGrantFinanceAdmin({ role: 'ceo', finance_admin: true }), true);
  assert.equal(claimsGrantFinanceAdmin({ role: 'super_admin', finance_controller: true }), true);
  assert.equal(claimsGrantFinanceAdmin({ role: 'admin', finance_manager: true }), true);
});

test('claimsGrantFinanceAdmin returns false when account is suspended, even with valid finance role', () => {
  assert.equal(claimsGrantFinanceAdmin({ role: 'finance_admin', suspended: true }), false);
  assert.equal(claimsGrantFinanceAdmin({ role: 'finance_manager', suspended: true }), false);
  assert.equal(claimsGrantFinanceAdmin({ role: 'ceo', finance_admin: true, suspended: true }), false);
});

test('commission and payroll callables require MFA Finance Admin and enforce segregation of duties', () => {
  const brokerSrc = src('brokerCommissions.ts');
  assert.match(body(brokerSrc, 'adminReviewBrokerCommission'), /requireMfaFinanceAdminActor\(request\)/);
  assert.match(brokerSrc, /brokerId && brokerId === request\.auth\?\.uid/);

  const hrSrc = src('hrAutomation.ts');
  assert.match(body(hrSrc, 'adminSettlePayrollRecord'), /requireMfaFinanceAdminActor\(request\)/);
  assert.match(hrSrc, /techId && techId === request\.auth\?\.uid/);
});

test('broker payout review uses the same MFA Finance Admin gate, denies CEO/Super Admin/Admin, and enforces requester segregation plus cash/cheque settlement', () => {
  const payoutSrc = src('adminBrokerPayoutReview.ts');
  assert.match(body(payoutSrc, 'adminReviewBrokerPayoutRequest'), /requireMfaFinanceAdminActor\(request\)/);
  assert.match(payoutSrc, /enforceAppCheck:\s*true/);
  assert.doesNotMatch(payoutSrc, /ADMIN_ROLES = new Set/);
  assert.doesNotMatch(payoutSrc, /token\.ceo === true/);
  assert.doesNotMatch(payoutSrc, /token\.admin === true/);
  assert.match(payoutSrc, /the payout requester cannot approve, reject, or mark paid their own payout/);
  assert.match(payoutSrc, /PHASE1_PAYOUT_METHODS = new Set\(\["CASH", "CHEQUE"\]\)/);
  assert.match(payoutSrc, /Phase 1 payout settlement accepts Cash or Cheque only/);
});

test('painting payments stay with Finance Manager / Controller only', () => {
  assert.match(body(src('paintingProjects.ts'), 'financeDecidePaintingPayment'), /requirePaintingFinanceApprover/);
});

test('inner payment handler uses the Finance Admin MFA gate, rejects self-rejection, and never accepts operations_admin', () => {
  const inner = src('paymentTransactionApproval.ts');
  const code = inner.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /operations_admin/);
  assert.match(inner, /await requireMfaFinanceAdminActor\(\{ auth \}\)/);
  assert.match(inner, /D5_RECORDER_IS_NOT_APPROVER/);
  assert.match(inner, /payerUid && payerUid === actorId/);
});

test('dual control evaluation enforces segregation of duties', () => {
  // Recorder cannot approve their own payment (SAME_ADMIN)
  assert.equal(paymentDualControlViolation({ paymentEvidenceRecordedBy: 'admin_1' }, 'admin_1'), 'SAME_ADMIN');

  // Payer (customer/owner/tenant) cannot approve their own payment (SAME_PAYER)
  assert.equal(paymentDualControlViolation({ ownerUid: 'owner_1' }, 'owner_1'), 'SAME_PAYER');
  assert.equal(paymentDualControlViolation({ tenantUid: 'tenant_1' }, 'tenant_1'), 'SAME_PAYER');

  // Admin-recorded payment with unknown recorder fails closed (RECORDER_UNKNOWN)
  assert.equal(paymentDualControlViolation({ verificationState: 'PAYMENT_EVIDENCE_RECORDED' }, 'admin_2'), 'RECORDER_UNKNOWN');

  // Customer-submitted payment without proof artifacts fails closed (MALFORMED_EVIDENCE)
  assert.equal(paymentDualControlViolation({ verificationState: 'OWNER_SUBMITTED', status: 'PENDING_ADMIN_APPROVAL' }, 'admin_2'), 'MALFORMED_EVIDENCE');

  // Independent finance approver approving valid evidence succeeds (null violation)
  assert.equal(paymentDualControlViolation({ paymentEvidenceRecordedBy: 'admin_1' }, 'admin_2'), null);
  assert.equal(paymentDualControlViolation({
    verificationState: 'OWNER_SUBMITTED',
    status: 'PENDING_ADMIN_APPROVAL',
    paymentProofPath: 'proofs/p1.pdf',
    ownerUid: 'owner_1'
  }, 'admin_2'), null);
});

test('non-payout money approval and mark-paid callables use requireMfaFinanceAdminActor', () => {
  const callables = [
    ['ownerPaymentLedgerCallables.ts', 'adminSetOwnerChequeClearance'],
    ['ownerPaymentLedgerCallables.ts', 'adminRecordReplacementInvoicePayment'],
    ['ownerPaymentLedgerCallables.ts', 'adminVerifyReplacementInvoicePayment'],
    ['pdcRegister.ts', 'financeRecordPdcStatus'],
    ['paymentCollectionRecords.ts', 'financeRecordPaymentCollection'],
    ['paymentCollectionRecords.ts', 'financeVoidPaymentCollection'],
    ['ownerReferralRewards.ts', 'financeApproveOwnerReferralReward'],
    ['ownerReferralRewards.ts', 'financeRejectOwnerReferral'],
    ['preventiveMaintenancePlans.ts', 'financeActivatePmSubscription'],
    ['inspectionFirstOwnerOnboarding.ts', 'adminRecordOwnerMobilizationPaymentEvidence'],
    ['designPayments.ts', 'adminReviewDesignPayment'],
  ];
  for (const [file, name] of callables) {
    const code = src(file);
    const fn = body(code, name);
    if (name === 'adminReviewDesignPayment') {
      assert.match(fn, /actor\(request, true\)/, `${name} must use the finance actor`);
      assert.match(code, /requireMfaFinanceAdminActor\(request\)/, `${file} must call requireMfaFinanceAdminActor`);
    } else {
      assert.match(fn, /requireMfaFinanceAdminActor\(request\)/, `${name} must use requireMfaFinanceAdminActor`);
    }
  }
});

test('legacy profileP1 payout review is gone; runtime exports the MFA Finance Admin implementation', () => {
  const p1 = src('profileP1Workflows.ts');
  assert.doesNotMatch(p1, /export const adminReviewBrokerPayoutRequest/);
  assert.doesNotMatch(p1, /ADMIN_\$\{action\}_BROKER_PAYOUT/);
  const runtime = src('runtime.ts');
  assert.match(runtime, /export \{ adminReviewBrokerPayoutRequest \} from "\.\/adminBrokerPayoutReview"/);
});

test('owner payment ledger leftovers no longer treat ADMIN_ROLES as money approval authority', () => {
  const ledger = src('ownerPaymentLedgerCallables.ts');
  assert.doesNotMatch(ledger, /const ADMIN_ROLES = new Set/);
  assert.match(ledger, /LEDGER_OVERSIGHT_ROLES/);
  for (const name of ['adminSetOwnerChequeClearance', 'adminRecordReplacementInvoicePayment', 'adminVerifyReplacementInvoicePayment']) {
    assert.match(body(ledger, name), /requireMfaFinanceAdminActor\(request\)/);
    assert.doesNotMatch(body(ledger, name), /canReadOwnerPaymentLedger|LEDGER_OVERSIGHT_ROLES|isAdminToken/);
  }
});

test('isFinance\(\) in Firestore rules no longer treats generic Admin, CEO, or Super Admin as finance', () => {
  const rules = readFileSync(`${root}firestore.rules`, 'utf8');
  const match = rules.match(/function isFinance\(\) \{[\s\S]*?\n    \}/);
  assert.ok(match, 'isFinance() must exist');
  assert.doesNotMatch(match[0], /isAdmin\(\)/);
  assert.doesNotMatch(match[0], /'admin'|'ceo'|'super_admin'|"admin"|"ceo"|"super_admin"/);
  assert.match(match[0], /finance_admin/);
  const payouts = rules.match(/match \/payouts\/\{payoutId\} \{[\s\S]*?\n    \}/);
  assert.ok(payouts, 'payouts match block must exist');
  assert.match(payouts[0], /allow create, update, delete: if false;/);
  assert.doesNotMatch(payouts[0], /allow write: if isAdmin\(\)/);
  const catchAll = rules.match(/match \/\{collection\}\/\{document=\*\*\} \{[\s\S]*\}\s*\}\s*\}\s*$/);
  assert.ok(catchAll, 'admin catch-all must exist');
  assert.match(catchAll[0], /'payouts'/);
});
