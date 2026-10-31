'use strict';
// F-3: Admin request-changes / reject for the inspection-first Owner application.
// Behavioural: role + MFA gates, reason required, lifecycle transition enforced, audit written,
// properties moved, and REJECT is terminal.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminDecideOwnerApplication } = lib('runtimeAll.js');
const WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };

let adminMfa; let adminNoMfa; let owner;
test.before(async () => {
  adminMfa = await createUser('admin_f3_mfa', { role: 'super_admin', admin: true }, MFA);
  adminNoMfa = await createUser('admin_f3_nomfa', { role: 'super_admin', admin: true });
  owner = await createUser('owner_f3', { role: 'owner' }, MFA);
});
test.beforeEach(clearFirestore);

async function seed(intakeId, state = 'SUBMITTED_FOR_PROPERTY_INSPECTION') {
  await db.collection('intake_submissions').doc(intakeId).set({
    workflowVersion: WORKFLOW, ownerUid: owner.uid, status: 'submitted', ownerOnboardingState: state,
  });
  await db.collection('properties').doc(`${intakeId}_p1`).set({ intakeId, ownerUid: owner.uid, lifecycleStatus: 'PENDING_PROPERTY_INSPECTION' });
}

const REASON = 'Title deed page 2 is unreadable, please re-upload.';

test('non-admin and non-MFA admin are refused', async () => {
  await seed('i1');
  await expectHttpsError(call(adminDecideOwnerApplication, owner, { intakeId: 'i1', decision: 'REJECT', reason: REASON }), 'permission-denied');
  await expectHttpsError(call(adminDecideOwnerApplication, adminNoMfa, { intakeId: 'i1', decision: 'REJECT', reason: REASON }), 'permission-denied');
  await expectHttpsError(call(adminDecideOwnerApplication, null, { intakeId: 'i1', decision: 'REJECT', reason: REASON }), 'unauthenticated');
  assert.equal((await db.collection('intake_submissions').doc('i1').get()).data().ownerOnboardingState, 'SUBMITTED_FOR_PROPERTY_INSPECTION');
});

test('a short reason or unknown decision is rejected', async () => {
  await seed('i2');
  await expectHttpsError(call(adminDecideOwnerApplication, adminMfa, { intakeId: 'i2', decision: 'REJECT', reason: 'no' }), 'invalid-argument');
  await expectHttpsError(call(adminDecideOwnerApplication, adminMfa, { intakeId: 'i2', decision: 'APPROVE', reason: REASON }), 'invalid-argument');
});

test('REQUEST_CHANGES records reason, moves properties, writes audit and allows resubmission', async () => {
  await seed('i3');
  const res = await call(adminDecideOwnerApplication, adminMfa, { intakeId: 'i3', decision: 'REQUEST_CHANGES', reason: REASON });
  assert.equal(res.ownerOnboardingState, 'CHANGES_REQUESTED');
  const intake = (await db.collection('intake_submissions').doc('i3').get()).data();
  assert.equal(intake.ownerOnboardingState, 'CHANGES_REQUESTED');
  assert.equal(intake.adminDecisionReason, REASON);
  assert.equal(intake.ownerResubmissionAllowed, true);
  const prop = (await db.collection('properties').doc('i3_p1').get()).data();
  assert.equal(prop.lifecycleStatus, 'CHANGES_REQUESTED');
  assert.equal(prop.changesRequestedReason, REASON);
  const audits = await db.collection('audit_logs').where('intakeId', '==', 'i3').get();
  assert.equal(audits.size, 1);
  assert.equal(audits.docs[0].data().action, 'OWNER_APPLICATION_CHANGES_REQUESTED');
  assert.equal(audits.docs[0].data().actorId, adminMfa.uid);
});

test('REJECT is terminal: a second decision is refused', async () => {
  await seed('i4');
  await call(adminDecideOwnerApplication, adminMfa, { intakeId: 'i4', decision: 'REJECT', reason: REASON });
  const intake = (await db.collection('intake_submissions').doc('i4').get()).data();
  assert.equal(intake.ownerOnboardingState, 'REJECTED');
  assert.equal(intake.ownerResubmissionAllowed, false);
  await expectHttpsError(call(adminDecideOwnerApplication, adminMfa, { intakeId: 'i4', decision: 'REQUEST_CHANGES', reason: REASON }), 'failed-precondition');
});

test('legacy (non five-page) applications are refused', async () => {
  await db.collection('intake_submissions').doc('i5').set({ workflowVersion: 'LEGACY', status: 'submitted' });
  await expectHttpsError(call(adminDecideOwnerApplication, adminMfa, { intakeId: 'i5', decision: 'REJECT', reason: REASON }), 'failed-precondition');
});
