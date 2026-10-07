'use strict';
// Regression: HR Documents (HR Management) already accepted CERTIFICATE and DRIVING_LICENCE uploads
// and technicians upload driving licences / trade certificates in the staff vault, but nothing
// linked those documents to the readiness fields secureAdminTechnicianAssignment reads
// (medicalCardStatus, drivingLicenseStatus, certificationsStatus). An upload alone must never make
// a credential valid; an MFA Admin/HR Manager verifies the document with the expiry from the
// original, which links it and sets the technician's readiness status - audited.
const assert = require('node:assert/strict');
const test = require('node:test');
const { db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { adminRecordTechnicianCredentials, adminRegisterHrDocumentMetadata, adminGetHrOperations } = lib('runtimeAll.js');
const MFA = { tokenExtra: { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } } };
const TECH = 'tech_hrdoc_1';
const OTHER = 'tech_hrdoc_2';
const futureDate = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const NOTE = 'Opened the registered file and checked the original card in the office.';

let hr;
let hrStaff;
let dispatcher;
test.before(async () => {
  hr = await createUser('hr_hrdoc_mgr', { role: 'hr_manager' }, MFA);
  hrStaff = await createUser('hr_hrdoc_staff', { role: 'hr_staff' }, MFA);
  dispatcher = await createUser('dispatch_hrdoc', { role: 'dispatcher' }, MFA);
  await createUser(TECH, { role: 'technician' }, MFA);
});

test.beforeEach(async () => {
  await clearFirestore();
  for (const uid of [TECH, OTHER]) {
    const base = { role: 'technician', isStaff: true, status: 'active', approvalStatus: 'approved', fullName: uid };
    await db.doc(`users/${uid}`).set(base);
    await db.doc(`technicians/${uid}`).set({ ...base, primaryTrade: 'HVAC' });
  }
});

async function registerHrDocument(uid, documentType, extra = {}) {
  const result = await call(adminRegisterHrDocumentMetadata, hr, {
    uid, documentType, storagePath: `privateHrDocuments/${uid}/${documentType.toLowerCase()}.pdf`, fileName: `${documentType}.pdf`, expiryDate: futureDate(500), ...extra,
  });
  return result.documentId;
}

test('registering a credential document never marks the technician credential valid', async () => {
  const id = await registerHrDocument(TECH, 'MEDICAL_CARD');
  const doc = (await db.doc(`staffHrDocuments/${id}`).get()).data();
  assert.equal(doc.documentType, 'MEDICAL_CARD');
  assert.equal(doc.verificationStatus, 'UNVERIFIED');
  for (const path of [`users/${TECH}`, `technicians/${TECH}`]) {
    const profile = (await db.doc(path).get()).data();
    assert.equal(profile.medicalCardStatus, undefined, `${path}: upload alone must not set readiness`);
    assert.equal(profile.medicalCardExpiry, undefined);
  }
  const other = await registerHrDocument(TECH, 'EMPLOYMENT_CONTRACT');
  assert.equal((await db.doc(`staffHrDocuments/${other}`).get()).data().verificationStatus, undefined, 'non-credential documents are not verification items');
});

test('verifying an HR-registered medical card links it and sets readiness status/expiry, audited', async () => {
  const id = await registerHrDocument(TECH, 'MEDICAL_CARD');
  const expiryDate = futureDate(250);
  const result = await call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, medicalCard: { decision: 'VERIFIED', expiryDate, hrDocumentId: id } });
  assert.ok(!result.remainingReadinessFailures.includes('medical card'));
  for (const path of [`users/${TECH}`, `technicians/${TECH}`]) {
    const profile = (await db.doc(path).get()).data();
    assert.equal(profile.medicalCardStatus, 'verified');
    assert.equal(profile.medicalCardExpiry.toDate().toISOString().slice(0, 10), expiryDate);
    assert.equal(profile.medicalCardDocumentPath, `staffHrDocuments/${id}`);
    assert.equal(profile.medicalCardReference, `staffHrDocuments/${id}`, 'linked document is the reference when no number was typed');
    assert.equal(profile.medicalCardVerifiedBy, hr.uid);
  }
  const doc = (await db.doc(`staffHrDocuments/${id}`).get()).data();
  assert.equal(doc.verificationStatus, 'VERIFIED');
  assert.equal(doc.credentialVerification.credential, 'medicalCard');
  assert.equal(doc.credentialVerification.expiryDate, expiryDate);
  assert.equal(doc.credentialVerification.reviewedBy, hr.uid);
  assert.equal(doc.credentialVerification.auditId, result.auditId);
  assert.equal(doc.expiryDate, expiryDate, 'register shows the verified expiry');
  const audit = (await db.doc(`audit_logs/${result.auditId}`).get()).data();
  assert.equal(audit.action, 'ADMIN_RECORD_TECHNICIAN_CREDENTIALS');
  assert.equal(audit.mfaVerified, true);
  assert.deepEqual(audit.linkedDocuments, [{ credential: 'medicalCard', path: `staffHrDocuments/${id}`, decision: 'VERIFIED' }]);

  const ops = await call(adminGetHrOperations, hr, {});
  assert.equal(ops.documents.find((entry) => entry.id === id).verificationStatus, 'VERIFIED');
});

