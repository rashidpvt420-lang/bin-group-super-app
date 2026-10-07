'use strict';
// Regression: technician dispatch readiness (adminAssignTechnician, availability GPS, resume duty)
// requires a verified medical card, driving licence and certifications, but nothing in the product
// could record them. adminRecordTechnicianCredentials lets Founder/Admin or an HR Manager (MFA)
// record the outcome of checking original documents. Values always come from the reviewer; the
// callable never invents them, refuses expired/implausible dates, and audits every change.
const assert = require('node:assert/strict');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminRecordTechnicianCredentials } = lib('runtimeAll.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };
const TECH = 'tech_cred_1';

function futureDate(days) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
function pastDate(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}
function verifiedPayload(extra = {}) {
  return {
    technicianId: TECH,
    reviewNote: 'Checked original Emirates medical card, RTA licence and DEWA certificate in person.',
    medicalCard: { decision: 'VERIFIED', expiryDate: futureDate(200), documentReference: 'MC-TEST-001' },
    drivingLicence: { decision: 'VERIFIED', expiryDate: futureDate(400), documentReference: 'DL-TEST-002' },
    certifications: [{ name: 'HVAC Technician', decision: 'VERIFIED', expiryDate: futureDate(300), documentReference: 'CERT-TEST-003' }],
    ...extra,
  };
}

let hr;
let hrNoMfa;
let founder;
let dispatcher;
let technician;
let staleToken;
test.before(async () => {
  hr = await createUser('hr_cred_mgr', { role: 'hr_manager' }, MFA);
  hrNoMfa = await createUser('hr_cred_nomfa', { role: 'hr_manager' });
  founder = await createUser('founder_cred', { role: 'super_admin', admin: true, super_admin: true }, MFA);
  dispatcher = await createUser('dispatch_cred', { role: 'dispatcher' }, MFA);
  technician = await createUser(TECH, { role: 'technician' }, MFA);
  // Token still claims HR Manager, but the live account was demoted.
  staleToken = await createUser('hr_cred_demoted', { role: 'tenant' }, MFA);
  staleToken.token.role = 'hr_manager';
});

test.beforeEach(async () => {
  await clearFirestore();
  const base = { role: 'technician', status: 'active', approvalStatus: 'approved', fullName: 'Test Technician' };
  await db.doc(`users/${TECH}`).set(base);
  await db.doc(`technicians/${TECH}`).set({ ...base, primaryTrade: 'HVAC' });
  await db.doc('users/tenant_cred').set({ role: 'tenant' });
});

test('only an MFA Founder/Admin or HR Manager may record credentials', async () => {
  assert.equal(typeof adminRecordTechnicianCredentials?.run, 'function', 'callable must be exported from the runtime');
  await expectHttpsError(call(adminRecordTechnicianCredentials, undefined, verifiedPayload()), 'unauthenticated');
  await expectHttpsError(call(adminRecordTechnicianCredentials, dispatcher, verifiedPayload()), 'permission-denied');
  await expectHttpsError(call(adminRecordTechnicianCredentials, technician, verifiedPayload()), 'permission-denied');
  await expectHttpsError(call(adminRecordTechnicianCredentials, staleToken, verifiedPayload()), 'permission-denied');
  const mfaError = await expectHttpsError(call(adminRecordTechnicianCredentials, hrNoMfa, verifiedPayload()), 'permission-denied');
  assert.match(mfaError.message, /multi-factor \(MFA\) session is required/);
  const user = (await db.doc(`users/${TECH}`).get()).data();
  assert.equal(user.medicalCardStatus, undefined, 'refused calls must not write anything');
  assert.equal((await db.collection('audit_logs').get()).size, 0);
});

test('HR Manager records verified documents on both profiles with an audit trail', async () => {
  const payload = verifiedPayload();
  const result = await call(adminRecordTechnicianCredentials, hr, payload);
  assert.equal(result.status, 'SUCCESS');
  for (const failure of ['medical card', 'driving licence', 'required certifications']) {
    assert.ok(!result.remainingReadinessFailures.includes(failure), `${failure} should now be satisfied`);
  }
  assert.ok(result.remainingReadinessFailures.includes('active shift'), 'the tool does not fake shift/GPS readiness');

  for (const path of [`users/${TECH}`, `technicians/${TECH}`]) {
    const doc = (await db.doc(path).get()).data();
    assert.equal(doc.medicalCardStatus, 'verified', path);
    assert.equal(doc.drivingLicenseStatus, 'verified', path);
    assert.equal(doc.certificationsStatus, 'verified', path);
    assert.equal(doc.medicalCardReference, 'MC-TEST-001');
    assert.equal(doc.medicalCardVerifiedBy, hr.uid);
    assert.equal(doc.credentialsReviewedBy, hr.uid);
    assert.equal(doc.medicalCardExpiry.toDate().toISOString().slice(0, 10), payload.medicalCard.expiryDate);
    assert.equal(doc.certifications.length, 1);
    assert.equal(doc.certifications[0].name, 'HVAC Technician');
    assert.equal(doc.certifications[0].status, 'verified');
  }

  const audit = (await db.doc(`audit_logs/${result.auditId}`).get()).data();
  assert.equal(audit.action, 'ADMIN_RECORD_TECHNICIAN_CREDENTIALS');
  assert.equal(audit.actorId, hr.uid);
  assert.equal(audit.actorRole, 'hr_manager');
  assert.equal(audit.targetId, TECH);
  assert.equal(audit.mfaVerified, true);
  assert.equal(audit.before.medicalCardStatus, null);
  assert.equal(audit.after.medicalCardStatus, 'verified');
  assert.equal(audit.decisions.drivingLicence, 'VERIFIED');
  assert.match(audit.reviewNote, /original/);
});

test('a rejected document is recorded as rejected and keeps the technician out of dispatch', async () => {
  const result = await call(adminRecordTechnicianCredentials, founder, {
    technicianId: TECH,
    reviewNote: 'Medical card photo did not match the original; asked technician to re-submit.',
    medicalCard: { decision: 'REJECTED' },
  });
  assert.ok(result.remainingReadinessFailures.includes('medical card'));
  const doc = (await db.doc(`technicians/${TECH}`).get()).data();
  assert.equal(doc.medicalCardStatus, 'rejected');
  assert.equal(doc.medicalCardExpiry, null);
  assert.equal(doc.drivingLicenseStatus, undefined, 'untouched credentials stay untouched');
});

test('invalid or invented values are refused', async () => {
  const cases = [
    verifiedPayload({ medicalCard: { decision: 'VERIFIED', documentReference: 'MC-1' } }),
    verifiedPayload({ medicalCard: { decision: 'VERIFIED', expiryDate: pastDate(2), documentReference: 'MC-1' } }),
    verifiedPayload({ medicalCard: { decision: 'VERIFIED', expiryDate: '2027-02-30', documentReference: 'MC-1' } }),
    verifiedPayload({ medicalCard: { decision: 'VERIFIED', expiryDate: futureDate(365 * 30), documentReference: 'MC-1' } }),
    verifiedPayload({ medicalCard: { decision: 'VERIFIED', expiryDate: futureDate(100) } }),
    verifiedPayload({ medicalCard: { decision: 'MAYBE', expiryDate: futureDate(100), documentReference: 'MC-1' } }),
    verifiedPayload({ certifications: [] }),
    verifiedPayload({ certifications: [{ decision: 'VERIFIED', expiryDate: futureDate(100), documentReference: 'C-1' }] }),
    verifiedPayload({ reviewNote: 'ok' }),
    { technicianId: TECH, reviewNote: 'Checked the original documents in the office.' },
    verifiedPayload({ technicianId: '' }),
  ];
  for (const payload of cases) {
    await expectHttpsError(call(adminRecordTechnicianCredentials, hr, payload), 'invalid-argument');
  }
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, verifiedPayload({ technicianId: 'tenant_cred' })), 'failed-precondition');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, verifiedPayload({ technicianId: 'missing_tech' })), 'not-found');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, verifiedPayload({ technicianId: hr.uid })), 'permission-denied');
  const doc = (await db.doc(`users/${TECH}`).get()).data();
  assert.equal(doc.medicalCardStatus, undefined);
  assert.equal((await db.collection('audit_logs').get()).size, 0);
});

