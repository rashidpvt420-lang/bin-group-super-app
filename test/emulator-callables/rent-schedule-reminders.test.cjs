'use strict';
// Feature 1 (owner/tenant deep audit 2026-10-21 §4): rent schedule, due reminders, tenant
// notification on the admin decision, installment settlement and an issued receipt.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const { ownerSetRentSchedule, onRentPaymentDecision, submitTenantPaymentProof } = runtime;
const rent = lib('rentSchedule.js');

const OWNER = 'owner_rent_sched';
const OTHER_OWNER = 'owner_rent_other';
const TENANT = 'tenant_rent_sched';
const PROPERTY = 'property_rent_sched';
const UNIT = 'unit_rent_sched_1';
const owner = { uid: OWNER, token: { role: 'owner', email: 'o@example.invalid', email_verified: true } };
const other = { uid: OTHER_OWNER, token: { role: 'owner', email: 'x@example.invalid', email_verified: true } };
const tenant = { uid: TENANT, token: { role: 'tenant', email: 'tenant.sched@example.invalid', email_verified: true } };

test.before(async () => { await createUser(TENANT, { role: 'tenant' }, { email: tenant.token.email }); });
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc(`properties/${PROPERTY}`).set({ ownerId: OWNER, name: 'Tower A' });
  await db.doc(`units/${UNIT}`).set({ propertyId: PROPERTY, unitNumber: '101', tenantUid: TENANT, tenantId: TENANT, tenantEmail: tenant.token.email, ownerId: OWNER });
  await db.doc(`users/${TENANT}`).set({ uid: TENANT, role: 'tenant', status: 'active', propertyId: PROPERTY, unitId: UNIT, displayName: 'Sched Tenant' });
});

test('pure helpers: reminder keys, Dubai dates and planning', () => {
  assert.equal(rent.reminderKeyFor(7), '7d');
  assert.equal(rent.reminderKeyFor(1), '1d');
  assert.equal(rent.reminderKeyFor(0), '0d');
  assert.equal(rent.reminderKeyFor(-1), 'overdue_1d');
  assert.equal(rent.reminderKeyFor(3), null);
  // 2026-10-21 21:30 UTC is already 2026-10-22 in Dubai.
  assert.equal(rent.dubaiDateString(new Date('2026-10-21T21:30:00Z')), '2026-10-22');
  assert.deepEqual(rent.planReminder({ status: 'DUE', dueDate: '2026-10-28', remindersSent: {} }, '2026-10-21'), { key: '7d', days: 7, markOverdue: false });
  assert.equal(rent.planReminder({ status: 'DUE', dueDate: '2026-10-28', remindersSent: { '7d': true } }, '2026-10-21'), null);
  assert.equal(rent.planReminder({ status: 'PAID', dueDate: '2026-10-22' }, '2026-10-21'), null);
  assert.deepEqual(rent.planReminder({ status: 'DUE', dueDate: '2026-10-19', remindersSent: {} }, '2026-10-21'), { key: '', days: -2, markOverdue: true });
});

test('only the property owner can set a schedule; amounts must be exact fils', async () => {
  await expectHttpsError(call(ownerSetRentSchedule, other, { unitId: UNIT, installments: [{ dueDate: '2026-11-01', amount: 5000 }] }), 'permission-denied');
  await expectHttpsError(call(ownerSetRentSchedule, tenant, { unitId: UNIT, installments: [{ dueDate: '2026-11-01', amount: 5000 }] }), 'permission-denied');
  await expectHttpsError(call(ownerSetRentSchedule, owner, { unitId: UNIT, installments: [{ dueDate: '2026-11-01', amount: 5000.005 }] }), 'invalid-argument');
  await expectHttpsError(call(ownerSetRentSchedule, owner, { unitId: UNIT, installments: [{ dueDate: '01/11/2026', amount: 5000 }] }), 'invalid-argument');
  const r = await call(ownerSetRentSchedule, owner, { unitId: UNIT, installments: [{ dueDate: '2099-02-01', amount: 6000, chequeNumber: '000102' }, { dueDate: '2099-01-01', amount: 6000, chequeNumber: '000101' }] });
  assert.equal(r.installments, 2);
  const docs = (await db.collection('rent_installments').where('tenantUid', '==', TENANT).get()).docs.map((d) => d.data()).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  assert.deepEqual(docs.map((d) => [d.dueDate, d.amount, d.chequeNumber, d.status, d.ownerId]), [['2099-01-01', 6000, '000101', 'DUE', OWNER], ['2099-02-01', 6000, '000102', 'DUE', OWNER]]);
});

