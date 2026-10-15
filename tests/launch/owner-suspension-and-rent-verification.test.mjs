// Clause 9F suspension after a returned 15% cheque + owner rent counted only when VERIFIED.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const outDir = path.resolve('node_modules/.cache/owner-suspension-test');
const req = createRequire(import.meta.url);
async function load(entry, name) {
  const outfile = path.join(outDir, `${name}-${process.pid}.cjs`);
  await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
  return req(outfile);
}
const S = await load('functions/ownerServiceSuspension.ts', 'susp');
const R = await load('src/owner/utils/ownerTenantLedgerResolver.ts', 'rent');
const L = await load('functions/ownerPaymentLedger.ts', 'ledger');
const read = (p) => fs.readFileSync(p, 'utf8');
const DAY = 86400000;
const issued = Date.parse('2026-10-15T06:00:00Z');
const notice = S.buildOwnerSuspensionNotice({ contractId: 'C1', ownerUid: 'o-1', paymentId: 'C1', invoiceIds: ['MOB-1', 'RCF-C1'], amountsAed: [1800, 500], issuedAtMs: issued, issuedBy: 'admin-b', bankReason: 'Insufficient funds' });
const unpaidMob = { feeType: 'MOBILIZATION_DEPOSIT', status: 'PENDING', receiptState: 'REVERSED' };
const unpaidFee = { feeType: 'RETURNED_CHEQUE_FEE', status: 'PENDING' };
const paid = (inv) => ({ ...inv, status: 'PAID', paymentStatus: 'PAID', replacementPayment: { method: 'CASH', verifiedAt: '2026-10-20T00:00:00Z' } });

test('notice: 15-day deadline, total = 15% + AED 500, EN/AR text', () => {
  assert.equal(notice.noticeId, 'SUSP-C1-C1');
  assert.equal(notice.deadlineAt, '2026-10-30T06:00:00.000Z');
  assert.equal(notice.totalAed, 2300);
  assert.equal(notice.status, 'NOTICE_ISSUED');
  assert.match(notice.textEn, /2,300/); assert.match(notice.textEn, /2026-10-30/);
  assert.match(notice.textAr, /15 يوماً/);
});

test('never suspends before day 15; suspends after deadline if unpaid', () => {
  assert.equal(S.decideSuspension(notice, [unpaidMob, unpaidFee], issued + 14 * DAY), 'WAIT');
  assert.equal(S.decideSuspension(notice, [unpaidMob, unpaidFee], issued + 15 * DAY - 1), 'WAIT');
  assert.equal(S.decideSuspension(notice, [unpaidMob, unpaidFee], issued + 15 * DAY), 'SUSPEND');
  assert.equal(S.decideSuspension(notice, [paid(unpaidMob), unpaidFee], issued + 16 * DAY), 'SUSPEND', 'fee still unpaid');
});

test('paid before deadline resolves; payment after suspension lifts; idempotent', () => {
  assert.equal(S.decideSuspension(notice, [paid(unpaidMob), paid(unpaidFee)], issued + 3 * DAY), 'RESOLVE');
  const suspended = { ...notice, status: 'SUSPENDED' };
  assert.equal(S.decideSuspension(suspended, [unpaidMob, unpaidFee], issued + 20 * DAY), 'NOOP', 'already suspended: no double apply');
  assert.equal(S.decideSuspension(suspended, [paid(unpaidMob), unpaidFee], issued + 20 * DAY), 'NOOP');
  assert.equal(S.decideSuspension(suspended, [paid(unpaidMob), paid(unpaidFee)], issued + 20 * DAY), 'LIFT');
  for (const done of ['LIFTED', 'RESOLVED']) assert.equal(S.decideSuspension({ ...notice, status: done }, [unpaidMob], issued + 40 * DAY), 'NOOP');
  assert.equal(S.invoiceSettled({ status: 'PAID', receiptState: 'REVERSED' }), false, 'reversed receipt is not payment');
  assert.equal(S.invoiceSettled({ status: 'PENDING', replacementPayment: { method: 'CHEQUE', verifiedAt: null } }), false, 'recorded but unverified is not payment');
});

test('ledger shows replacement payments: recorded -> RECEIVED_UNVERIFIED, verified -> VERIFIED', () => {
  assert.equal(L.resolveOwnerLedgerStatus({ ...unpaidFee, replacementPayment: { method: 'CASH' } }, null), 'RECEIVED_UNVERIFIED');
  assert.equal(L.resolveOwnerLedgerStatus(paid(unpaidMob), { paymentReversal: {} }), 'VERIFIED');
});

test('server wiring: notice on bounce, in-app notifications only, scheduled enforcement, dual-control replacement, lift', () => {
  const c = read('functions/ownerPaymentLedgerCallables.ts');
  assert.match(c, /transaction\.create\(db\.collection\("owner_service_suspensions"\)\.doc\(notice\.noticeId\)/);
  assert.match(c, /OWNER_SUSPENSION_NOTICE_ISSUED/);
  assert.match(c, /export const enforceOwnerPaymentSuspensions = onSchedule/);
  assert.match(c, /status: "SUSPENDED", serviceSuspended: true/);
  assert.match(c, /OWNER_SERVICE_\$\{decision === "SUSPEND" \? "SUSPENDED"/);
  assert.match(c, /A different Finance Admin must verify this payment \(dual control\)/);
  assert.match(c, /Confirm the replacement cheque has been cleared by the bank/);
  assert.match(c, /array-contains", invoiceId\)[\s\S]*applyOwnerSuspensionDecision/);
  assert.doesNotMatch(c, /sendEmail|sendSms|mail\(|twilio/i, 'no external email/SMS');
  assert.doesNotMatch(c, /disabled: true|updateUser\(/, 'owner account is never disabled');
});

test('owner rent: collected only when VERIFIED; awaiting verification shown separately (EN/AR)', () => {
  const rows = [
    { recordType: 'TENANT_RENT_PAYMENT_PROOF', id: 'p1', amount: 4000, status: 'PENDING_ADMIN_PAYMENT_VERIFICATION' },
    { recordType: 'TENANT_RENT_PAYMENT_PROOF', id: 'p2', amount: 3000, status: 'APPROVED', paymentVerified: true },
    { recordType: 'TENANT_RENT_PAYMENT_PROOF', id: 'p3', amount: 2000, status: 'UNPAID_CHEQUE_RETURNED', paymentReversal: {} },
    { recordType: 'TENANT_RENT_PAYMENT_PROOF', id: 'p4', amount: 1000, status: 'REJECTED' },
  ];
  assert.deepEqual(rows.map(R.rentPaymentCollectionState), ['RECEIVED_UNVERIFIED', 'VERIFIED', 'REVERSED', 'REJECTED']);
  const summary = R.resolveTenantLedger([], [], [], [], [], rows);
  assert.equal(summary.totalRentPaid, 3000);
  assert.equal(summary.totalRentAwaitingVerification, 4000);
  assert.deepEqual(R.RENT_AWAITING_VERIFICATION_LABEL, { en: 'Awaiting verification', ar: 'بانتظار التحقق' });
  const section = read('src/owner/components/OwnerRentCollectionSection.tsx');
  assert.match(section, /RENT_AWAITING_VERIFICATION_LABEL\.ar : RENT_AWAITING_VERIFICATION_LABEL\.en/);
  assert.match(read('src/owner/pages/OwnerDashboardResolvedPage.tsx'), /paid: 0,\s*awaitingVerification: rentPaid/);
  assert.match(read('src/owner/pages/OwnerFinancialsPage.tsx'), /owner-suspension-notice/);
});
