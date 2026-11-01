'use strict';
// Contractor verification: BIN vendors only, own-job numbers, badges only when earned, idempotent expiry alerts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { getOwnerVendorScorecards } = lib('runtimeAll.js');
const vv = lib('ownerVendorVerification.js');
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
let owner, tenant;
test.before(async () => {
  owner = await createUser('ovv_owner', { role: 'owner' });
  tenant = await createUser('ovv_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('pure: credential states and earned-only badges', () => {
  const today = '2026-11-01';
  assert.equal(vv.credentialState('2026-10-31', today).state, 'EXPIRED');
  assert.equal(vv.credentialState('2026-11-20', today).state, 'EXPIRING');
  assert.equal(vv.credentialState('2027-06-01', today).state, 'VALID');
  assert.equal(vv.credentialState(undefined, today).state, 'UNKNOWN');
  const few = vv.scorecard({ jobs: 4, reworked: 0, quotedTotalAed: 400, responseHours: [1, 1, 1, 1] });
  assert.equal(few.state, 'INSUFFICIENT_DATA');
  assert.deepEqual(few.badges, []);
  assert.equal(few.reworkRatePct, null);
  const good = vv.scorecard({ jobs: 5, reworked: 0, quotedTotalAed: 1000, responseHours: [2, 3, 4, 5, 6] });
  assert.deepEqual(good.badges, ['LOW_REWORK', 'FAST_RESPONSE']);
  assert.equal(good.avgQuoteAed, 200);
  assert.deepEqual(vv.scorecard({ jobs: 5, reworked: 2, quotedTotalAed: 1000, responseHours: [50, 50, 50, 50, 50] }).badges, []);
});

test('owner sees only BIN vendors that quoted on own jobs, with real numbers', async () => {
  const today = vv.dubaiToday();
  await db.doc('vendors/v1').set({ name: 'Cool Air', trade: 'HVAC', status: 'verified', licenseExpiry: addDays(today, 10), commissionPct: 8 });
  await db.doc('vendors/v2').set({ name: 'Other Co', trade: 'Plumbing', status: 'verified' });
  const t0 = Date.parse(`${today}T00:00:00Z`);
  for (let i = 0; i < 5; i += 1) {
    await db.doc(`vendor_rfqs/r${i}`).set({ ownerId: 'ovv_owner', createdAt: new Date(t0) });
    await db.doc(`vendor_quotes/q${i}`).set({ ownerId: 'ovv_owner', vendorId: 'v1', rfqId: `r${i}`, ticketId: `t${i}`, amountAed: 100 * (i + 1), createdAt: new Date(t0 + 3600000 * (i + 1)) });
  }
  await db.doc('ticket_reopen_events/t0_1').set({ ticketId: 't0' });
  await db.doc('vendor_quotes/qx').set({ ownerId: 'someone_else', vendorId: 'v2', amountAed: 50 });
  await db.doc('vendor_quotes/qy').set({ ownerId: 'ovv_owner', vendorId: 'not_registered', amountAed: 50 });
  const res = await call(getOwnerVendorScorecards, owner, {});
  assert.equal(res.vendors.length, 1);
  const v = res.vendors[0];
  assert.equal(v.vendorId, 'v1');
  assert.equal(v.state, 'OK');
  assert.equal(v.reworkRatePct, 20);
  assert.equal(v.avgQuoteAed, 300);
  assert.equal(v.medianResponseHours, 3);
  assert.deepEqual(v.badges, ['FAST_RESPONSE']);
  assert.equal(v.licence.state, 'EXPIRING');
  assert.equal(v.insurance.state, 'UNKNOWN');
  assert.deepEqual(v.commission, { recorded: true, pct: 8, note: null });
  await expectHttpsError(call(getOwnerVendorScorecards, tenant, {}), 'permission-denied');
});

test('expiry alerts are written once per offset', async () => {
  const today = vv.dubaiToday();
  await db.doc('vendors/v1').set({ name: 'Cool Air', status: 'verified', licenseExpiry: addDays(today, 7), insuranceExpiry: addDays(today, 30) });
  await db.doc('vendors/v2').set({ name: 'Later', status: 'verified', licenseExpiry: addDays(today, 8) });
  assert.equal((await vv.runVendorCredentialAlerts(today)).sent, 2);
  assert.equal((await vv.runVendorCredentialAlerts(today)).sent, 0);
  const rows = (await db.collection('vendor_credential_alerts').get()).docs.map((d) => d.data());
  assert.ok(rows.every((r) => r.titleAr && r.titleEn));
});

test('rules: credential alerts are Admin-read only; no client writes', async () => {
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc } = require('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId: 'demo-otc-rules-vendors', firestore: { rules: fs.readFileSync(path.resolve(__dirname, '..', '..', 'firestore.rules'), 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'vendor_credential_alerts/a1'), { vendorId: 'v1' }); });
    const as = (uid, role) => env.authenticatedContext(uid, { role, email: `${uid}@example.com`, email_verified: true }).firestore();
    await assertFails(getDoc(doc(as('ovv_owner', 'owner'), 'vendor_credential_alerts/a1')));
    await assertFails(setDoc(doc(as('ovv_owner', 'owner'), 'vendor_credential_alerts/a2'), { vendorId: 'v1' }));
  } finally { await env.cleanup(); }
});
