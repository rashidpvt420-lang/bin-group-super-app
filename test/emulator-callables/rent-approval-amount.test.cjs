'use strict';
// Owner rent approval through the LIVE callable (runtime adminApprovePayment =
// functions/securePaymentApproval.ts, which gates and then runs paymentTransactionApproval).
// Replaces test/rent-approval-amount-emulator.test.cjs, which was not in any suite, initialised
// the Admin SDK for the production project id (bin-group-57c60) and called the legacy
// paymentTransactionApproval handler directly, bypassing the MFA and Cash/Cheque gates.
const { createHash } = require('node:crypto');
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminApprovePayment } = lib('runtimeAll.js');

const OWNER = 'owner_rent_fils';
const PAYMENT = 'rent_fils_exact';
const HASH = createHash('sha256').update('rent-receipt-fixture').digest('hex');
const PATH = `payment-references/owners/${OWNER}/${PAYMENT}/receipt.pdf`;
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };

let financeAdmin;
let adminWithoutMfa;
test.before(async () => {
  financeAdmin = await createUser('admin_rent_fils', { role: 'admin' }, { tokenExtra: MFA });
  adminWithoutMfa = await createUser('admin_rent_no_mfa', { role: 'admin' });
});
test.beforeEach(clearFirestore);

async function seedPayment(amount, overrides = {}) {
  await db.collection('payment_transactions').doc(PAYMENT).set({
    recordType: 'OWNER_RENT_PAYMENT',
    transactionType: 'RENT_COLLECTION',
    status: 'PAID',
    paymentStatus: 'PENDING_ADMIN_PAYMENT_VERIFICATION',
    paymentVerified: false,
    approved: false,
    paymentMethod: 'CASH',
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
    ...overrides,
  });
}

async function seedReceipt() {
  await admin.storage().bucket().file(PATH).save(Buffer.from('%PDF-1.4 rent receipt'), {
    contentType: 'application/pdf',
    metadata: { metadata: { ownerUid: OWNER, paymentId: PAYMENT, evidenceType: 'owner_payment_receipt', receiptHash: HASH } },
  });
}

const approve = (actor, amountReceived) => call(adminApprovePayment, actor, { paymentId: PAYMENT, amountReceived });

test('live approval accepts an exact fils match and rejects 0.01 and larger differences', async () => {
  await seedReceipt();
  await seedPayment(1234.5);

  for (const wrong of [1234.51, 2000]) {
    const error = await expectHttpsError(approve(financeAdmin, wrong), 'failed-precondition');
    assert.match(error.message, /cannot alter/);
  }
  assert.equal((await db.doc(`payment_transactions/${PAYMENT}`).get()).data().paymentVerified, false);

  const approved = await approve(financeAdmin, '1234.50');
  assert.equal(approved.status, 'SUCCESS');
  assert.equal(approved.idempotent, false);
  const saved = (await db.doc(`payment_transactions/${PAYMENT}`).get()).data();
  assert.equal(saved.paymentVerified, true);
  assert.equal(saved.amountReceived, 1234.5);
});

test('live approval requires an Admin MFA session', async () => {
  await seedReceipt();
  await seedPayment(1234.5);
  const error = await expectHttpsError(approve(adminWithoutMfa, 1234.5), 'permission-denied');
  assert.match(error.message, /MFA/);
  assert.equal((await db.doc(`payment_transactions/${PAYMENT}`).get()).data().paymentVerified, false);
});

test('live approval refuses a rent payment that is not recorded as Cash or Cheque', async () => {
  await seedReceipt();
  await seedPayment(1234.5, { paymentMethod: 'BANK_TRANSFER' });
  const error = await expectHttpsError(approve(financeAdmin, 1234.5), 'failed-precondition');
  assert.match(error.message, /Cash or Cheque/);
  assert.equal((await db.doc(`payment_transactions/${PAYMENT}`).get()).data().paymentVerified, false);
});