test('a pending credential renewal request is closed by the review, once', async () => {
  await db.doc('technician_credential_renewals/renew_1').set({ technicianId: TECH, status: 'PENDING_ADMIN_REVIEW', reviewState: 'PENDING_ADMIN_REVIEW', credentialType: 'medical_card' });
  await db.doc('technician_credential_renewals/renew_other').set({ technicianId: 'someone_else', status: 'PENDING_ADMIN_REVIEW' });
  await db.doc(`users/${TECH}`).set({ credentialRenewalPending: true, credentialRenewalStatus: 'PENDING_ADMIN_REVIEW' }, { merge: true });

  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, verifiedPayload({ renewalRequestId: 'renew_other' })), 'not-found');
  const result = await call(adminRecordTechnicianCredentials, hr, verifiedPayload({ renewalRequestId: 'renew_1' }));
  const renewal = (await db.doc('technician_credential_renewals/renew_1').get()).data();
  assert.equal(renewal.status, 'APPROVED');
  assert.equal(renewal.reviewedBy, hr.uid);
  const user = (await db.doc(`users/${TECH}`).get()).data();
  assert.equal(user.credentialRenewalPending, false);
  assert.equal(user.credentialRenewalStatus, 'APPROVED');
  const audit = (await db.doc(`audit_logs/${result.auditId}`).get()).data();
  assert.equal(audit.renewalRequestId, 'renew_1');

  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, verifiedPayload({ renewalRequestId: 'renew_1' })), 'failed-precondition');
});

test('the HR staff details read returns the recorded status; references stay manager-only', async () => {
  const { adminGetStaffDetails } = lib('runtimeAll.js');
  const hrStaff = await createUser('hr_cred_reader', { role: 'hr_staff' }, MFA);
  await db.doc(`users/${TECH}`).set({ isStaff: true }, { merge: true });
  await call(adminRecordTechnicianCredentials, hr, verifiedPayload());

  const manager = await call(adminGetStaffDetails, hr, { uid: TECH });
  assert.equal(manager.staff.credentials.medicalCardStatus, 'verified');
  assert.equal(manager.staff.credentials.medicalCardReference, 'MC-TEST-001');
  assert.equal(manager.staff.credentials.certifications[0].name, 'HVAC Technician');
  assert.ok(manager.staff.credentials.drivingLicenseExpiry);

  const reader = await call(adminGetStaffDetails, hrStaff, { uid: TECH });
  assert.equal(reader.staff.credentials.medicalCardStatus, 'verified');
  assert.equal(reader.staff.credentials.medicalCardReference, null);
  assert.equal(reader.staff.credentials.certifications[0].documentReference, null);
});
