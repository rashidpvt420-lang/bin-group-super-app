// Owner payment ledger: 15% mobilisation invoice -> CASH/CHEQUE receipt -> cheque clearance -> verified.
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createRequire } from 'node:module';

const outDir = path.resolve('node_modules/.cache/owner-payment-ledger-test');
const outfile = path.join(outDir, `ledger-${process.pid}.cjs`);
await build({ entryPoints: ['functions/ownerPaymentLedger.ts'], bundle: true, platform: 'node', format: 'cjs', outfile, logLevel: 'silent' });
const L = createRequire(import.meta.url)(outfile);
const read = (p) => fs.readFileSync(p, 'utf8');

const invoice = { contractId: 'C1', paymentId: 'P1', amount: 1800, currency: 'AED', feeType: 'MOBILIZATION_DEPOSIT', status: 'PENDING' };
const recorded = (extra = {}) => ({ status: 'PENDING_ADMIN_APPROVAL', verificationState: 'PAYMENT_EVIDENCE_RECORDED', paymentReferenceId: 'R-1', paymentProofHash: 'a'.repeat(64), ...extra });

test('status vocabulary is exactly the five ledger states', () => {
  assert.deepEqual([...L.OWNER_LEDGER_STATUSES], ['PENDING', 'RECEIVED_UNVERIFIED', 'VERIFIED', 'BOUNCED', 'OVERDUE']);
});

test('issued invoice without evidence is PENDING; OVERDUE only when a due date exists and passed', () => {
  assert.equal(L.resolveOwnerLedgerStatus(invoice, null), 'PENDING');
  assert.equal(L.resolveOwnerLedgerStatus({ ...invoice, dueAt: '2026-01-01T00:00:00Z' }, null, Date.parse('2026-02-01')), 'OVERDUE');

});

test('cash/cheque recorded -> RECEIVED_UNVERIFIED; approved -> VERIFIED; bounced -> BOUNCED (even after rejection)', () => {
  assert.equal(L.resolveOwnerLedgerStatus(invoice, recorded({ paymentMethod: 'CASH' })), 'RECEIVED_UNVERIFIED');
  assert.equal(L.resolveOwnerLedgerStatus(invoice, recorded({ paymentMethod: 'CHEQUE', chequeClearanceState: 'PENDING_CLEARANCE' })), 'RECEIVED_UNVERIFIED');
  assert.equal(L.resolveOwnerLedgerStatus({ ...invoice, status: 'PAID' }, recorded({ status: 'APPROVED' })), 'VERIFIED');
  assert.equal(L.resolveOwnerLedgerStatus(invoice, recorded({ paymentMethod: 'CHEQUE', chequeClearanceState: 'BOUNCED' })), 'BOUNCED');
  assert.equal(L.resolveOwnerLedgerStatus(invoice, { status: 'PAYMENT_REJECTED', paymentMethod: 'CHEQUE', chequeClearanceState: 'BOUNCED' }), 'BOUNCED');
});

test('cheque details are mandatory and validated', () => {
  assert.deepEqual(L.parseOwnerChequeDetails({ chequeNumber: '00 1234', chequeBank: 'Test Bank', chequeDate: '2026-10-14' }), { chequeNumber: '001234', chequeBank: 'Test Bank', chequeDate: '2026-10-14' });
  assert.throws(() => L.parseOwnerChequeDetails({ chequeNumber: '12', chequeBank: 'X Bank', chequeDate: '2026-10-14' }));
  assert.throws(() => L.parseOwnerChequeDetails({ chequeNumber: '123456', chequeBank: '', chequeDate: '2026-10-14' }));
  assert.throws(() => L.parseOwnerChequeDetails({ chequeNumber: '123456', chequeBank: 'X Bank', chequeDate: '14/10/2026' }));
});

test('cheque approval requires bank clearance; cash does not', () => {
  assert.doesNotThrow(() => L.assertOwnerChequeClearedForApproval(recorded({ paymentMethod: 'CASH' })));
  assert.throws(() => L.assertOwnerChequeClearedForApproval(recorded({ paymentMethod: 'CHEQUE' })), /cleared/);
  assert.throws(() => L.assertOwnerChequeClearedForApproval(recorded({ paymentMethod: 'CHEQUE', chequeClearanceState: 'BOUNCED' })), /bounced/);
  assert.doesNotThrow(() => L.assertOwnerChequeClearedForApproval(recorded({ paymentMethod: 'CHEQUE', chequeClearanceState: 'CLEARED' })));
});

