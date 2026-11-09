'use strict';
// Owner spending limits: FIXED AED 1,000 per-job limit (owners cannot change it; audit D-02), server-enforced
// written over-limit approval, AED 2,500 emergency allowance with owner notice, tolerance re-approval,
// emergency reason + review.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const rt = lib('runtimeAll.js');
const sl = lib('ownerSpendingLimits.js');
let owner, tenant;
test.before(async () => {
  owner = await createUser('osl_owner', { role: 'owner' });
  tenant = await createUser('osl_tenant', { role: 'tenant' });
});
test.beforeEach(clearFirestore);

test('pure helpers: no limit means NO_LIMIT_SET (no AED default); tolerance math', () => {
  assert.equal(sl.evaluateApproval(null, 99999).state, 'NO_LIMIT_SET');
  assert.equal(sl.evaluateApproval({ perJobLimitAed: 1000, tolerancePct: 5 }, 1001).state, 'OVER_LIMIT');
  assert.equal(sl.evaluateApproval({ perJobLimitAed: 1000, tolerancePct: 5 }, 1000).state, 'WITHIN_LIMIT');
  assert.equal(sl.needsReapproval(1000, 1050, 5), false);
  assert.equal(sl.needsReapproval(1000, 1051, 5), true);
  assert.equal(sl.needsReapproval(1000, 1001, 0), true);
});

test('owner sets tolerance only; the per-job limit is fixed at AED 1,000; invalid values and non-owners rejected', async () => {
  await expectHttpsError(call(rt.ownerSetSpendingLimits, owner, { perJobLimitAed: 1000 }), 'invalid-argument');
  await expectHttpsError(call(rt.ownerSetSpendingLimits, owner, { perJobLimitAed: 1000, tolerancePct: 80 }), 'invalid-argument');
  await expectHttpsError(call(rt.ownerSetSpendingLimits, tenant, { perJobLimitAed: 1000, tolerancePct: 5 }), 'permission-denied');
  await call(rt.ownerSetSpendingLimits, owner, { perJobLimitAed: 1000, tolerancePct: 5 });
  const d = (await db.doc('owner_spending_limits/osl_owner').get()).data();
  assert.equal(d.perJobLimitAed, 1000); assert.equal(d.tolerancePct, 5); assert.equal(d.perJobLimitFixed, true);
  // Owners can no longer raise or lower the limit.
  await expectHttpsError(call(rt.ownerSetSpendingLimits, owner, { perJobLimitAed: 5000, tolerancePct: 5 }), 'invalid-argument');
  await expectHttpsError(call(rt.ownerSetSpendingLimits, owner, { perJobLimitAed: 200, tolerancePct: 5 }), 'invalid-argument');
  await call(rt.ownerSetSpendingLimits, owner, { tolerancePct: 10 });
  const d2 = (await db.doc('owner_spending_limits/osl_owner').get()).data();
  assert.equal(d2.perJobLimitAed, 1000); assert.equal(d2.tolerancePct, 10);
});

test('fixed limit applies with no owner record and ignores a stored owner value', async () => {
  assert.deepEqual(await sl.readLimits(db, 'osl_owner'), { perJobLimitAed: 1000, tolerancePct: 0 });
  await db.doc('owner_spending_limits/osl_owner').set({ ownerId: 'osl_owner', perJobLimitAed: 50000, tolerancePct: 5 });
  assert.equal((await sl.readLimits(db, 'osl_owner')).perJobLimitAed, 1000);
  await db.doc('vendor_quotes/qf').set({ ownerId: 'osl_owner', rfqId: 'rf', amountAed: 1200 });
  await db.doc('owner_approval_requests/af').set({ ownerId: 'osl_owner', rfqId: 'rf', status: 'pending' });
  await expectHttpsError(call(rt.submitOwnerApprovalDecision, owner, { approvalRequestId: 'af', decision: 'APPROVED' }), 'failed-precondition');
  await call(rt.submitOwnerApprovalDecision, owner, { approvalRequestId: 'af', decision: 'APPROVED', confirmOverLimit: true, decisionNote: 'Approved in writing' });
  const a = (await db.doc('owner_approval_requests/af').get()).data();
  assert.equal(a.ownerWrittenApproval.amountAed, 1200); assert.equal(a.ownerWrittenApproval.limitAed, 1000);
});

test('spend gate: AED 1,000 fixed limit, AED 2,500 emergency allowance', () => {
  assert.deepEqual(sl.spendApprovalGate(1000, false), { gate: 'within_fixed_limit', ownerApprovalRequired: false, minimumQuotes: 1 });
  assert.equal(sl.spendApprovalGate(1000.01, false).gate, 'owner_written_approval_required');
  assert.equal(sl.spendApprovalGate(1500, false).ownerApprovalRequired, true);
  assert.equal(sl.spendApprovalGate(1501, false).gate, 'three_quotes_required');
  assert.equal(sl.spendApprovalGate(2500, true).gate, 'emergency_within_allowance');
  assert.equal(sl.spendApprovalGate(2500, true).ownerApprovalRequired, false);
  assert.equal(sl.spendApprovalGate(2500.01, true).gate, 'owner_written_approval_required');
  assert.equal(sl.FIXED_OWNER_APPROVAL_LIMIT_AED, 1000);
  assert.equal(sl.EMERGENCY_SPEND_LIMIT_AED, 2500);
  assert.equal(sl.EMERGENCY_OWNER_NOTIFY_HOURS, 24);
});