test('a linked document must belong to the technician, match the credential and be unique', async () => {
  const insurance = await registerHrDocument(TECH, 'MEDICAL_INSURANCE');
  const otherCard = await registerHrDocument(OTHER, 'MEDICAL_CARD');
  const licence = await registerHrDocument(TECH, 'DRIVING_LICENCE');
  const card = await registerHrDocument(TECH, 'MEDICAL_CARD');
  const verified = (extra) => ({ decision: 'VERIFIED', expiryDate: futureDate(100), ...extra });
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, medicalCard: verified({ hrDocumentId: insurance }) }), 'failed-precondition');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, medicalCard: verified({ hrDocumentId: otherCard }) }), 'failed-precondition');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, medicalCard: verified({ hrDocumentId: licence }) }), 'failed-precondition');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, medicalCard: verified({ hrDocumentId: 'missing_doc' }) }), 'not-found');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, medicalCard: verified({ hrDocumentId: card, staffDocumentId: 'x' }) }), 'invalid-argument');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, medicalCard: { decision: 'VERIFIED', hrDocumentId: card } }), 'invalid-argument');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, {
    technicianId: TECH, reviewNote: NOTE, drivingLicence: verified({ hrDocumentId: licence }), certifications: [{ name: 'HVAC', ...verified({ hrDocumentId: licence }) }],
  }), 'invalid-argument');
  await db.doc(`staffHrDocuments/${card}`).set({ status: 'ARCHIVED' }, { merge: true });
  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, medicalCard: verified({ hrDocumentId: card }) }), 'failed-precondition');
  // Not MFA Admin/HR Manager.
  await registerHrDocument(TECH, 'MEDICAL_CARD');
  await expectHttpsError(call(adminRecordTechnicianCredentials, hrStaff, { technicianId: TECH, reviewNote: NOTE, medicalCard: verified({ hrDocumentId: card }) }), 'permission-denied');
  await expectHttpsError(call(adminRecordTechnicianCredentials, dispatcher, { technicianId: TECH, reviewNote: NOTE, medicalCard: verified({ hrDocumentId: card }) }), 'permission-denied');

  const profile = (await db.doc(`technicians/${TECH}`).get()).data();
  assert.equal(profile.medicalCardStatus, undefined, 'refused calls write nothing');
  assert.equal(profile.drivingLicenseStatus, undefined);
  assert.equal((await db.doc(`staffHrDocuments/${licence}`).get()).data().verificationStatus, 'UNVERIFIED');
  assert.equal((await db.collection('audit_logs').where('action', '==', 'ADMIN_RECORD_TECHNICIAN_CREDENTIALS').get()).size, 0);
});

test('technician vault uploads can be verified or rejected; one certificate does not erase others', async () => {
  await db.doc('staffDocuments/up_licence').set({ uid: TECH, documentType: 'driving_license', fileName: 'licence.jpg', status: 'pending_hr_review', createdAt: new Date() });
  await db.doc('staffDocuments/up_cert').set({ uid: TECH, documentType: 'trade_certificate', fileName: 'cert.pdf', status: 'pending_hr_review', createdAt: new Date() });
  await db.doc('staffDocuments/up_passport').set({ uid: TECH, documentType: 'passport', fileName: 'passport.pdf', status: 'pending_hr_review', createdAt: new Date() });
  await db.doc(`technicians/${TECH}`).set({ certifications: [{ name: 'Electrical Safety', status: 'verified', documentReference: 'ES-1' }], certificationsStatus: 'verified' }, { merge: true });

  const ops = await call(adminGetHrOperations, hr, {});
  assert.deepEqual(ops.staffUploads.map((entry) => entry.id).sort(), ['up_cert', 'up_licence', 'up_passport']);

  await expectHttpsError(call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, drivingLicence: { decision: 'VERIFIED', expiryDate: futureDate(300), staffDocumentId: 'up_passport' } }), 'failed-precondition');
  await call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, drivingLicence: { decision: 'VERIFIED', expiryDate: futureDate(300), documentReference: 'DL-778', staffDocumentId: 'up_licence' } });
  await call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: NOTE, certifications: [{ name: 'HVAC Technician', decision: 'VERIFIED', expiryDate: futureDate(200), staffDocumentId: 'up_cert' }] });

  const profile = (await db.doc(`technicians/${TECH}`).get()).data();
  assert.equal(profile.drivingLicenseStatus, 'verified');
  assert.equal(profile.drivingLicenseReference, 'DL-778');
  assert.equal(profile.drivingLicenseDocumentPath, 'staffDocuments/up_licence');
  assert.deepEqual(profile.certifications.map((item) => item.name), ['Electrical Safety', 'HVAC Technician']);
  assert.equal(profile.certifications[1].documentPath, 'staffDocuments/up_cert');
  assert.equal(profile.certificationsStatus, 'verified');
  assert.equal((await db.doc('staffDocuments/up_licence').get()).data().status, 'hr_verified');
  assert.equal((await db.doc('staffDocuments/up_passport').get()).data().status, 'pending_hr_review');

  await call(adminRecordTechnicianCredentials, hr, { technicianId: TECH, reviewNote: 'Certificate photo is illegible; asked for the original.', certifications: [{ name: 'HVAC Technician', decision: 'REJECTED', staffDocumentId: 'up_cert' }] });
  const after = (await db.doc(`technicians/${TECH}`).get()).data();
  assert.equal(after.certifications.length, 2, 're-review replaces the same-name entry');
  assert.equal(after.certificationsStatus, 'rejected');
  const cert = (await db.doc('staffDocuments/up_cert').get()).data();
  assert.equal(cert.status, 'hr_rejected');
  assert.equal(cert.credentialVerification.status, 'REJECTED');
  assert.equal(cert.credentialVerification.expiryDate, null);
});
