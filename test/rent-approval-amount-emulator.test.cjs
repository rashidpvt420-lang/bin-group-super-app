'use strict';

const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const test = require('node:test');
const admin = require('firebase-admin');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('Firestore emulator host is required.');
}
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error('Auth emulator host is required.');
}

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: 'bin-group-57c60',
    storageBucket: 'bin-group-57c60.appspot.com',
  });
}

const { adminApprovePayment } = require('../functions/lib/paymentTransactionApproval');

const OWNER = 'owner_rent_fils';
const PAYMENT = 'rent_fils_exact';
const HASH = createHash('sha256').update('rent-receipt-fixture').digest('hex');
const PATH = `payment-references/owners/${OWNER}/${PAYMENT}/receipt.pdf`;

async function seedPayment(amount) {
  await admin.firestore().collection('payment_transactions').doc(PAYMENT).set({
    recordType: 'OWNER_RENT_PAYMENT',
    transactionType: 'RENT_COLLECTION',
    status: 'PAID',
    paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    paymentVerified: false,
    approved: false,
    amount,
    amountPaid: amount,
    rentPaid: amount,
    reference: 'CASH-1234',
    paymentReference: 'CASH-1234',
    receiptPath: PATH,
    referenceFilePath: PATH,
    referenceFileHash: HASH,
    ownerUid: OWNER,
    ownerId: OWNER,
    tenantName: 'Amina',
    propertyId: 'property_1',
  });
}

async function seedReceipt() {
  await admin.storage().bucket().file(PATH).save(Buffer.from('%PDF-1.4 rent receipt'), {
    contentType: 'application/pdf',
    metadata: {
      metadata: {
        ownerUid: OWNER,
        paymentId: PAYMENT,
        evidenceType: 'owner_payment_receipt',
        receiptHash: HASH,
      },
    },
  });
}

function call(amountReceived) {
  return adminApprovePayment.run({
    auth: {
      uid: 'admin_rent_fils',
      token: { role: 'admin', email: 'admin@example.test' },
    },
    data: { paymentId: PAYMENT, amountReceived },
  });
}

test('emulator callable approves an exact fils match and rejects 0.01 and larger differences', async () => {
  await admin.auth().createUser({
    uid: 'admin_rent_fils',
    email: 'admin@example.test',
    emailVerified: true,
  });
  await seedReceipt();
  await seedPayment(1234.5);

  await assert.rejects(call(1234.51), (error) => {
    assert.equal(error.code, 'failed-precondition');
    assert.match(error.message, /cannot alter/);
    return true;
  });
  await assert.rejects(call(2000), (error) => {
    assert.equal(error.code, 'failed-precondition');
    assert.match(error.message, /cannot alter/);
    return true;
  });

  const approved = await call('1234.50');
  assert.equal(approved.status, 'SUCCESS');
  assert.equal(approved.idempotent, false);
  const saved = await admin.firestore().collection('payment_transactions').doc(PAYMENT).get();
  assert.equal(saved.data().paymentVerified, true);
  assert.equal(saved.data().amountReceived, 1234.5);
});