test('clearance transitions: only cheques, only once, never after verification', () => {
  const cheque = recorded({ paymentMethod: 'CHEQUE', chequeClearanceState: 'PENDING_CLEARANCE' });
  assert.equal(L.assertChequeClearanceTransition(cheque, 'cleared'), 'CLEARED');
  assert.throws(() => L.assertChequeClearanceTransition(recorded({ paymentMethod: 'CASH' }), 'CLEARED'));
  assert.throws(() => L.assertChequeClearanceTransition({ ...cheque, chequeClearanceState: 'CLEARED' }, 'BOUNCED'));
  assert.throws(() => L.assertChequeClearanceTransition({ ...cheque, status: 'APPROVED' }, 'BOUNCED'));
  assert.throws(() => L.assertChequeClearanceTransition(cheque, 'PAID'));
});

test('summary separates verified, awaiting verification and outstanding AED', () => {
  const rows = [
    L.buildOwnerLedgerRow('I1', { ...invoice, status: 'PAID' }, null),
    L.buildOwnerLedgerRow('I2', { ...invoice, amount: 500.5 }, recorded({ paymentMethod: 'CASH' })),
    L.buildOwnerLedgerRow('I3', { ...invoice, amount: 250.25 }, null),
  ];
  const s = L.summarizeOwnerLedger(rows);
  assert.equal(s.verifiedAed, 1800);
  assert.equal(s.awaitingVerificationAed, 500.5);
  assert.equal(s.outstandingAed, 250.25);
});

