'use strict';
// Painting one-time project: OTP-bound owner approval, photo-gated work order and completion,
// bounded warranty. AI never approves; admin calls need MFA.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

process.env.OWNER_CONTRACT_OTP_PEPPER = process.env.OWNER_CONTRACT_OTP_PEPPER || 'p'.repeat(48);
const m = lib('paintingProjects.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };

let owner, other, adminMfa, adminNoMfa;
test.before(async () => {
  owner = await createUser('owner_paint', { role: 'owner' });
  other = await createUser('owner_paint_other', { role: 'owner' });
  adminMfa = await createUser('admin_paint_mfa', { role: 'admin', admin: true }, MFA);
  adminNoMfa = await createUser('admin_paint_nomfa', { role: 'admin', admin: true });
});
test.beforeEach(clearFirestore);

async function seedQuoted(id = 'pp1', version = 1) {
  await db.doc(`painting_projects/${id}`).set({ ownerId: owner.uid, propertyId: 'prop1', scope: 'ROOM', status: 'QUOTED', quoteVersion: version, approvedQuoteVersion: null });
  await db.doc(`painting_projects/${id}/quotes/v${version}`).set({ version, priceAed: 5000 });
}
async function seedOtp({ otpId = 'otp1', projectId = 'pp1', quoteVersion = 1, code = '123456', ...rest } = {}) {
  const salt = 'ab'.repeat(16);
  const digest = m.paintingOtpDigest({ otpId, uid: owner.uid, projectId, quoteVersion, otp: code, salt, pepper: process.env.OWNER_CONTRACT_OTP_PEPPER });
  await db.doc(`system_secrets/painting_approval_otps/otps/${otpId}`).set({
    uid: owner.uid, projectId, quoteVersion, salt, digest, attempts: 0, status: 'PENDING',
    requestedAt: admin.firestore.Timestamp.now(), expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 600000), ...rest,
  });
}
const approve = (actor, data) => call(m.ownerApprovePaintingQuote, actor, { projectId: 'pp1', otpId: 'otp1', quoteVersion: 1, otp: '123456', ...data });

test('owner approves only with the correct OTP bound to the quote version; OTP is single-use', async () => {
  await seedQuoted(); await seedOtp();
  await expectHttpsError(approve(other), 'permission-denied');
  await expectHttpsError(approve(owner, { otp: '000000' }), 'permission-denied');
  assert.equal((await db.doc('system_secrets/painting_approval_otps/otps/otp1').get()).get('attempts'), 1);
  const ok = await approve(owner);
  assert.equal(ok.status, 'OWNER_APPROVED');
  const p = (await db.doc('painting_projects/pp1').get()).data();
  assert.equal(p.status, 'OWNER_APPROVED'); assert.equal(p.approvedQuoteVersion, 1);
  assert.equal((await db.doc('system_secrets/painting_approval_otps/otps/otp1').get()).get('status'), 'CONSUMED');
  await expectHttpsError(approve(owner), 'failed-precondition');
  const audit = await db.collection('audit_logs').where('action', '==', 'PAINTING_QUOTE_OWNER_APPROVED').get();
  assert.equal(audit.size, 1);
});

test('OTP for an older quote version is refused after a variation', async () => {
  await seedQuoted('pp1', 2); await seedOtp({ quoteVersion: 1 });
  await expectHttpsError(approve(owner, { quoteVersion: 1 }), 'aborted');
  assert.equal((await db.doc('painting_projects/pp1').get()).get('status'), 'QUOTED');
});

test('expired and locked OTPs are refused', async () => {
  await seedQuoted(); await seedOtp({ expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() - 1000) });
  await expectHttpsError(approve(owner), 'deadline-exceeded');
  await seedOtp({ otpId: 'otp2', attempts: 5 });
  await expectHttpsError(approve(owner, { otpId: 'otp2' }), 'resource-exhausted');
});

test('OTP request refuses non-owners and non-quoted projects', async () => {
  await seedQuoted();
  await expectHttpsError(call(m.ownerRequestPaintingApprovalOtp, other, { projectId: 'pp1' }), 'permission-denied');
  await db.doc('painting_projects/pp1').update({ status: 'REQUESTED' });
  await expectHttpsError(call(m.ownerRequestPaintingApprovalOtp, owner, { projectId: 'pp1' }), 'failed-precondition');
});

