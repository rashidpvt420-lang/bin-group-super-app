'use strict';
// N-24 regression: tenant payment proof could reuse one receipt file for several payments
// (new submissionId each time), and the stored receiptUrl was whatever https URL the client sent.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { submitTenantPaymentProof } = lib('paymentEvidence.js');
const RECEIPT_BYTES = Buffer.from('%PDF-1.4\n% N-24 receipt fixture\n');
const RECEIPT_HASH = crypto.createHash('sha256').update(RECEIPT_BYTES).digest('hex');
const TOKEN = 'n24-download-token';

let tenant;
test.before(async () => {
  tenant = await createUser('tenant_n24', { role: 'tenant' }, { email: 'tenant-n24@example.invalid' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('users/tenant_n24').set({ uid: 'tenant_n24', role: 'tenant', status: 'active', propertyId: 'prop_n24', unitId: 'unit_n24', displayName: 'Tenant N24' });
  await db.doc('units/unit_n24').set({ propertyId: 'prop_n24', tenantUid: 'tenant_n24', ownerId: 'owner_n24' });
});

async function uploadReceipt(path) {
  await admin.storage().bucket().file(path).save(RECEIPT_BYTES, {
    resumable: false,
    metadata: {
      contentType: 'application/pdf',
      metadata: { tenantId: 'tenant_n24', evidenceType: 'tenant_payment_receipt', receiptHash: RECEIPT_HASH, firebaseStorageDownloadTokens: TOKEN },
    },
  });
}

function payload(submissionId, receiptPath, overrides = {}) {
  return {
    submissionId,
    amount: 5000,
    reference: `REF-${submissionId}`,
    bankName: 'Bank',
    period: submissionId,
    receiptUrl: `https://firebasestorage.googleapis.com/v0/b/x/o/${encodeURIComponent(receiptPath)}?alt=media&token=${TOKEN}`,
    receiptPath,
    receiptHash: RECEIPT_HASH,
    ...overrides,
  };
}

test('the same receipt cannot be resubmitted under a new submissionId for another period', async () => {
  await uploadReceipt('receipts/tenant_n24/sub_oct_receipt.pdf');
  await uploadReceipt('receipts/tenant_n24/sub_nov_receipt.pdf');
  const first = await call(submitTenantPaymentProof, tenant, payload('sub_oct', 'receipts/tenant_n24/sub_oct_receipt.pdf'));
  assert.equal(first.ok, true);
  const error = await expectHttpsError(
    call(submitTenantPaymentProof, tenant, payload('sub_nov', 'receipts/tenant_n24/sub_nov_receipt.pdf')),
    'already-exists',
  );
  assert.match(error.message, /already submitted/i);
  assert.equal((await db.doc('payment_transactions/tenant_tenant_n24_sub_nov').get()).exists, false);
});

test('a retry of the same submission stays idempotent', async () => {
  await uploadReceipt('receipts/tenant_n24/sub_retry_receipt.pdf');
  const data = payload('sub_retry', 'receipts/tenant_n24/sub_retry_receipt.pdf');
  assert.equal((await call(submitTenantPaymentProof, tenant, data)).idempotent, false);
  assert.equal((await call(submitTenantPaymentProof, tenant, data)).idempotent, true);
});

test('the stored receiptUrl is derived from the verified Storage object, not the client URL', async () => {
  await uploadReceipt('receipts/tenant_n24/sub_url_receipt.pdf');
  await call(submitTenantPaymentProof, tenant, payload('sub_url', 'receipts/tenant_n24/sub_url_receipt.pdf', {
    receiptUrl: 'https://attacker.example/fake-receipt.pdf',
  }));
  const stored = (await db.doc('payment_transactions/tenant_tenant_n24_sub_url').get()).data();
  assert.notEqual(stored.receiptUrl, 'https://attacker.example/fake-receipt.pdf');
  const bucket = admin.storage().bucket().name;
  assert.equal(
    stored.receiptUrl,
    `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent('receipts/tenant_n24/sub_url_receipt.pdf')}?alt=media&token=${TOKEN}`,
  );
  assert.equal(stored.receiptUrlSource, 'SERVER_DERIVED_FROM_RECEIPT_PATH');
});
