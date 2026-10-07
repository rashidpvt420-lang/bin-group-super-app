'use strict';
// Regression (tenant P0): assignPublicPortalRole re-selecting the role a profile
// already holds used to merge `status: initialStatus(role)` + onboardingComplete:false,
// so an invited tenant whose acceptance made them `active` (acceptTenantInvitation)
// and who then pressed "Continue as Tenant" on /gateway was demoted to
// `pending_invitation` and locked out by ProtectedRoute's tenant review screen.
// The same reset demoted approved owners/technicians/brokers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { db, lib, createUser, clearFirestore, call, expectHttpsError, admin } = require('./_setup.cjs');

const { assignPublicPortalRole } = lib('publicRoleAssignment.js');

test.beforeEach(clearFirestore);

test('an active invited tenant re-selecting tenant keeps status active and onboarding state', async () => {
  const tenant = await createUser('reselect_tenant_active', { role: 'tenant' });
  await db.doc(`users/${tenant.uid}`).set({
    role: 'tenant', status: 'active', onboardingComplete: true, unitId: 'unit-1', propertyId: 'prop-1',
  });

  const result = await call(assignPublicPortalRole, tenant, { role: 'tenant' });

  const profile = (await db.doc(`users/${tenant.uid}`).get()).data();
  assert.equal(profile.status, 'active');
  assert.equal(profile.onboardingComplete, true);
  assert.equal(profile.unitId, 'unit-1');
  assert.equal(result.status, 'active');
  assert.equal(result.alreadyAssigned, true);
  assert.equal((await admin.auth().getUser(tenant.uid)).customClaims.role, 'tenant');
});

test('an approved owner whose claim is missing gets the claim back without demotion', async () => {
  const owner = await createUser('reselect_owner_active', {});
  await db.doc(`users/${owner.uid}`).set({ role: 'owner', status: 'active', onboardingComplete: true });

  await call(assignPublicPortalRole, owner, { role: 'owner' });

  const profile = (await db.doc(`users/${owner.uid}`).get()).data();
  assert.equal(profile.status, 'active');
  assert.equal(profile.onboardingComplete, true);
  assert.equal((await admin.auth().getUser(owner.uid)).customClaims.role, 'owner');
});

test('a fresh account still receives the initial public status for the role', async () => {
  const fresh = await createUser('reselect_fresh_tech', {});

  const result = await call(assignPublicPortalRole, fresh, { role: 'technician' });

  const profile = (await db.doc(`users/${fresh.uid}`).get()).data();
  assert.equal(profile.role, 'technician');
  assert.equal(profile.status, 'pending_approval');
  assert.equal(profile.onboardingComplete, false);
  assert.notEqual(result.alreadyAssigned, true);
});

test('a different role is still refused', async () => {
  const tenant = await createUser('reselect_tenant_to_owner', { role: 'tenant' });
  await db.doc(`users/${tenant.uid}`).set({ role: 'tenant', status: 'active' });
  await expectHttpsError(call(assignPublicPortalRole, tenant, { role: 'owner' }), 'failed-precondition');
  assert.equal((await db.doc(`users/${tenant.uid}`).get()).data().status, 'active');
});
