'use strict';
// Regression for the FIELD NODE "could not be verified through Google Play Integrity ...
// Diagnostic: FUNCTIONS_PERMISSION-DENIED" report (2026-09-30 19:28 GST). Production logs showed
// registerTechnicianDevice POST 403 with App Check VALID and Auth VALID, i.e. the handler refused
// the account, not the integrity token. The account had claims { suspended: true } because HR
// onboarding activation was pending. Each permission-denied gate must carry a machine-readable
// reason so the client can tell account state apart from an integrity failure.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, expectHttpsError } = require('./_setup.cjs');

const { registerTechnicianDevice } = lib('technicianInstallationBinding.js');

const ANDROID_APP_ID = '1:123413252227:android:36feeed4a78c1dcf99f3b6';
const WEB_APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const HASH = 'c'.repeat(64);
const TECH = 'tech_registration_denial';

const pendingProfile = {
  role: 'technician', userRole: 'technician', primaryRole: 'technician',
  status: 'EMAIL_VERIFIED', approvalStatus: 'PENDING', suspended: true,
};
const activeProfile = { ...pendingProfile, status: 'ACTIVE', approvalStatus: 'APPROVED', suspended: false };
const pendingClaims = { role: 'technician', userRole: 'technician', primaryRole: 'technician', technician: true, suspended: true };

const register = (claims, appId = ANDROID_APP_ID, data = { installationHash: HASH }) => registerTechnicianDevice.run({
  auth: { uid: TECH, token: { ...claims, email: `${TECH}@example.invalid`, email_verified: true } },
  app: { appId, token: {} },
  data,
  rawRequest: {},
});

test.before(async () => {
  await createUser(TECH, pendingClaims);
});
test.beforeEach(async () => {
  await clearFirestore();
});

test('production state: suspended-claim Technician is refused with an account reason, not an integrity reason', async () => {
  await admin.auth().setCustomUserClaims(TECH, pendingClaims);
  await db.doc(`users/${TECH}`).set(pendingProfile);
  await db.doc(`technicians/${TECH}`).set(pendingProfile);
  const error = await expectHttpsError(register(pendingClaims), 'permission-denied');
  assert.equal(error.details?.reason, 'TECHNICIAN_ACCOUNT_DISABLED_OR_SUSPENDED');
  const technician = (await db.doc(`technicians/${TECH}`).get()).data();
  assert.equal(technician.registeredInstallationHash, undefined, 'no binding is written for an inactive account');
});

test('profile-level suspension without the Auth claim is refused with TECHNICIAN_PROFILE_SUSPENDED', async () => {
  const claims = { ...pendingClaims, suspended: false };
  await admin.auth().setCustomUserClaims(TECH, claims);
  await db.doc(`users/${TECH}`).set(pendingProfile);
  await db.doc(`technicians/${TECH}`).set(pendingProfile);
  const error = await expectHttpsError(register(claims), 'permission-denied');
  assert.equal(error.details?.reason, 'TECHNICIAN_PROFILE_SUSPENDED');
});

test('non-technician identity is refused with TECHNICIAN_ROLE_REQUIRED', async () => {
  const claims = { role: 'owner' };
  await admin.auth().setCustomUserClaims(TECH, claims);
  await db.doc(`users/${TECH}`).set({ role: 'owner', status: 'active' });
  const error = await expectHttpsError(register(claims), 'permission-denied');
  assert.equal(error.details?.reason, 'TECHNICIAN_ROLE_REQUIRED');
});

test('a non-Android App Check identity is the only integrity-class permission-denied reason', async () => {
  const claims = { ...pendingClaims, suspended: false };
  await admin.auth().setCustomUserClaims(TECH, claims);
  await db.doc(`users/${TECH}`).set(activeProfile);
  await db.doc(`technicians/${TECH}`).set(activeProfile);
  const error = await expectHttpsError(register(claims, WEB_APP_ID), 'permission-denied');
  assert.equal(error.details?.reason, 'APP_CHECK_APP_ID_MISMATCH');
});

test('after activation (claim cleared, ACTIVE/APPROVED) the same installation registers', async () => {
  const claims = { ...pendingClaims, suspended: false };
  await admin.auth().setCustomUserClaims(TECH, claims);
  await db.doc(`users/${TECH}`).set(activeProfile);
  await db.doc(`technicians/${TECH}`).set(activeProfile);
  const result = await register(claims);
  assert.deepEqual(result, { status: 'SUCCESS', registration: 'INITIAL' });
  const [user, technician] = await Promise.all([db.doc(`users/${TECH}`).get(), db.doc(`technicians/${TECH}`).get()]);
  assert.equal(user.data().registeredInstallationHash, HASH);
  assert.equal(technician.data().registeredInstallationHash, HASH);
  assert.equal(technician.data().registeredDevicePlatform, 'android');
});
