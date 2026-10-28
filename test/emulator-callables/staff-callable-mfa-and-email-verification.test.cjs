'use strict';
// PR B behavioural coverage (runs against the local Auth + Firestore emulators):
//  1. Staff-callable MFA: the staff operating-system, staff PDF/HR-document and technician callables accepted
//     Admin / CEO claims without a second factor. Admin / CEO claims now need the N-05 MFA session; ordinary
//     staff and technicians are not asked for MFA.
//  2. assignPublicPortalRole: email/password sign-ins must have a verified email; Google / phone sign-ins and
//     verified password accounts are not blocked by that rule.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call } = require('./_setup.cjs');

const runtime = lib('runtimeAll.js');
const MFA_ERROR = /multi-factor \(MFA\) session is required/;
const ADMIN_CLAIMS = { role: 'admin', admin: true };
const CEO_CLAIMS = { role: 'ceo' };
const MFA_TOKEN = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };

const STAFF_CALLABLES = [
  'submitStaffQuickAction', 'completeStaffJobWithAi', 'requestStaffOvertime', 'triggerStaffShiftFinish',
  'executeMultiDeptAutomation', 'resolveStaffException', 'getStaffExceptionsQueue', 'runStaffAiAudit',
  'generateStaffAttendancePdf', 'generateStaffOvertimePdf', 'generateStaffPayslipPdf', 'issueOfficialStaffHrDocument',
];
const TECHNICIAN_CALLABLES = ['getTechnicianOperationalReadiness', 'resumeTechnicianDuty', 'acceptTechnicianTicket', 'updateTicketLifecycle'];

let adminNoMfa; let adminMfa; let ceoNoMfa; let ceoMfa; let staffNoMfa; let techNoMfa;
test.before(async () => {
  adminNoMfa = await createUser('prb_admin_nomfa', ADMIN_CLAIMS);
  adminMfa = await createUser('prb_admin_mfa', ADMIN_CLAIMS, { tokenExtra: MFA_TOKEN });
  ceoNoMfa = await createUser('prb_ceo_nomfa', CEO_CLAIMS);
  ceoMfa = await createUser('prb_ceo_mfa', CEO_CLAIMS, { tokenExtra: MFA_TOKEN });
  staffNoMfa = await createUser('prb_staff', { role: 'staff' });
  techNoMfa = await createUser('prb_tech', { role: 'technician' });
});
test.beforeEach(clearFirestore);

async function outcome(name, actor, data = {}) {
  try {
    await call(runtime[name], actor, data);
    return { ok: true, message: '' };
  } catch (error) {
    return { ok: false, code: error?.code, message: String(error?.message || ''), details: error?.details };
  }
}

for (const name of [...STAFF_CALLABLES, ...TECHNICIAN_CALLABLES]) {
  test(`${name}: Admin claims without a second factor are denied`, async () => {
    assert.equal(typeof runtime[name]?.run, 'function', `${name} must be exported`);
    const result = await outcome(name, adminNoMfa);
    assert.equal(result.ok, false, `${name} must not succeed without MFA`);
    assert.equal(result.code, 'permission-denied', `${name}: ${result.code} ${result.message}`);
    assert.match(result.message, MFA_ERROR, `${name}: ${result.message}`);
  });
}

for (const name of STAFF_CALLABLES) {
  test(`${name}: CEO claims without a second factor are denied`, async () => {
    const result = await outcome(name, ceoNoMfa);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'permission-denied', `${name}: ${result.code} ${result.message}`);
    assert.match(result.message, MFA_ERROR, `${name}: ${result.message}`);
  });
  test(`${name}: Admin and CEO with an MFA session pass the MFA gate (then apply their own validation)`, async () => {
    for (const actor of [adminMfa, ceoMfa]) {
      const result = await outcome(name, actor);
      assert.doesNotMatch(result.message, MFA_ERROR, `${name}: ${result.message}`);
    }
  });
  test(`${name}: ordinary staff are never asked for MFA`, async () => {
    const result = await outcome(name, staffNoMfa);
    assert.doesNotMatch(result.message, MFA_ERROR, `${name}: ${result.message}`);
  });
}

