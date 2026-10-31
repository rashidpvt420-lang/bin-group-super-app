'use strict';
// PDC register: finance+MFA records bank outcomes with valid transitions; owners see only their cheques; rent untouched.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { financeRecordPdcStatus, getPdcRegister } = lib('runtimeAll.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
let finance, financeNoMfa, owner, other;
test.before(async () => {
  finance = await createUser('pdc_fin', { role: 'finance_admin' }, { tokenExtra: MFA });
  financeNoMfa = await createUser('pdc_fin_nomfa', { role: 'finance_admin' });
  owner = await createUser('pdc_owner', { role: 'owner' });
  other = await createUser('pdc_other', { role: 'owner' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('rent_installments/L_01').set({ ownerId: 'pdc_owner', propertyId: 'p1', dueDate: '2000-01-01', amount: 25000, chequeNumber: '004455', status: 'DUE' });
  await db.doc('rent_installments/L_02').set({ ownerId: 'pdc_owner', propertyId: 'p1', dueDate: '2000-02-01', amount: 25000, status: 'DUE' });
  await db.doc('rent_installments/X_01').set({ ownerId: 'pdc_other', propertyId: 'p9', dueDate: '2000-01-01', amount: 1, chequeNumber: '9', status: 'DUE' });
});

test('deposit then bounce: history, audit, bilingual owner notice; installment unchanged', async () => {
  await call(financeRecordPdcStatus, finance, { installmentId: 'L_01', status: 'DEPOSITED' });
  await call(financeRecordPdcStatus, finance, { installmentId: 'L_01', status: 'BOUNCED', bounceReason: 'Insufficient funds' });
  const p = (await db.doc('pdc_cheques/L_01').get()).data();
  assert.equal(p.status, 'BOUNCED');
  assert.equal(p.bounceCount, 1);
  assert.equal(p.history.length, 2);
  assert.equal((await db.collection('audit_logs').where('action', '==', 'PDC_STATUS_RECORDED').get()).size, 2);
  const n = (await db.collection('notifications').where('type', '==', 'PDC_BOUNCED').get()).docs[0].data();
  assert.equal(n.userId, 'pdc_owner');
  assert.ok(n.titleAr && n.bodyAr);
  assert.equal((await db.doc('rent_installments/L_01').get()).data().status, 'DUE');
});

test('invalid transitions, missing reason, no cheque and no MFA are refused', async () => {
  await expectHttpsError(call(financeRecordPdcStatus, finance, { installmentId: 'L_01', status: 'CLEARED' }), 'failed-precondition');
  await expectHttpsError(call(financeRecordPdcStatus, finance, { installmentId: 'L_01', status: 'BOUNCED' }), 'invalid-argument');
  await expectHttpsError(call(financeRecordPdcStatus, finance, { installmentId: 'L_02', status: 'DEPOSITED' }), 'failed-precondition');
  await expectHttpsError(call(financeRecordPdcStatus, financeNoMfa, { installmentId: 'L_01', status: 'DEPOSITED' }), 'permission-denied');
  await expectHttpsError(call(financeRecordPdcStatus, owner, { installmentId: 'L_01', status: 'DEPOSITED' }), 'permission-denied');
});

test('owner register lists only own cheques with maturity and status', async () => {
  const r = await call(getPdcRegister, owner, {});
  assert.deepEqual(r.cheques.map((c) => c.installmentId), ['L_01']);
  assert.equal(r.cheques[0].chequeStatus, 'PENDING');
  assert.equal(r.cheques[0].maturity, 'PAST_DUE');
  const o = await call(getPdcRegister, other, {});
  assert.deepEqual(o.cheques.map((c) => c.installmentId), ['X_01']);
});