test('server wiring: evidence captures cheque details + receiver, approval gates on clearance, callables exported', () => {
  const rec = read('functions/inspectionFirstOwnerOnboarding.ts');
  assert.match(rec, /parseOwnerChequeDetails\(request\.data/);
  assert.match(rec, /receivedByAdminUid: actor\.uid/);
  assert.match(rec, /chequeClearanceState: chequeDetails \? "PENDING_CLEARANCE" : null/);
  assert.match(read('functions/securePaymentApproval.ts'), /assertOwnerChequeClearedForApproval\(payment\)/);
  assert.match(read('functions/paymentTransactionApproval.ts'), /assertOwnerChequeClearedForApproval\(freshPayment\)/);
  assert.match(read('functions/runtime.ts'), /ownerPaymentLedgerCallables/);
  const callables = read('functions/ownerPaymentLedgerCallables.ts');
  assert.match(callables, /export const adminSetOwnerChequeClearance = onCall\(\{ cors: true, enforceAppCheck: true \}/);
  assert.match(callables, /export const getOwnerPaymentLedger = onCall\(\{ cors: true, enforceAppCheck: true \}/);
  assert.match(callables, /requireMfaFinanceAdminActor/);
});

test('contract + invoice + receipt PDFs carry the CASH/CHEQUE payment terms in EN/AR without invented numbers', () => {
  const pdf = read('functions/pdfEngine.ts');
  for (const marker of ['9A. Mobilisation: 15% of the annual contract value', '9ج. طرق الدفع', '9D. Cheques: a cheque counts as payment only when the bank has cleared it', '9هـ. الإيصالات', 'CASH or CHEQUE only / نقداً أو بشيك فقط', "'Cheque No. / رقم الشيك'"]) {
    assert.ok(pdf.includes(marker), marker);
  }
  assert.doesNotMatch(pdf, /returned[- ]cheque (fee|charge) of AED [0-9]/i, 'fee comes from RETURNED_CHEQUE_FEE_AED config, not a literal');
});

test('invoice and receipt PDFs register the Cairo font (Arabic labels printed as mojibake before)', () => {
  const pdf = read('functions/pdfEngine.ts');
  for (const fn of ['generateMobilizationUnpaidInvoicePdfArtifact', 'generateOwnerPaymentReceiptPdfArtifact', 'generateMobilizationInvoicePdfArtifact']) {
    const start = pdf.indexOf(`export async function ${fn}`);
    const body = pdf.slice(start, pdf.indexOf('doc.end();', start));
    assert.match(body, /const invoiceFont = await getCairoFont\(\);/, fn);
    assert.match(body, /doc\.registerFont\('Cairo', invoiceFont\);\s*doc\.font\('Cairo'\);/, fn);
  }
});

test('admin + owner views use the ledger', () => {
  const adminPage = read('apps/admin-panel/src/pages/financials/PaymentApprovalsPage.tsx');
  assert.match(adminPage, /adminSetOwnerChequeClearance/);
  assert.match(adminPage, /chequeNumber: chequeNumber\.replace/);
  assert.match(read('src/owner/pages/OwnerFinancialsPage.tsx'), /getOwnerPaymentLedger/);
});

test('approved terms: 7-day due date, AED 500 returned-cheque fee, 15-day suspension notice', () => {
  assert.equal(L.OWNER_MOBILIZATION_DUE_DAYS, 7);
  assert.equal(L.RETURNED_CHEQUE_FEE_AED, 500);
  assert.equal(L.OWNER_SUSPENSION_NOTICE_DAYS, 15);
  const issued = Date.parse('2026-10-01T08:00:00Z');
  assert.equal(L.mobilizationDueAt(issued).toISOString(), '2026-10-08T08:00:00.000Z');
  const mob = { ...invoice, issuedAt: '2026-10-01T08:00:00Z' };
  assert.equal(L.resolveOwnerLedgerStatus(mob, null, Date.parse('2026-10-08T07:59:00Z')), 'PENDING');
  assert.equal(L.resolveOwnerLedgerStatus(mob, null, Date.parse('2026-10-08T08:01:00Z')), 'OVERDUE');
  assert.equal(L.resolveOwnerLedgerStatus(mob, recorded({ paymentMethod: 'CASH' }), Date.parse('2026-10-20')), 'RECEIVED_UNVERIFIED');
  assert.equal(L.buildOwnerLedgerRow('I', mob, null).dueAt, '2026-10-08T08:00:00.000Z');
});

test('bounced cheque raises a pending AED 500 fee for the owner or the tenant, shown in pending totals', () => {
  const ownerPay = recorded({ paymentMethod: 'CHEQUE', ownerUid: 'owner-1', contractId: 'C1' });
  const tenantPay = { recordType: 'TENANT_RENT_PAYMENT_PROOF', submittedByTenant: true, tenantId: 'tenant-1', paymentMethod: 'CHEQUE', receiptHash: 'b'.repeat(64), status: 'APPROVED', paymentVerified: true, cheque: { chequeNumber: '555555', chequeBank: 'Bank', chequeDate: '2026-10-01' } };
  assert.deepEqual(L.chequePayerOf(ownerPay), { payerType: 'OWNER', payerUid: 'owner-1' });
  assert.deepEqual(L.chequePayerOf(tenantPay), { payerType: 'TENANT', payerUid: 'tenant-1' });
  assert.equal(L.assertChequeClearanceTransition(tenantPay, 'BOUNCED'), 'BOUNCED', 'tenant rent cheque can bounce after verification');
  const ownerFee = L.buildReturnedChequeFeeInvoice({ paymentId: 'P1', ...L.chequePayerOf(ownerPay), contractId: 'C1' });
  const tenantFee = L.buildReturnedChequeFeeInvoice({ paymentId: 'T1', ...L.chequePayerOf(tenantPay) });
  assert.equal(ownerFee.invoiceId, 'RCF-P1');
  assert.equal(ownerFee.amount, 500); assert.equal(ownerFee.status, 'PENDING'); assert.equal(ownerFee.ownerId, 'owner-1'); assert.equal(ownerFee.feeType, 'RETURNED_CHEQUE_FEE');
  assert.equal(tenantFee.tenantId, 'tenant-1'); assert.equal(tenantFee.payerUid, 'tenant-1'); assert.equal(tenantFee.ownerId, null);
  assert.throws(() => L.buildReturnedChequeFeeInvoice({ paymentId: 'X', payerType: 'TENANT', payerUid: '' }));
  const rows = [L.buildOwnerLedgerRow('INV', invoice, recorded({ paymentMethod: 'CHEQUE', chequeClearanceState: 'BOUNCED' })), L.buildOwnerLedgerRow(ownerFee.invoiceId, ownerFee, null)];
  assert.equal(rows[1].ledgerStatus, 'PENDING');
  const s = L.summarizeOwnerLedger(rows);
  assert.equal(s.outstandingAed, 2300);
  assert.equal(s.returnedChequeFeesPendingAed, 500);
  const callables = read('functions/ownerPaymentLedgerCallables.ts');
  assert.match(callables, /transaction\.create\(db\.collection\("invoices"\)\.doc\(feeInvoiceId\)/);
  assert.match(callables, /where\("payerUid", "==", ownerUid\)/);
});

test('documents state the approved terms in EN/AR and on the tenant payment terms', () => {
  const pdf = read('functions/pdfEngine.ts');
  assert.doesNotMatch(pdf, /NOTICE PERIOD: TO BE CONFIRMED/);
  for (const marker of ['payable within ${OWNER_MOBILIZATION_DUE_DAYS} days of the invoice date', 'A returned-cheque fee of AED ${RETURNED_CHEQUE_FEE_AED} per returned cheque', 'رسم قدره ${RETURNED_CHEQUE_FEE_AED} درهم عن كل شيك مرتجع', '${OWNER_SUSPENSION_NOTICE_DAYS} days to pay', 'مهلة للسداد مدتها ${OWNER_SUSPENSION_NOTICE_DAYS} يوماً', "'Due Date / تاريخ الاستحقاق'"]) assert.ok(pdf.includes(marker), marker);
  for (const file of ['functions/adminOwnerOperations.ts', 'functions/paymentTransactionApproval.ts']) assert.match(read(file), /dueAt: mobilizationDueAt\(Date\.now\(\)\)\.toISOString\(\)/, file);
  assert.match(read('src/tenant/pages/TenantPaymentsPage.tsx'), /fee of AED 500 in addition to the unpaid rent[\s\S]*500 درهم عن كل شيك مرتجع/);
});
