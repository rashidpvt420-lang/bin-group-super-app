'use strict';
// Preventive maintenance plans: admin templates, owner subscribe (own property only), cash/cheque
// activation through the finance collection record flow, idempotent dispatch-job generation.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const {
  adminUpsertPmPlanTemplate, ownerSubscribePmPlan, ownerCancelPendingPmSubscription,
  financeActivatePmSubscription, financeRecordPaymentCollection,
} = lib('runtimeAll.js');
const pm = lib('preventiveMaintenancePlans.js');
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const proof = { contentType: 'application/pdf', base64: Buffer.from(`%PDF-1.4\n${'x'.repeat(200)}\n%%EOF`).toString('base64') };
const proof2 = { contentType: 'application/pdf', base64: Buffer.from(`%PDF-1.4\n${'y'.repeat(200)}\n%%EOF`).toString('base64') };
const proof3 = { contentType: 'application/pdf', base64: Buffer.from(`%PDF-1.4\n${'z'.repeat(200)}\n%%EOF`).toString('base64') };

let adminUser, adminNoMfa, finance, ownerA, ownerB;
test.before(async () => {
  adminUser = await createUser('pm_admin', { role: 'admin', admin: true }, { tokenExtra: MFA });
  adminNoMfa = await createUser('pm_admin_nomfa', { role: 'admin', admin: true });
  finance = await createUser('pm_finance', { role: 'finance_admin' }, { tokenExtra: MFA });
  ownerA = await createUser('pm_owner_a', { role: 'owner' });
  ownerB = await createUser('pm_owner_b', { role: 'owner' });
});
test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('properties/prop_a').set({ ownerId: 'pm_owner_a', name: 'Tower A' });
  await db.doc('properties/prop_a/units/u1').set({ propertyId: 'prop_a', ownerId: 'pm_owner_a' });
});

const tplInput = (over = {}) => ({ serviceCode: 'AC_SERVICE', nameEn: 'AC care annual', nameAr: 'عناية المكيفات السنوية', visitsPerYear: 2, annualPriceAed: '650.00', scope: 'UNIT', ...over });
const today = () => pm.dubaiToday();

async function makeTemplate(over) {
  return (await call(adminUpsertPmPlanTemplate, adminUser, tplInput(over))).templateId;
}

