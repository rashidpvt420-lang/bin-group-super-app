'use strict';
// N-17 regression: the Admin login audit must be recorded by the server. The browser write
// the admin panel used (addDoc audit_logs) is denied by rules, so the server callable
// registerAdminSecuritySession is now the login audit path. This pins its audit behaviour.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { registerAdminSecuritySession } = lib('adminSecurityProfile.js');

async function auditFor(uid) {
  const snap = await db.collection('audit_logs').where('actorId', '==', uid).get();
  return snap.docs.map((document) => document.data());
}

test.beforeEach(clearFirestore);

test('an MFA-verified Admin login writes a server audit entry and an active security session', async () => {
  const actor = await createUser('admin_n17_mfa', { role: 'admin', admin: true }, {
    multiFactor: { enrolledFactors: [{ phoneNumber: '+15555550117', factorId: 'phone' }] },
    tokenExtra: { firebase: { sign_in_second_factor: 'phone' } },
  });
  const result = await call(registerAdminSecuritySession, actor, { language: 'en' });
  assert.ok(result.sessionId);
  const entries = await auditFor(actor.uid);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, 'ADMIN_SECURITY_SESSION_REGISTERED_WITH_MFA');
  assert.equal(entries[0].mfaVerified, true);
  assert.equal(entries[0].targetId, result.sessionId);
  const session = (await db.doc(`admin_security_sessions/${result.sessionId}`).get()).data();
  assert.equal(session.status, 'ACTIVE');
  assert.equal(session.adminUid, actor.uid);
});

test('a non-enrolled Admin login is audited as requiring MFA enrollment', async () => {
  const actor = await createUser('admin_n17_enrol', { role: 'admin', admin: true });
  const result = await call(registerAdminSecuritySession, actor, { language: 'ar' });
  assert.equal(result.mfaEnrollmentRequired, true);
  const entries = await auditFor(actor.uid);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].action, 'ADMIN_SECURITY_SESSION_REGISTERED_FOR_MFA_ENROLLMENT');
});

test('an enrolled Admin token without a verified second factor is refused and not recorded as a login', async () => {
  const actor = await createUser('admin_n17_nosecond', { role: 'admin', admin: true }, {
    multiFactor: { enrolledFactors: [{ phoneNumber: '+15555550118', factorId: 'phone' }] },
  });
  await expectHttpsError(call(registerAdminSecuritySession, actor, {}), 'permission-denied');
  assert.equal((await auditFor(actor.uid)).length, 0);
});

test('a non-staff user cannot register an Admin security session', async () => {
  const actor = await createUser('owner_n17', { role: 'owner' });
  await expectHttpsError(call(registerAdminSecuritySession, actor, {}), 'permission-denied');
  assert.equal((await auditFor(actor.uid)).length, 0);
});
