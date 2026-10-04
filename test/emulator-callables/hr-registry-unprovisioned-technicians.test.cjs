'use strict';
// Regression: technicians created outside staff provisioning (seed/script/legacy path without
// users.isStaff) appear on the dispatch roster and the admin live map, but the HR Staff Registry
// (adminGetStaffLifecycle: users where isStaff == true) silently omitted them and HR operations
// refused them. The registry now reports them with a reason, and Founder/Admin (MFA) can adopt an
// eligible existing technician identity - audited, role unchanged, no HR data invented.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminGetStaffLifecycle, adminAdoptTechnicianIntoStaffRegistry, adminRegisterHrDocumentMetadata } = lib('runtimeAll.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };
const REASON = 'Created by the legacy onboarding script; confirmed active with operations.';

let founder;
let founderNoMfa;
let hrManager;
let hrStaff;
test.before(async () => {
  founder = await createUser('founder_reg', { role: 'super_admin', admin: true, super_admin: true }, MFA);
  founderNoMfa = await createUser('founder_reg_nomfa', { role: 'super_admin', admin: true, super_admin: true });
  hrManager = await createUser('hr_reg_mgr', { role: 'hr_manager' }, MFA);
  hrStaff = await createUser('hr_reg_staff', { role: 'hr_staff' }, MFA);
  await createUser('tech_prov', { role: 'technician', isStaff: true });
  await createUser('tech_legacy', { role: 'technician', testAccount: true });
  await createUser('tech_legacy_disabled', { role: 'technician' });
  await admin.auth().updateUser('tech_legacy_disabled', { disabled: true });
});

test.beforeEach(async () => {
  await clearFirestore();
  await admin.auth().setCustomUserClaims('tech_legacy', { role: 'technician', testAccount: true });
  await admin.auth().setCustomUserClaims('tech_legacy_disabled', { role: 'technician' });
  await db.doc('users/tech_prov').set({ uid: 'tech_prov', role: 'technician', isStaff: true, displayName: 'Provisioned Tech', status: 'ACTIVE' });
  await db.doc('technicians/tech_prov').set({ role: 'technician', primaryTrade: 'Plumbing' });
  await db.doc('users/tech_legacy').set({ uid: 'tech_legacy', role: 'technician', displayName: 'Muhammed', email: 'tech_legacy@example.invalid', status: 'active' });
  await db.doc('technicians/tech_legacy').set({ role: 'technician', fullName: 'Muhammed', primaryTrade: 'AC', onDuty: true });
  await db.doc('users/tech_legacy_disabled').set({ uid: 'tech_legacy_disabled', role: 'technician', displayName: 'Paused Tech' });
  await db.doc('technicians/tech_roster_only').set({ role: 'technician', fullName: 'Roster Only', primaryTrade: 'Electrical' });
  await db.doc('users/tenant_roster').set({ role: 'tenant', displayName: 'Wrong Role' });
  await db.doc('technicians/tenant_roster').set({ role: 'technician', fullName: 'Wrong Role' });
});

test('the registry reports technicians that are on the roster but not provisioned as staff', async () => {
  const result = await call(adminGetStaffLifecycle, hrManager, {});
  assert.deepEqual(result.staff.map((row) => row.uid), ['tech_prov']);
  const byUid = Object.fromEntries(result.unprovisionedTechnicians.map((row) => [row.uid, row]));
  assert.deepEqual(Object.keys(byUid).sort(), ['tech_legacy', 'tech_legacy_disabled', 'tech_roster_only', 'tenant_roster']);
  assert.equal(byUid.tech_legacy.reason, 'NOT_PROVISIONED_AS_STAFF');
  assert.equal(byUid.tech_legacy.displayName, 'Muhammed');
  assert.equal(byUid.tech_legacy.specialization, 'AC');
  assert.equal(byUid.tech_legacy.onDispatchRoster, true);
  assert.equal(byUid.tech_legacy.adoptable, true);
  assert.equal(byUid.tech_legacy.email, 'tech_legacy@example.invalid', 'managers see the email');
  assert.equal(byUid.tech_roster_only.reason, 'NO_USER_PROFILE');
  assert.equal(byUid.tech_roster_only.adoptable, false);
  assert.equal(byUid.tenant_roster.reason, 'ROLE_MISMATCH');
  assert.equal(byUid.tenant_roster.adoptable, false);
  assert.equal(result.success, true);
  assert.deepEqual([...result.unavailableSections], []);

  const reader = await call(adminGetStaffLifecycle, hrStaff, {});
  assert.equal(reader.unprovisionedTechnicians.find((row) => row.uid === 'tech_legacy').email, null, 'emails stay manager-only');
});