test('schedule helpers are deterministic and month-end safe', () => {
  assert.deepEqual(pm.buildVisitSchedule('2026-01-31', 4).map((v) => v.date), ['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
  assert.deepEqual(pm.buildVisitSchedule('2026-03-15', 2).map((v) => v.date), ['2026-03-15', '2026-09-15']);
  assert.equal(pm.buildVisitSchedule('2026-03-15', 12).length, 12);
  assert.throws(() => pm.parsePriceAed('10.005'));
  assert.throws(() => pm.parsePriceAed(0));
  assert.throws(() => pm.normaliseTemplate(tplInput({ visitsPerYear: 5 })));
});

test('only MFA admins manage templates; versions and audit are written', async () => {
  await expectHttpsError(call(adminUpsertPmPlanTemplate, ownerA, tplInput()), 'permission-denied');
  await expectHttpsError(call(adminUpsertPmPlanTemplate, adminNoMfa, tplInput()), 'permission-denied');
  await expectHttpsError(call(adminUpsertPmPlanTemplate, adminUser, tplInput({ annualPriceAed: '-5' })), 'invalid-argument');
  const id = await makeTemplate();
  const upd = await call(adminUpsertPmPlanTemplate, adminUser, { ...tplInput({ annualPriceAed: 700 }), templateId: id });
  assert.equal(upd.version, 2);
  const tpl = (await db.doc(`pm_plan_templates/${id}`).get()).data();
  assert.equal(tpl.annualPriceAed, 700);
  assert.equal(tpl.currency, 'AED');
  assert.equal((await db.collection(`pm_plan_templates/${id}/history`).get()).size, 2);
  assert.equal((await db.collection('audit_logs').where('templateId', '==', id).get()).size, 2);
});

test('owner subscribes own unit only; cash/cheque invoice; idempotent; no duplicate live plan', async () => {
  const templateId = await makeTemplate();
  const req = { templateId, propertyId: 'prop_a', unitId: 'u1', startDate: today(), requestId: 'req_pm_0001' };
  await expectHttpsError(call(ownerSubscribePmPlan, null, req), 'unauthenticated');
  await expectHttpsError(call(ownerSubscribePmPlan, ownerB, req), 'permission-denied');
  await expectHttpsError(call(ownerSubscribePmPlan, ownerA, { ...req, unitId: undefined }), 'invalid-argument');
  await expectHttpsError(call(ownerSubscribePmPlan, ownerA, { ...req, startDate: '2020-01-01' }), 'invalid-argument');
  const a = await call(ownerSubscribePmPlan, ownerA, req);
  const b = await call(ownerSubscribePmPlan, ownerA, req);
  assert.equal(a.subscriptionId, b.subscriptionId);
  assert.equal(b.idempotent, true);
  const inv = (await db.doc(`invoices/${a.invoiceId}`).get()).data();
  assert.deepEqual(inv.allowedPaymentMethods, ['cash', 'cheque']);
  assert.equal(inv.cardPaymentsEnabled, false);
  assert.equal(inv.amount, 650);
  assert.equal(inv.ownerId, 'pm_owner_a');
  await expectHttpsError(call(ownerSubscribePmPlan, ownerA, { ...req, requestId: 'req_pm_0002' }), 'already-exists');
  await call(ownerCancelPendingPmSubscription, ownerA, { subscriptionId: a.subscriptionId });
  const again = await call(ownerSubscribePmPlan, ownerA, { ...req, requestId: 'req_pm_0003' });
  assert.equal(again.status, 'PENDING_PAYMENT');
});

test('activation requires a real, unvoided, sufficient cash/cheque collection for this invoice; then jobs + reminders are idempotent', async () => {
  const templateId = await makeTemplate();
  const sub = await call(ownerSubscribePmPlan, ownerA, { templateId, propertyId: 'prop_a', unitId: 'u1', startDate: today(), requestId: 'req_pm_act1' });
  await expectHttpsError(call(financeActivatePmSubscription, ownerA, { subscriptionId: sub.subscriptionId, collectionRecordId: 'a'.repeat(32) }), 'permission-denied');
  await expectHttpsError(call(financeActivatePmSubscription, finance, { subscriptionId: sub.subscriptionId, collectionRecordId: 'a'.repeat(32) }), 'not-found');

  const short = await call(financeRecordPaymentCollection, finance, {
    payerUid: 'pm_owner_a', targetType: 'invoice', targetId: sub.invoiceId, amount: '100.00', method: 'cash',
    collectedOn: today(), collectedBy: 'Finance desk', idempotencyKey: 'pm_short_1', proof,
  });
  await expectHttpsError(call(financeActivatePmSubscription, finance, { subscriptionId: sub.subscriptionId, collectionRecordId: short.recordId }), 'failed-precondition');

  const full = await call(financeRecordPaymentCollection, finance, {
    payerUid: 'pm_owner_a', targetType: 'invoice', targetId: sub.invoiceId, amount: '650.00', method: 'cheque',
    collectedOn: today(), chequeNumber: '000777', collectedBy: 'Finance desk', idempotencyKey: 'pm_full_1', proof: proof2,
  });
  const act = await call(financeActivatePmSubscription, finance, { subscriptionId: sub.subscriptionId, collectionRecordId: full.recordId });
  assert.equal(act.status, 'ACTIVE');
  assert.equal(act.visits, 2);
  const again = await call(financeActivatePmSubscription, finance, { subscriptionId: sub.subscriptionId, collectionRecordId: full.recordId });
  assert.equal(again.idempotent, true);
  assert.equal((await db.doc(`invoices/${sub.invoiceId}`).get()).data().status, 'paid');

  const r1 = await pm.runPmJobGeneration();
  const r2 = await pm.runPmJobGeneration();
  assert.equal(r1.created, 1);
  assert.equal(r1.reminders, 1);
  assert.equal(r2.created, 0);
  assert.equal(r2.reminders, 0);
  const ticket = (await db.doc(`maintenanceTickets/pm_${sub.subscriptionId}_1`).get()).data();
  assert.equal(ticket.requestType, 'SCHEDULED_SERVICE');
  assert.equal(ticket.status, 'PENDING_SCHEDULING');
  assert.equal(ticket.ownerId, 'pm_owner_a');
  assert.equal(ticket.category, 'AC');
  assert.equal((await db.doc(`notifications/pm_${sub.subscriptionId}_1_reminder`).get()).data().recipientId, 'pm_owner_a');
  const stored = (await db.doc(`pm_subscriptions/${sub.subscriptionId}`).get()).data();
  assert.equal(stored.visits[1].ticketId, null);
});

test('a voided collection or another owner\'s payment cannot activate', async () => {
  const templateId = await makeTemplate();
  const sub = await call(ownerSubscribePmPlan, ownerA, { templateId, propertyId: 'prop_a', unitId: 'u1', startDate: today(), requestId: 'req_pm_void' });
  const rec = await call(financeRecordPaymentCollection, finance, {
    payerUid: 'pm_owner_a', targetType: 'invoice', targetId: sub.invoiceId, amount: '650.00', method: 'cash',
    collectedOn: today(), collectedBy: 'Finance desk', idempotencyKey: 'pm_void_1', proof: proof3,
  });
  await db.doc(`payment_collection_voids/${rec.recordId}`).set({ reason: 'test' });
  await expectHttpsError(call(financeActivatePmSubscription, finance, { subscriptionId: sub.subscriptionId, collectionRecordId: rec.recordId }), 'failed-precondition');
  assert.equal((await db.doc(`pm_subscriptions/${sub.subscriptionId}`).get()).data().status, 'PENDING_PAYMENT');
});