test('emergency RFQ within AED 2,500 notifies the owner at once and opens a review; non-emergency ticket cannot use it', async () => {
  const uid = 'osl_admin_mfa';
  try {
    await admin.auth().createUser({ uid, email: 'osl.admin@example.invalid', emailVerified: true, multiFactor: { enrolledFactors: [{ phoneNumber: '+15555550199', factorId: 'phone' }] } });
  } catch (error) { if (error?.code !== 'auth/uid-already-exists') throw error; }
  await admin.auth().setCustomUserClaims(uid, { role: 'admin', admin: true });
  const adminActor = { uid, token: { role: 'admin', admin: true, email: 'osl.admin@example.invalid', email_verified: true, firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };
  await db.doc(`users/${uid}`).set({ role: 'admin', status: 'active' });
  await db.doc('users/osl_owner').set({ role: 'owner', status: 'active', email: 'osl.owner@example.invalid' });
  await db.doc('properties/osl_p').set({ ownerId: 'osl_owner' });
  await db.doc('maintenanceTickets/osl_t_em').set({ propertyId: 'osl_p', ownerId: 'osl_owner', priority: 'emergency' });
  await db.doc('maintenanceTickets/osl_t_norm').set({ propertyId: 'osl_p', ownerId: 'osl_owner', priority: 'normal' });
  const base = { propertyId: 'osl_p', ownerId: 'osl_owner', trade: 'Plumbing', standardScope: 'Stop active leak' };
  await expectHttpsError(call(rt.adminCreateVendorRfq, adminActor, { ...base, ticketId: 'osl_t_norm', estimateBandAed: 2000, emergency: true }), 'failed-precondition');
  const res = await call(rt.adminCreateVendorRfq, adminActor, { ...base, ticketId: 'osl_t_em', estimateBandAed: 2400, emergency: true });
  assert.equal(res.approvalGate, 'emergency_within_allowance');
  const review = (await db.doc(`emergency_spend_reviews/rfq_${res.rfqId}`).get()).data();
  assert.equal(review.limitAed, 2500); assert.ok(review.ownerNotifyBy > review.ownerNotifiedAt);
  const notes = await db.collection('notifications').where('userId', '==', 'osl_owner').get();
  assert.equal(notes.docs.filter((d) => d.data().type === 'EMERGENCY_SPEND_NOTICE').length, 1);
  const over = await call(rt.adminCreateVendorRfq, adminActor, { ...base, ticketId: 'osl_t_em', estimateBandAed: 3000, emergency: true });
  assert.equal(over.approvalGate, 'owner_written_approval_required');
  const small = await call(rt.adminCreateVendorRfq, adminActor, { ...base, ticketId: 'osl_t_norm', estimateBandAed: 900 });
  assert.equal(small.approvalGate, 'within_fixed_limit');
});

test('server enforces over-limit confirmation and emergency reason + review record', async () => {
  await db.doc('owner_spending_limits/osl_owner').set({ ownerId: 'osl_owner', perJobLimitAed: 1000, tolerancePct: 5 });
  await db.doc('vendor_quotes/q1').set({ ownerId: 'osl_owner', rfqId: 'r1', amountAed: 1500 });
  await db.doc('owner_approval_requests/a1').set({ ownerId: 'osl_owner', rfqId: 'r1', status: 'pending' });
  await expectHttpsError(call(rt.submitOwnerApprovalDecision, owner, { approvalRequestId: 'a1', decision: 'APPROVED' }), 'failed-precondition');
  const ok = await call(rt.submitOwnerApprovalDecision, owner, { approvalRequestId: 'a1', decision: 'APPROVED', confirmOverLimit: true });
  assert.equal(ok.status, 'owner_approved');
  const a = (await db.doc('owner_approval_requests/a1').get()).data();
  assert.equal(a.approvedAmountAed, 1500); assert.equal(a.overLimitConfirmed, true);

  await db.doc('owner_approval_requests/a2').set({ ownerId: 'osl_owner', rfqId: 'r1', status: 'pending' });
  await expectHttpsError(call(rt.submitOwnerApprovalDecision, owner, { approvalRequestId: 'a2', decision: 'EMERGENCY_APPROVED', decisionNote: 'leak' }), 'invalid-argument');
  await call(rt.submitOwnerApprovalDecision, owner, { approvalRequestId: 'a2', decision: 'EMERGENCY_APPROVED', decisionNote: 'Active water leak flooding the unit' });
  const r = (await db.doc('emergency_spend_reviews/a2').get()).data();
  assert.equal(r.status, 'PENDING_REVIEW'); assert.equal(r.ownerId, 'osl_owner');
});

test('quote rising above tolerance after approval requires re-approval', async () => {
  await db.doc('owner_spending_limits/osl_owner').set({ ownerId: 'osl_owner', perJobLimitAed: 5000, tolerancePct: 5 });
  await db.doc('vendor_quotes/q1').set({ ownerId: 'osl_owner', rfqId: 'r2', amountAed: 1000 });
  await db.doc('owner_approval_requests/a3').set({ ownerId: 'osl_owner', rfqId: 'r2', status: 'pending' });
  await call(rt.submitOwnerApprovalDecision, owner, { approvalRequestId: 'a3', decision: 'APPROVED' });
  await sl.checkQuoteReapproval('q1', { amountAed: 1040, ownerId: 'osl_owner', rfqId: 'r2' }, { ownerId: 'osl_owner', rfqId: 'r2', amountAed: 1040 });
  assert.equal((await db.doc('owner_approval_requests/a3').get()).data().status, 'owner_approved');
  await sl.checkQuoteReapproval('q1', { amountAed: 1000 }, { ownerId: 'osl_owner', rfqId: 'r2', amountAed: 1200 });
  const status = (await db.doc('owner_approval_requests/a3').get()).data().status;
  const n = await db.collection('notifications').where('userId', '==', 'osl_owner').get();
  assert.equal(n.size, 1);
  assert.equal(status, 'reapproval_required');
});
