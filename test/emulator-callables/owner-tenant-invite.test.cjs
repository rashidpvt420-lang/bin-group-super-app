'use strict';
// Feature 7: owner self-serve tenant invite on the secure tenant_invitations model.
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { db, lib, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');
const { ownerInviteTenantToUnit, ownerListTenantInvitations } = lib('runtimeAll.js');
const owner = { uid: 'o_inv', token: { role: 'owner', email: 'o@example.invalid', email_verified: true } };
const other = { uid: 'o_x', token: { role: 'owner', email: 'x@example.invalid', email_verified: true } };
const unverified = { uid: 'o_inv', token: { role: 'owner', email: 'o@example.invalid', email_verified: false } };

test.beforeEach(async () => {
  await clearFirestore();
  await db.doc('properties/p1').set({ ownerId: 'o_inv', propertyName: 'Palm Tower' });
  await db.doc('units/u1').set({ propertyId: 'p1', unitNumber: '1204' });
  await db.doc('units/u_taken').set({ propertyId: 'p1', unitNumber: '1205', tenantId: 't9' });
});

test('invite stores only the token hash, emails the tenant and returns the link once', async () => {
  const r = await call(ownerInviteTenantToUnit, owner, { unitId: 'u1', tenantEmail: 'T@Example.invalid', tenantName: 'Sara' });
  const token = new URL(r.inviteLink).searchParams.get('token');
  const inv = (await db.doc(`tenant_invitations/${r.invitationId}`).get()).data();
  assert.equal(inv.inviteTokenHash, crypto.createHash('sha256').update(token).digest('hex'));
  assert.equal(JSON.stringify(inv).includes(token), false);
  assert.equal(inv.status, 'sent'); assert.equal(inv.tenantEmail, 't@example.invalid'); assert.equal(inv.unitId, 'u1');
  const mail = await db.collection('mail').where('metadata.invitationId', '==', r.invitationId).get();
  assert.equal(mail.size, 1);
  const again = await call(ownerInviteTenantToUnit, owner, { unitId: 'u1', tenantEmail: 't@example.invalid' });
  assert.equal(again.replaced, 1);
  assert.equal((await db.doc(`tenant_invitations/${r.invitationId}`).get()).data().status, 'cancelled');
  const list = await call(ownerListTenantInvitations, owner, {});
  assert.deepEqual(list.invitations.map((i) => i.state).sort(), ['CANCELLED', 'SENT']);
});

test('guards: own unit, verified owner, valid email, unit not already linked', async () => {
  await expectHttpsError(call(ownerInviteTenantToUnit, other, { unitId: 'u1', tenantEmail: 't@example.invalid' }), 'permission-denied');
  await expectHttpsError(call(ownerInviteTenantToUnit, unverified, { unitId: 'u1', tenantEmail: 't@example.invalid' }), 'permission-denied');
  await expectHttpsError(call(ownerInviteTenantToUnit, owner, { unitId: 'u1', tenantEmail: 'nope' }), 'invalid-argument');
  await expectHttpsError(call(ownerInviteTenantToUnit, owner, { unitId: 'u_taken', tenantEmail: 't@example.invalid' }), 'failed-precondition');
});
