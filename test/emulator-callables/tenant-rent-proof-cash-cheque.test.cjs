'use strict';
// Regression: tenant rent payment proof must be a Cash / Cheque flow that Admin can approve.
// Before the fix submitTenantPaymentProof stored no payment method (and a bank-transfer
// "OWNER_DIRECT_IBAN" destination), so the live adminApprovePayment gate
// (securePaymentApproval.ts) always refused it with "Phase 1 rent payments may be approved only
// when recorded as Cash or Cheque", and a bank-transfer proof was accepted at submission.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const { submitTenantPaymentProof, adminApprovePayment } = runtime;

const TENANT = 'tenant_rent_proof';
const OWNER = 'owner_rent_proof';
const PROPERTY = 'property_rent_proof';
const UNIT = 'unit_rent_proof_101';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const tenant = { uid: TENANT, token: { role: 'tenant', email: 'tenant.rent.proof@example.invalid', email_verified: true } };

let financeMfa;
test.before(async () => {
  await createUser(TENANT, { role: 'tenant' }, { email: tenant.token.email });
  financeMfa = await createUser('finance_rent_proof', { role: 'finance_admin' }, { tokenExtra: MFA });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc(`users/${TENANT}`).set({ uid: TENANT, role: 'tenant', status: 'active', propertyId: PROPERTY, unitId: UNIT, displayName: 'Rent Proof Tenant', ownerId: OWNER });
  await db.doc(`units/${UNIT}`).set({ propertyId: PROPERTY, unitNumber: '101', tenantId: TENANT, tenantUid: TENANT, ownerId: OWNER, ownerUid: OWNER });
});

let receiptSeq = 0;
async function storeTenantReceipt(submissionId) {
  const body = Buffer.from(`%PDF-1.4\n% tenant rent receipt ${submissionId} ${receiptSeq += 1}\n%%EOF`);
  const receiptHash = crypto.createHash('sha256').update(body).digest('hex');
  const receiptPath = `receipts/${TENANT}/${submissionId}_receipt.pdf`;
  await admin.storage().bucket().file(receiptPath).save(body, {
    resumable: false,
    metadata: { contentType: 'application/pdf', metadata: { tenantId: TENANT, evidenceType: 'tenant_payment_receipt', receiptHash } },
  });
  return { receiptPath, receiptHash, receiptUrl: 'https://example.invalid/receipt' };
}

async function submit(submissionId, fields) {
  const receipt = await storeTenantReceipt(submissionId);
  return call(submitTenantPaymentProof, tenant, { submissionId, period: '2026-10', ...receipt, ...fields });
}

test('Cash proof records the method (no bank-transfer destination) and Admin approves it at the exact fils', async () => {
  const proof = await submit('cash1', { paymentMethod: 'CASH', amount: 7083.38, reference: 'CR-000451' });
  const stored = (await db.doc(`payment_transactions/${proof.paymentId}`).get()).data();
  assert.equal(stored.paymentMethod, 'CASH');
  assert.equal(stored.reference, 'CR-000451');
  assert.equal(stored.cheque, null);
  assert.equal('transferDestination' in stored, false);
  assert.equal(stored.amount, 7083.38);

  const result = await call(adminApprovePayment, financeMfa, { paymentId: proof.paymentId, amountReceived: 7083.38 });
  assert.equal(result.status, 'SUCCESS');
  assert.equal(result.paymentKind, 'RENT_COLLECTION');
  const approved = (await db.doc(`payment_transactions/${proof.paymentId}`).get()).data();
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.paymentVerified, true);
  assert.equal(approved.paymentMethod, 'CASH');
  assert.equal(approved.amountReceived, 7083.38);
  assert.equal(approved.receiptEvidence.storagePath, stored.receiptPath);
  assert.ok(approved.receiptEvidence.generation);
});

test('Cheque proof requires cheque number, bank and date, and is approvable; a 1-fils mismatch is refused', async () => {
  await expectHttpsError(submit('chq_missing', { paymentMethod: 'CHEQUE', amount: 7083.38, chequeBank: 'Emirates NBD', chequeDate: '2026-10-01' }), 'invalid-argument');
  await expectHttpsError(submit('chq_nobank', { paymentMethod: 'CHEQUE', amount: 7083.38, chequeNumber: '000777', chequeDate: '2026-10-01' }), 'invalid-argument');
  await expectHttpsError(submit('chq_nodate', { paymentMethod: 'CHEQUE', amount: 7083.38, chequeNumber: '000777', chequeBank: 'Emirates NBD', chequeDate: '2026-02-30' }), 'invalid-argument');

  const proof = await submit('chq1', { paymentMethod: 'CHEQUE', amount: 7083.38, chequeNumber: '000777', chequeBank: 'Emirates NBD', chequeDate: '2026-10-01' });
  const stored = (await db.doc(`payment_transactions/${proof.paymentId}`).get()).data();
  assert.equal(stored.paymentMethod, 'CHEQUE');
  assert.deepEqual(stored.cheque, { chequeNumber: '000777', chequeBank: 'Emirates NBD', chequeDate: '2026-10-01' });
  assert.equal(stored.reference, '000777');

  await expectHttpsError(call(adminApprovePayment, financeMfa, { paymentId: proof.paymentId, amountReceived: 7083.37 }), 'failed-precondition');
  await expectHttpsError(call(adminApprovePayment, financeMfa, { paymentId: proof.paymentId, method: 'CASH' }), 'failed-precondition');
  const result = await call(adminApprovePayment, financeMfa, { paymentId: proof.paymentId, amountReceived: '7083.38' });
  assert.equal(result.status, 'SUCCESS');
  const approved = (await db.doc(`payment_transactions/${proof.paymentId}`).get()).data();
  assert.equal(approved.status, 'APPROVED');
  assert.equal(approved.paymentMethod, 'CHEQUE');
  assert.equal(approved.amountReceived, 7083.38);
});

test('bank transfer, online and missing methods are rejected server-side', async () => {
  for (const paymentMethod of ['BANK_TRANSFER', 'bank transfer', 'IBAN', 'STRIPE', 'CARD']) {
    await expectHttpsError(submit(`bt_${paymentMethod.replace(/\W/g, '')}`, { paymentMethod, amount: 7083.38, reference: 'FT-12345678' }), 'invalid-argument');
  }
  await expectHttpsError(submit('nomethod', { amount: 7083.38, reference: 'FT-12345678' }), 'invalid-argument');
  const rows = await db.collection('payment_transactions').get();
  assert.equal(rows.size, 0, 'no proof row may be written for a refused method');
});

test('tenant proof approval still requires a finance Admin MFA session', async () => {
  const proof = await submit('cash_mfa', { paymentMethod: 'CASH', amount: 100, reference: 'CR-000452' });
  const noMfa = await createUser('finance_rent_proof_nomfa', { role: 'finance_admin' });
  await expectHttpsError(call(adminApprovePayment, noMfa, { paymentId: proof.paymentId }), 'permission-denied');
  await expectHttpsError(call(adminApprovePayment, tenant, { paymentId: proof.paymentId }), 'permission-denied');
});
