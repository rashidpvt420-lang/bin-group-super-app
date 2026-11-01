'use strict';
// Owner spending limits: owner-set (no defaults), server-enforced over-limit confirm, tolerance re-approval, emergency reason + review.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

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

test('owner sets own limits; invalid values and non-owners rejected', async () => {
  await expectHttpsError(call(rt.ownerSetSpendingLimits, owner, { perJobLimitAed: 1000 }), 'invalid-argument');
  await expectHttpsError(call(rt.ownerSetSpendingLimits, owner, { perJobLimitAed: 1000, tolerancePct: 80 }), 'invalid-argument');
  await expectHttpsError(call(rt.ownerSetSpendingLimits, tenant, { perJobLimitAed: 1000, tolerancePct: 5 }), 'permission-denied');
  await call(rt.ownerSetSpendingLimits, owner, { perJobLimitAed: 1000, tolerancePct: 5 });
  const d = (await db.doc('owner_spending_limits/osl_owner').get()).data();
  assert.equal(d.perJobLimitAed, 1000); assert.equal(d.tolerancePct, 5);
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
