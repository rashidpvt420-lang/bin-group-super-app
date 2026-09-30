'use strict';
// Regression: AED money input is exact to the fils. Sub-fils amounts (e.g. 7083.385) must be
// rejected, not silently rounded (ownerRecordRentPayment stored 7083.39 for 7083.385;
// submitTenantPaymentProof and adminApprovePayment's amountReceived rounded the same way, so an
// Admin "confirming" 7083.375 matched a 7083.38 record).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { ownerRecordRentPayment, submitTenantPaymentProof, adminApprovePayment } = lib('runtimeAll.js');

const OWNER = 'owner_sub_fils';
const TENANT = 'tenant_sub_fils';
const PROPERTY = 'property_sub_fils';
const UNIT = 'unit_sub_fils_101';
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const owner = { uid: OWNER, token: { role: 'owner', email: 'owner.sub.fils@example.invalid', email_verified: true } };
const tenant = { uid: TENANT, token: { role: 'tenant', email: 'tenant.sub.fils@example.invalid', email_verified: true } };

let finance;
test.before(async () => {
  await createUser(OWNER, { role: 'owner' }, { email: owner.token.email });
  await createUser(TENANT, { role: 'tenant' }, { email: tenant.token.email });
  finance = await createUser('finance_sub_fils', { role: 'finance_admin' }, { tokenExtra: MFA });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc(`properties/${PROPERTY}`).set({ ownerId: OWNER, ownerUid: OWNER, name: 'Sub Fils Tower' });
  await db.doc(`users/${TENANT}`).set({ uid: TENANT, role: 'tenant', status: 'active', propertyId: PROPERTY, unitId: UNIT, ownerId: OWNER });
  await db.doc(`units/${UNIT}`).set({ propertyId: PROPERTY, tenantId: TENANT, tenantUid: TENANT, ownerId: OWNER });
});

async function ownerReceipt(paymentId) {
  const body = Buffer.from(`%PDF-1.4\n% owner receipt ${paymentId}\n%%EOF`);
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  const path = `payment-references/owners/${OWNER}/${paymentId}/receipt.pdf`;
  await admin.storage().bucket().file(path).save(body, { resumable: false, metadata: { contentType: 'application/pdf', metadata: { ownerUid: OWNER, paymentId, evidenceType: 'owner_payment_receipt', receiptHash: hash } } });
  return { referenceFilePath: path, referenceFileHash: hash };
}

async function recordRent(paymentTransactionId, amount) {
  return call(ownerRecordRentPayment, owner, {
    propertyId: PROPERTY, tenantName: 'Sub Fils Tenant', unitNumber: '101', rentDue: amount, rentPaid: amount,
    paymentMethod: 'CASH', paymentReference: 'CASH-R-0001', paymentTransactionId, ...(await ownerReceipt(paymentTransactionId)),
  });
}

test('Owner rent record rejects sub-fils amounts and stores exact fils unchanged', async () => {
  for (const amount of [7083.385, '7083.385', 0.001, 100.0001]) {
    await expectHttpsError(recordRent(`rent_sub_${String(amount).replace(/\W/g, '')}`, amount), 'invalid-argument');
  }
  assert.equal((await db.collection('payment_transactions').get()).size, 0, 'nothing may be stored for a sub-fils amount');
  await recordRent('rent_exact', 7083.38);
  assert.equal((await db.doc('payment_transactions/rent_exact').get()).data().amount, 7083.38);
  await recordRent('rent_exact_str', '7083.40');
  assert.equal((await db.doc('payment_transactions/rent_exact_str').get()).data().amount, 7083.4);
});

test('Tenant payment proof rejects sub-fils amounts', async () => {
  const body = Buffer.from('%PDF-1.4\n% tenant sub fils\n%%EOF');
  const receiptHash = crypto.createHash('sha256').update(body).digest('hex');
  const receiptPath = `receipts/${TENANT}/subfils_receipt.pdf`;
  await admin.storage().bucket().file(receiptPath).save(body, { resumable: false, metadata: { contentType: 'application/pdf', metadata: { tenantId: TENANT, receiptHash } } });
  await expectHttpsError(call(submitTenantPaymentProof, tenant, {
    submissionId: 'subfils', paymentMethod: 'CASH', amount: 7083.385, reference: 'CR-000451', period: '2026-10',
    receiptUrl: 'https://example.invalid/r', receiptPath, receiptHash,
  }), 'invalid-argument');
  assert.equal((await db.collection('payment_transactions').get()).size, 0);
});

test('Admin rent approval rejects a sub-fils confirmed amount instead of rounding it to a match', async () => {
  await recordRent('rent_confirm', 7083.38);
  await expectHttpsError(call(adminApprovePayment, finance, { paymentId: 'rent_confirm', amountReceived: 7083.375 }), 'invalid-argument');
  await expectHttpsError(call(adminApprovePayment, finance, { paymentId: 'rent_confirm', amountReceived: '7083.384' }), 'invalid-argument');
  assert.notEqual((await db.doc('payment_transactions/rent_confirm').get()).data().status, 'APPROVED');
  const approved = await call(adminApprovePayment, finance, { paymentId: 'rent_confirm', amountReceived: 7083.38 });
  assert.equal(approved.status, 'SUCCESS');
  assert.equal((await db.doc('payment_transactions/rent_confirm').get()).data().amountReceived, 7083.38);
});
