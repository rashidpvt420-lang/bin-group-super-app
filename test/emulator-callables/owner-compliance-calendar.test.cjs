'use strict';
// Compliance calendar: dated items only from lease records, idempotent reminders, owner-only reads.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { getOwnerComplianceCalendar } = lib('runtimeAll.js');
const cal = lib('ownerComplianceCalendar.js');
let owner, otherOwner, tenant;
const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
test.before(async () => {
  owner = await createUser('occ_owner', { role: 'owner' });
  otherOwner = await createUser('occ_owner2', { role: 'owner' });
  tenant = await createUser('occ_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('pure: items come from lease dates; ended or renewed leases do not invent notices', () => {
  const today = '2026-11-01';
  const items = cal.itemsForLease('L1', { leaseEndDate: '2027-03-31', leaseStartDate: '2026-10-20', registrationStatus: 'PENDING_REGISTRATION', registrationAuthority: 'EJARI' }, today);
  assert.deepEqual(items.map((i) => [i.type, i.dueDate]), [['LEASE_END', '2027-03-31'], ['RENEWAL_NOTICE', '2026-12-31'], ['REGISTRATION_FOLLOW_UP', '2026-11-19']]);
  assert.ok(items.every((i) => i.titleAr && i.noteAr && /not legal advice/.test(i.noteEn)));
  assert.equal(cal.itemsForLease('L2', { leaseEndDate: '2027-03-31', renewalStatus: 'RENEWED' }, today).length, 1);
  assert.equal(cal.itemsForLease('L3', { leaseEndDate: '2027-03-31', leaseStatus: 'ended' }, today).length, 0);
  assert.equal(cal.itemsForLease('L4', { leaseEndDate: 'soon' }, today).length, 0);
});

test('owner sees only own items; reminders are sent once per offset', async () => {
  const today = cal.dubaiToday();
  await db.doc('leases/L_own').set({ ownerId: 'occ_owner', leaseEndDate: addDays(today, 97), leaseStatus: 'active' });
  await db.doc('leases/L_other').set({ ownerId: 'occ_owner2', leaseEndDate: addDays(today, 30) });
  const res = await call(getOwnerComplianceCalendar, owner, {});
  assert.deepEqual(res.items.map((i) => i.leaseId), ['L_own', 'L_own']);
  assert.equal(res.items[0].type, 'RENEWAL_NOTICE');
  assert.equal(res.items[0].daysLeft, 7);
  const first = await cal.runComplianceReminders(today);
  const again = await cal.runComplianceReminders(today);
  assert.equal(first.sent, 2); // own notice at 7 days + other owner's lease end at 30 days
  assert.equal(again.sent, 0);
  const notes = (await db.collection('notifications').where('type', '==', 'COMPLIANCE_REMINDER').get()).docs.map((d) => d.data());
  assert.equal(notes.length, 2);
  assert.ok(notes.every((n) => n.titleAr && n.bodyAr));
  await expectHttpsError(call(getOwnerComplianceCalendar, tenant, {}), 'permission-denied');
  await expectHttpsError(call(getOwnerComplianceCalendar, null, {}), 'unauthenticated');
});

test('rules: owners read only their own reminders; no client writes', async () => {
  const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc } = require('firebase/firestore');
  const env = await initializeTestEnvironment({ projectId: 'demo-otc-rules-calendar', firestore: { rules: fs.readFileSync(path.resolve(__dirname, '..', '..', 'firestore.rules'), 'utf8') } });
  try {
    await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'compliance_reminders/r1'), { ownerId: 'occ_owner', dueDate: '2027-01-01' }); });
    const as = (uid, role) => env.authenticatedContext(uid, { role, email: `${uid}@example.com`, email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(as('occ_owner', 'owner'), 'compliance_reminders/r1')));
    await assertFails(getDoc(doc(as('occ_owner2', 'owner'), 'compliance_reminders/r1')));
    await assertFails(setDoc(doc(as('occ_owner', 'owner'), 'compliance_reminders/r2'), { ownerId: 'occ_owner' }));
  } finally { await env.cleanup(); }
});