for (const name of TECHNICIAN_CALLABLES) {
  test(`${name}: Admin with an MFA session passes the MFA gate`, async () => {
    const result = await outcome(name, adminMfa);
    assert.doesNotMatch(result.message, MFA_ERROR, `${name}: ${result.message}`);
  });
  test(`${name}: a technician is never asked for MFA`, async () => {
    const result = await outcome(name, techNoMfa);
    assert.doesNotMatch(result.message, MFA_ERROR, `${name}: ${result.message}`);
  });
}

// ---- assignPublicPortalRole email verification ---------------------------------------------------------------
const NOT_VERIFIED = /Verify your email address/;

async function publicUser(uid, { emailVerified, provider, providerData }) {
  const email = `${uid}@example.invalid`;
  try {
    await admin.auth().createUser({ uid, email, emailVerified });
  } catch (error) {
    if (error?.code !== 'auth/uid-already-exists') throw error;
    await admin.auth().updateUser(uid, { emailVerified });
  }
  await admin.auth().setCustomUserClaims(uid, {});
  return { uid, token: { email, email_verified: emailVerified, firebase: { sign_in_provider: provider, ...(providerData ? { identities: providerData } : {}) } } };
}

test('assignPublicPortalRole refuses an unverified email/password account with a machine-readable reason', async () => {
  const actor = await publicUser('prb_pw_unverified', { emailVerified: false, provider: 'password' });
  const result = await outcome('assignPublicPortalRole', actor, { role: 'tenant' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'failed-precondition');
  assert.match(result.message, NOT_VERIFIED);
  assert.equal(result.details?.reason, 'email_not_verified');
  const user = await admin.auth().getUser('prb_pw_unverified');
  assert.equal(user.customClaims?.role, undefined, 'no role claim may be written for an unverified account');
});

test('assignPublicPortalRole ignores a stale email_verified=true token for an unverified account (live Auth record wins)', async () => {
  const actor = await publicUser('prb_pw_stale', { emailVerified: false, provider: 'password' });
  actor.token.email_verified = true;
  const result = await outcome('assignPublicPortalRole', actor, { role: 'tenant' });
  assert.equal(result.ok, false);
  assert.equal(result.details?.reason, 'email_not_verified');
});

test('assignPublicPortalRole lets a verified email/password account choose a role', async () => {
  const actor = await publicUser('prb_pw_verified', { emailVerified: true, provider: 'password' });
  await db.doc('users/prb_pw_verified').set({ email: actor.token.email });
  const result = await outcome('assignPublicPortalRole', actor, { role: 'tenant' });
  assert.doesNotMatch(result.message, NOT_VERIFIED, result.message);
  assert.notEqual(result.details?.reason, 'email_not_verified');
});

test('assignPublicPortalRole does not apply the email rule to Google or phone sign-ins', async () => {
  const google = await publicUser('prb_google', { emailVerified: false, provider: 'google.com' });
  const phone = await publicUser('prb_phone', { emailVerified: false, provider: 'phone' });
  for (const actor of [google, phone]) {
    const result = await outcome('assignPublicPortalRole', actor, { role: 'tenant' });
    assert.notEqual(result.details?.reason, 'email_not_verified', `${actor.uid}: ${result.message}`);
    assert.doesNotMatch(result.message, NOT_VERIFIED, `${actor.uid}: ${result.message}`);
  }
});

test('assignPublicPortalRole stays idempotent for an account that already holds the same role', async () => {
  const actor = await publicUser('prb_pw_existing', { emailVerified: false, provider: 'password' });
  await admin.auth().setCustomUserClaims('prb_pw_existing', { role: 'tenant' });
  const result = await outcome('assignPublicPortalRole', actor, { role: 'tenant' });
  assert.notEqual(result.details?.reason, 'email_not_verified', result.message);
});