test('admin lifecycle needs MFA, before photos, after photos and a bounded warranty', async () => {
  await seedQuoted(); await seedOtp(); await approve(owner);
  await expectHttpsError(call(m.adminOpenPaintingWorkOrder, owner, { projectId: 'pp1' }), 'permission-denied');
  await expectHttpsError(call(m.adminOpenPaintingWorkOrder, adminNoMfa, { projectId: 'pp1' }), 'permission-denied');
  await expectHttpsError(call(m.adminOpenPaintingWorkOrder, adminMfa, { projectId: 'pp1' }), 'failed-precondition');

  await expectHttpsError(call(m.adminRecordPaintingPhotos, adminMfa, { projectId: 'pp1', kind: 'BEFORE', paths: ['https://x/y.jpg?token=1'] }), 'invalid-argument');
  await expectHttpsError(call(m.adminRecordPaintingPhotos, adminMfa, { projectId: 'pp1', kind: 'BEFORE', paths: ['painting-projects/pp1/before/missing.jpg'] }), 'failed-precondition');
  const bucket = admin.storage().bucket();
  await bucket.file('painting-projects/pp1/before/a.jpg').save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  await bucket.file('painting-projects/pp1/after/b.jpg').save(Buffer.from('jpg'), { contentType: 'image/jpeg' });
  await expectHttpsError(call(m.adminRecordPaintingPhotos, adminMfa, { projectId: 'pp1', kind: 'AFTER', paths: ['painting-projects/pp1/after/b.jpg'] }), 'failed-precondition');
  assert.equal((await call(m.adminRecordPaintingPhotos, adminMfa, { projectId: 'pp1', kind: 'BEFORE', paths: ['painting-projects/pp1/before/a.jpg'] })).count, 1);

  assert.equal((await call(m.adminOpenPaintingWorkOrder, adminMfa, { projectId: 'pp1' })).status, 'WORK_ORDER_OPEN');
  await expectHttpsError(call(m.adminCompletePaintingProject, adminMfa, { projectId: 'pp1' }), 'failed-precondition');
  await call(m.adminRecordPaintingPhotos, adminMfa, { projectId: 'pp1', kind: 'AFTER', paths: ['painting-projects/pp1/after/b.jpg'] });
  assert.equal((await call(m.adminCompletePaintingProject, adminMfa, { projectId: 'pp1' })).status, 'COMPLETED');

  await expectHttpsError(call(m.adminIssuePaintingWarranty, adminMfa, { projectId: 'pp1', months: 61 }), 'invalid-argument');
  await expectHttpsError(call(m.adminIssuePaintingWarranty, adminMfa, { projectId: 'pp1', months: 0 }), 'invalid-argument');
  const w = await call(m.adminIssuePaintingWarranty, adminMfa, { projectId: 'pp1', months: 12 });
  assert.equal(w.status, 'WARRANTY_ACTIVE');
  assert.equal((await db.doc('painting_projects/pp1').get()).get('warranty.months'), 12);
  await expectHttpsError(call(m.ownerCancelPaintingProject, owner, { projectId: 'pp1' }), 'failed-precondition');
});

test('work order refuses a quote that is not the owner-approved version', async () => {
  await db.doc('painting_projects/pp1').set({ ownerId: owner.uid, status: 'OWNER_APPROVED', quoteVersion: 2, approvedQuoteVersion: 1, beforePhotoPaths: ['painting-projects/pp1/before/a.jpg'] });
  await expectHttpsError(call(m.adminOpenPaintingWorkOrder, adminMfa, { projectId: 'pp1' }), 'failed-precondition');
});

test('owner can cancel a quoted project; other owners cannot', async () => {
  await seedQuoted();
  await expectHttpsError(call(m.ownerCancelPaintingProject, other, { projectId: 'pp1' }), 'permission-denied');
  assert.equal((await call(m.ownerCancelPaintingProject, owner, { projectId: 'pp1', reason: 'changed plans' })).status, 'CANCELLED');
});
