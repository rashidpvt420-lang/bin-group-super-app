'use strict';
// Monthly owner performance report: own data only, real numbers, empty states, registry hash, EN/AR PDF.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { generateMyOwnerPerformanceReport, verifyIssuedDocument } = lib('runtimeAll.js');
const { loadOwnerReportData } = lib('ownerPerformanceReport.js');
const { parseReportMonth, occupancyOf } = lib('ownerPerformanceReportCore.js');

const OWNER = 'rpt_owner_a';
const OTHER = 'rpt_owner_b';
const TENANT = 'rpt_tenant_a';
let owner; let other; let tenant;

test.before(async () => {
  owner = await createUser(OWNER, { role: 'owner' }, { displayName: 'Owner Alpha' });
  other = await createUser(OTHER, { role: 'owner' }, { displayName: 'Owner Beta' });
  tenant = await createUser(TENANT, { role: 'tenant' });
});

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('properties/rp_a').set({ ownerId: OWNER, name: 'Alpha Tower' });
  await db.doc('properties/rp_b').set({ ownerId: OTHER, name: 'Beta Villa' });
  await db.doc('units/ru_a1').set({ ownerId: OWNER, propertyId: 'rp_a', occupancyStatus: 'OCCUPIED', tenantId: TENANT });
  await db.doc('units/ru_a2').set({ ownerId: OWNER, propertyId: 'rp_a', occupancyStatus: 'VACANT' });
  await db.doc('units/ru_a3').set({ propertyId: 'rp_a' }); // status not recorded
  await db.doc('units/ru_b1').set({ ownerId: OTHER, propertyId: 'rp_b', occupancyStatus: 'OCCUPIED' });
  // A unit pointing at A's property but naming B as owner must not leak in.
  await db.doc('units/ru_spoof').set({ ownerId: OTHER, propertyId: 'rp_a', occupancyStatus: 'OCCUPIED' });
  // Money (September 2026).
  await db.doc('payment_transactions/rpt_pt_a1').set({ ownerId: OWNER, tenantId: TENANT, payerId: TENANT, amount: 4200, status: 'paid', paidAt: '2026-09-05', description: 'Rent September' });
  await db.doc('payment_transactions/rpt_pt_a_old').set({ ownerId: OWNER, payerId: TENANT, amount: 777, status: 'paid', paidAt: '2026-08-05' });
  await db.doc('payment_collection_records/rpt_pc_a1').set({ payerUid: OWNER, amount: 350, method: 'cash', collectedOn: '2026-09-10', status: 'collected' });
  await db.doc('payment_collection_records/rpt_pc_a2').set({ payerUid: OWNER, amount: 999, method: 'cheque', collectedOn: '2026-09-11', status: 'collected' });
  await db.doc('payment_collection_voids/rpt_pc_a2').set({ recordId: 'rpt_pc_a2', payerUid: OWNER, reason: 'bounced' });
  await db.doc('payment_transactions/rpt_pt_b1').set({ ownerId: OTHER, payerId: 'x', amount: 515151, status: 'paid', paidAt: '2026-09-06' });
  // Repairs.
  await db.doc('maintenanceTickets/rt_a1').set({ propertyId: 'rp_a', ownerId: OWNER, title: 'AC leak', status: 'COMPLETED', createdAt: '2026-09-02T08:00:00+04:00', completedAt: '2026-09-04T12:00:00+04:00', finalCost: 250 });
  await db.doc('maintenanceTickets/rt_a2').set({ propertyId: 'rp_a', title: 'Door lock', status: 'OPEN', createdAt: '2026-09-20T08:00:00+04:00', estimatedCost: 900 });
  await db.doc('maintenanceTickets/rt_a3').set({ propertyId: 'rp_a', title: 'Paint', status: 'COMPLETED', createdAt: '2026-09-21T08:00:00+04:00', completedAt: '2026-09-22T08:00:00+04:00' });
  await db.doc('maintenanceTickets/rt_b1').set({ propertyId: 'rp_b', ownerId: OTHER, title: 'Secret B', status: 'COMPLETED', completedAt: '2026-09-04T12:00:00+04:00', finalCost: 616161 });
});

test('requires a signed-in active owner', async () => {
  await expectHttpsError(call(generateMyOwnerPerformanceReport, null, { month: '2026-09' }), 'unauthenticated');
  await expectHttpsError(call(generateMyOwnerPerformanceReport, tenant, { month: '2026-09' }), 'permission-denied');
});