test('reminder run sends one 7-day reminder (idempotent) and marks past-due installments overdue', async () => {
  await db.doc('rent_installments/i_due').set({ tenantUid: TENANT, tenantEmail: tenant.token.email, unitId: UNIT, propertyId: PROPERTY, ownerId: OWNER, dueDate: '2026-10-28', amount: 5000, status: 'DUE', remindersSent: {} });
  await db.doc('rent_installments/i_late').set({ tenantUid: TENANT, unitId: UNIT, propertyId: PROPERTY, ownerId: OWNER, dueDate: '2026-10-20', amount: 5000, status: 'DUE', remindersSent: {} });
  const now = new Date('2026-10-21T06:00:00Z');
  const first = await rent.runRentReminders(now);
  assert.equal(first.sent, 2); // 7d + overdue_1d
  const second = await rent.runRentReminders(now);
  assert.equal(second.sent, 0);
  assert.equal((await db.doc('rent_installments/i_late').get()).data().status, 'OVERDUE');
  const n = await db.doc('notifications/RENT_DUE_REMINDER_i_due_7d').get();
  assert.equal(n.data().userId, TENANT);
  assert.match(n.data().title, /Rent due in 7 days/);
  assert.ok((await db.doc('mail/RENT_DUE_REMINDER_i_due_7d').get()).exists);
});

async function decide(paymentId, before, after) {
  await onRentPaymentDecision.run({ data: { before: { data: () => before }, after: { data: () => after } }, params: { paymentId } });
}

test('admin approval notifies the tenant, settles the linked installment and records a receipt', async () => {
  await db.doc('rent_installments/i1').set({ tenantUid: TENANT, unitId: UNIT, dueDate: '2099-01-01', amount: 5000, status: 'PENDING_VERIFICATION' });
  const base = { recordType: 'TENANT_RENT_PAYMENT_PROOF', tenantUid: TENANT, tenantEmail: tenant.token.email, ownerId: OWNER, propertyId: PROPERTY, unitId: UNIT, amount: 5000, paymentMethod: 'CASH', reference: 'CR-1', installmentId: 'i1' };
  await decide('p1', { ...base, status: 'PENDING_ADMIN_PAYMENT_VERIFICATION' }, { ...base, status: 'APPROVED', amountReceived: 5000 });
  const inst = (await db.doc('rent_installments/i1').get()).data();
  assert.equal(inst.status, 'PAID');
  assert.equal(inst.paymentId, 'p1');
  assert.match(inst.receiptNumber, /^BIN-RR-[0-9A-F]{10}$/);
  const receipt = (await db.doc('rent_receipts/p1').get()).data();
  assert.equal(receipt.tenantUid, TENANT);
  assert.equal(receipt.amount, 5000);
  const n = (await db.doc('notifications/RENT_PAYMENT_VERIFIED_p1_approved').get()).data();
  assert.equal(n.userId, TENANT);
});

test('admin rejection notifies the tenant and reopens the installment', async () => {
  await db.doc('rent_installments/i2').set({ tenantUid: TENANT, unitId: UNIT, dueDate: '2099-01-01', amount: 5000, status: 'PENDING_VERIFICATION', paymentId: 'p2' });
  const base = { recordType: 'TENANT_RENT_PAYMENT_PROOF', tenantUid: TENANT, unitId: UNIT, amount: 5000, installmentId: 'i2' };
  await decide('p2', { ...base, status: 'PENDING_ADMIN_PAYMENT_VERIFICATION' }, { ...base, status: 'REJECTED', rejectionReason: 'Blurry receipt' });
  assert.equal((await db.doc('rent_installments/i2').get()).data().status, 'DUE');
  const n = (await db.doc('notifications/RENT_PAYMENT_REJECTED_p2_rejected').get()).data();
  assert.match(n.body, /Blurry receipt/);
  assert.equal((await db.doc('rent_receipts/p2').get()).exists, false);
});

test('tenant proof can link only their own open installment, which becomes PENDING_VERIFICATION', async () => {
  await db.doc('rent_installments/mine').set({ tenantUid: TENANT, unitId: UNIT, dueDate: '2099-01-01', amount: 5000, status: 'DUE' });
  await db.doc('rent_installments/theirs').set({ tenantUid: 'someone_else', unitId: 'u2', dueDate: '2099-01-01', amount: 5000, status: 'DUE' });
  const store = async (id) => {
    const body = Buffer.from(`%PDF-1.4\n% ${id}\n%%EOF`);
    const receiptHash = crypto.createHash('sha256').update(body).digest('hex');
    const receiptPath = `receipts/${TENANT}/${id}.pdf`;
    await admin.storage().bucket().file(receiptPath).save(body, { resumable: false, metadata: { contentType: 'application/pdf', metadata: { tenantId: TENANT, evidenceType: 'tenant_payment_receipt', receiptHash } } });
    return { receiptPath, receiptHash, receiptUrl: 'https://example.invalid/r' };
  };
  await expectHttpsError(call(submitTenantPaymentProof, tenant, { submissionId: 's_theirs', paymentMethod: 'CASH', amount: 5000, reference: 'CR-9001', installmentId: 'theirs', ...(await store('t')) }), 'permission-denied');
  const ok = await call(submitTenantPaymentProof, tenant, { submissionId: 's_mine', paymentMethod: 'CASH', amount: 5000, reference: 'CR-9002', installmentId: 'mine', ...(await store('m')) });
  assert.equal((await db.doc(`payment_transactions/${ok.paymentId}`).get()).data().installmentId, 'mine');
  assert.equal((await db.doc('rent_installments/mine').get()).data().status, 'PENDING_VERIFICATION');
});