test('only an MFA Founder/Admin can adopt, with a reason, and only an eligible technician', async () => {
  assert.equal(typeof adminAdoptTechnicianIntoStaffRegistry?.run, 'function');
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, undefined, { uid: 'tech_legacy', reason: REASON }), 'unauthenticated');
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, hrManager, { uid: 'tech_legacy', reason: REASON }), 'permission-denied');
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, founderNoMfa, { uid: 'tech_legacy', reason: REASON }), 'permission-denied');
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, founder, { uid: 'tech_legacy', reason: 'ok' }), 'invalid-argument');
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, founder, { uid: 'tech_roster_only', reason: REASON }), 'not-found');
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, founder, { uid: 'tech_prov', reason: REASON }), 'already-exists');
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, founder, { uid: 'founder_reg', reason: REASON }), 'permission-denied');
  await db.doc('users/tech_legacy').set({ status: 'OFFBOARDED' }, { merge: true });
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, founder, { uid: 'tech_legacy', reason: REASON }), 'failed-precondition');
  const user = (await db.doc('users/tech_legacy').get()).data();
  assert.equal(user.isStaff, undefined, 'refused adoption writes nothing');
  assert.deepEqual((await admin.auth().getUser('tech_legacy')).customClaims, { role: 'technician', testAccount: true }, 'claims restored after a refused write');
  assert.equal((await db.doc('staffAccess/tech_legacy').get()).exists, false);
  assert.equal((await db.collection('audit_logs').get()).size, 0);
});

test('adoption adds staff markers and empty HR shells, keeps the role, and is audited', async () => {
  const result = await call(adminAdoptTechnicianIntoStaffRegistry, founder, { uid: 'tech_legacy', reason: REASON });
  assert.equal(result.success, true);
  assert.equal(result.suspended, false);
  const user = (await db.doc('users/tech_legacy').get()).data();
  assert.equal(user.isStaff, true);
  assert.equal(user.role, 'technician');
  assert.equal(user.status, 'active', 'status unchanged');
  assert.equal(user.adoptedIntoStaffRegistryBy, founder.uid);
  const access = (await db.doc('staffAccess/tech_legacy').get()).data();
  assert.equal(access.role, 'technician');
  assert.equal(access.active, true);
  const privateHr = (await db.doc('private_hr_profiles/tech_legacy').get()).data();
  assert.equal(privateHr.employeeId, null);
  assert.equal(privateHr.emiratesId, null);
  assert.equal(privateHr.salaryPackage, undefined, 'no salary invented');
  assert.equal((await db.doc('hrProfiles/tech_legacy').get()).data().specialization, 'AC');
  const claims = (await admin.auth().getUser('tech_legacy')).customClaims;
  assert.equal(claims.role, 'technician');
  assert.equal(claims.isStaff, true);
  assert.equal(claims.admin, false);
  assert.equal(claims.suspended, false);
  assert.equal(claims.testAccount, true, 'existing claims preserved');
  const audit = (await db.doc(`audit_logs/${result.auditId}`).get()).data();
  assert.equal(audit.action, 'ADMIN_ADOPT_TECHNICIAN_INTO_STAFF_REGISTRY');
  assert.equal(audit.actorId, founder.uid);
  assert.equal(audit.reason, REASON);
  assert.equal(audit.mfaVerified, true);
  assert.equal(audit.after.onDispatchRoster, true);

  const registry = await call(adminGetStaffLifecycle, hrManager, {});
  assert.deepEqual(registry.staff.map((row) => row.uid).sort(), ['tech_legacy', 'tech_prov']);
  assert.ok(!registry.unprovisionedTechnicians.some((row) => row.uid === 'tech_legacy'));
  // HR operations now accept the technician (they required isStaff before).
  const doc = await call(adminRegisterHrDocumentMetadata, hrManager, { uid: 'tech_legacy', documentType: 'DRIVING_LICENCE', storagePath: 'privateHrDocuments/tech_legacy/dl.pdf' });
  assert.ok(doc.documentId);
  await expectHttpsError(call(adminAdoptTechnicianIntoStaffRegistry, founder, { uid: 'tech_legacy', reason: REASON }), 'already-exists');
});

test('a disabled technician is adopted suspended, never re-activated', async () => {
  const result = await call(adminAdoptTechnicianIntoStaffRegistry, founder, { uid: 'tech_legacy_disabled', reason: REASON });
  assert.equal(result.suspended, true);
  assert.equal((await db.doc('staffAccess/tech_legacy_disabled').get()).data().active, false);
  assert.equal((await admin.auth().getUser('tech_legacy_disabled')).customClaims.suspended, true);
  assert.equal((await admin.auth().getUser('tech_legacy_disabled')).disabled, true);
});