test('loader returns only the owner\'s own records', async () => {
  const data = await loadOwnerReportData(OWNER);
  const ids = JSON.stringify(data);
  assert.doesNotMatch(ids, /rpt_pt_b1|515151|ru_b1|ru_spoof|rt_b1|616161/);
  assert.deepEqual(data.units.map((u) => u.id).sort(), ['ru_a1', 'ru_a2', 'ru_a3']);
  assert.equal(data.propertyCount, 1);
});

test('report summary uses only real recorded values and ignores requested foreign uids', async () => {
  const res = await call(generateMyOwnerPerformanceReport, owner, { month: '2026-09', uid: OTHER, ownerId: OTHER });
  const s = res.summary;
  assert.equal(s.income, 4200);
  assert.equal(s.costs, 350); // voided cheque excluded
  assert.equal(s.net, 3850);
  assert.deepEqual({ ...s.occupancy }, { total: 3, occupied: 1, vacant: 1, unknown: 1, ratePct: 50 });
  assert.equal(s.repairs.opened, 3);
  assert.equal(s.repairs.completed, 2);
  assert.equal(s.repairs.open, 1);
  assert.equal(s.repairs.recordedCostTotal, 250); // estimate (900) and missing cost not invented
  const b = await call(generateMyOwnerPerformanceReport, other, { month: '2026-09' });
  assert.equal(b.summary.income, 515151);
  assert.equal(b.summary.repairs.recordedCostTotal, 616161);
});

test('PDF is registered, QR-verifiable and Arabic renders with Cairo', async () => {
  for (const language of ['en', 'ar']) {
    const res = await call(generateMyOwnerPerformanceReport, owner, { month: '2026-09', language });
    assert.match(res.documentId, /^rpt_[a-f0-9]{32}$/);
    const pdf = Buffer.from(res.base64, 'base64');
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.match(pdf.toString('latin1'), /Cairo/);
    const sha = crypto.createHash('sha256').update(pdf).digest('hex');
    assert.equal(res.sha256, sha);
    const reg = (await db.doc(`issued_document_registry/${res.documentId}`).get()).data();
    assert.equal(reg.documentType, 'owner_performance_report');
    assert.equal(reg.subjectUid, OWNER);
    assert.equal(reg.periodFrom, '2026-09-01');
    assert.equal(reg.periodTo, '2026-09-30');
    const ok = await call(verifyIssuedDocument, null, { documentId: res.documentId, sha256: sha });
    assert.equal(ok.found, true);
    assert.equal(ok.hashMatches, true);
    assert.equal(ok.documentType, 'Monthly owner performance report');
    assert.equal(JSON.stringify(ok).includes(OWNER), false);
  }
});

test('empty month gives a real empty report, not invented numbers', async () => {
  const res = await call(generateMyOwnerPerformanceReport, owner, { month: '2026-06' });
  assert.equal(res.summary.income, 0);
  assert.equal(res.summary.costs, 0);
  assert.equal(res.summary.repairs.opened, 0);
  assert.equal(res.summary.repairs.recordedCostTotal, 0);
  const fresh = await createUser('rpt_owner_empty', { role: 'owner' });
  const e = await call(generateMyOwnerPerformanceReport, fresh, { month: '2026-09' });
  assert.equal(e.summary.hasAnyData, false);
  assert.equal(e.summary.occupancy.total, 0);
  assert.equal(e.summary.occupancy.ratePct, null);
});

test('rejects bad months and enforces the daily quota', async () => {
  await expectHttpsError(call(generateMyOwnerPerformanceReport, owner, { month: '2026-13' }), 'invalid-argument');
  await expectHttpsError(call(generateMyOwnerPerformanceReport, owner, { month: '2099-01' }), 'invalid-argument');
  await db.doc(`owner_report_rate_limits/${OWNER}`).set({ day: new Date().toISOString().slice(0, 10), count: 10 });
  await expectHttpsError(call(generateMyOwnerPerformanceReport, owner, { month: '2026-09' }), 'resource-exhausted');
});

test('pure helpers', () => {
  const r = parseReportMonth('2026-02', new Date('2026-10-01'));
  assert.equal(r.to, '2026-02-28');
  assert.throws(() => parseReportMonth('2026-9'));
  assert.equal(occupancyOf([]).ratePct, null);
});
