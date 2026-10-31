'use strict';
// PR D: finance-recorded cash/cheque collection records (immutable + void entry).
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { financeRecordPaymentCollection, financeVoidPaymentCollection } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const PAYER = 'prd_owner';
const proof = { contentType: 'application/pdf', base64: Buffer.from(`%PDF-1.4\n${'x'.repeat(200)}\n%%EOF`).toString('base64') };

let finance, financeNoMfa, owner;
test.before(async () => {
  finance = await createUser('prd_finance', { role: 'finance_admin' }, { tokenExtra: MFA });
  financeNoMfa = await createUser('prd_finance_nomfa', { role: 'finance_admin' });
  owner = await createUser(PAYER, { role: 'owner' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('contracts/c_prd').set({ ownerUid: PAYER, status: 'active' });
  await db.doc('invoices/i_prd').set({ payerId: 'someone_else' });
});

const base = (over = {}) => ({
  payerUid: PAYER, targetType: 'contract', targetId: 'c_prd', amount: '95306.00', method: 'cheque',
  collectedOn: '2026-05-20', chequeNumber: '000123', collectedBy: 'Finance desk', idempotencyKey: `k_${Math.random().toString(36).slice(2, 12)}`, proof, ...over,
});

test('finance admin with MFA records a cheque collection with proof and audit; contract untouched', async () => {
  const res = await call(financeRecordPaymentCollection, finance, base());
  const rec = (await db.doc(`payment_collection_records/${res.recordId}`).get()).data();
  assert.equal(rec.amount, 95306);
  assert.equal(rec.method, 'cheque');
  assert.equal(rec.displayStatus, 'Paid – collected by finance');
  assert.equal(rec.payerUid, PAYER);
  const [exists] = await admin.storage().bucket().file(rec.proofPath).exists();
  assert.equal(exists, true);
  assert.equal((await db.collection('payment_collection_audit').where('recordId', '==', res.recordId).get()).size, 1);
  assert.deepEqual((await db.doc('contracts/c_prd').get()).data(), { ownerUid: PAYER, status: 'active' });
});

test('idempotent retries do not double-record', async () => {
  const data = base();
  const a = await call(financeRecordPaymentCollection, finance, data);
  const b = await call(financeRecordPaymentCollection, finance, data);
  assert.equal(a.recordId, b.recordId);
  assert.equal(b.duplicate, true);
  assert.equal((await db.collection('payment_collection_records').get()).size, 1);
});

test('only MFA finance admins can record', async () => {
  await expectHttpsError(call(financeRecordPaymentCollection, null, base()), 'unauthenticated');
  await expectHttpsError(call(financeRecordPaymentCollection, owner, base()), 'permission-denied');
  await expectHttpsError(call(financeRecordPaymentCollection, financeNoMfa, base()), 'permission-denied');
});

test('rejects card, sub-fils, future dates, missing proof and unlinked payer', async () => {
  await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ method: 'card' })), 'invalid-argument');
  await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ amount: '10.005' })), 'invalid-argument');
  await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ amount: 0 })), 'invalid-argument');
  await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ collectedOn: '2999-01-01' })), 'invalid-argument');
  await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ proof: undefined })), 'invalid-argument');
  await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ targetType: 'invoice', targetId: 'i_prd' })), 'failed-precondition');
  await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ targetId: 'missing_contract' })), 'not-found');
});

test('void adds a separate entry with reason; the record itself is unchanged; void is once only', async () => {
  const { recordId } = await call(financeRecordPaymentCollection, finance, base());
  const before = (await db.doc(`payment_collection_records/${recordId}`).get()).data();
  await expectHttpsError(call(financeVoidPaymentCollection, finance, { recordId, reason: 'short' }), 'invalid-argument');
  await expectHttpsError(call(financeVoidPaymentCollection, owner, { recordId, reason: 'entered against wrong contract' }), 'permission-denied');
  await call(financeVoidPaymentCollection, finance, { recordId, reason: 'entered against wrong contract' });
  const v = (await db.doc(`payment_collection_voids/${recordId}`).get()).data();
  assert.equal(v.payerUid, PAYER);
  assert.deepEqual((await db.doc(`payment_collection_records/${recordId}`).get()).data(), before);
  await expectHttpsError(call(financeVoidPaymentCollection, finance, { recordId, reason: 'entered against wrong contract' }), 'already-exists');
});

test('same cheque number for the same payer is refused under a new key and raises a fraud alert', async () => {
  await call(financeRecordPaymentCollection, finance, base({ chequeNumber: '000777' }));
  const otherProof = { contentType: 'application/pdf', base64: Buffer.from(`%PDF-1.4\n${'y'.repeat(200)}\n%%EOF`).toString('base64') };
  const err = await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ chequeNumber: '7 77', proof: otherProof })), 'already-exists');
  assert.match(err.message, /duplicate/i);
  assert.match(err.message, /تكرار/);
  assert.equal((await db.collection('payment_collection_records').get()).size, 1);
  const alerts = await db.collection('finance_fraud_alerts').get();
  assert.equal(alerts.size, 1);
  assert.equal(alerts.docs[0].data().type, 'DUPLICATE_PAYMENT_COLLECTION');
  assert.equal(alerts.docs[0].data().claimKind, 'cheque');
});

test('the same proof file cannot back two cash records', async () => {
  await call(financeRecordPaymentCollection, finance, base({ method: 'cash', chequeNumber: '' }));
  await expectHttpsError(call(financeRecordPaymentCollection, finance, base({ method: 'cash', chequeNumber: '', amount: '100.00' })), 'already-exists');
  assert.equal((await db.collection('payment_collection_records').get()).size, 1);
  assert.equal((await db.collection('finance_fraud_alerts').get()).docs[0].data().claimKind, 'proof');
});

test('voiding releases the duplicate claims so a corrected entry can be recorded', async () => {
  const { recordId } = await call(financeRecordPaymentCollection, finance, base({ chequeNumber: '000888' }));
  await call(financeVoidPaymentCollection, finance, { recordId, reason: 'entered against wrong contract' });
  const again = await call(financeRecordPaymentCollection, finance, base({ chequeNumber: '000888' }));
  assert.notEqual(again.recordId, recordId);
  assert.equal((await db.collection('finance_fraud_alerts').get()).size, 0);
});
