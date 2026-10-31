'use strict';
// Step 2 (owner onboarding end to end): retries and duplicate submissions at every stage must not
// create duplicate records, and nothing may activate before Finance approval of evidenced payment.
// Chain: server quote -> OTP-bound submission (registration, property + device GPS) -> inspection
// evidence fixture -> final signature fixture -> cash evidence (Finance A) -> approval (Finance B)
// -> ACTIVE + PAID invoice. Emulator only (demo- project).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const { submitOwnerInspectionFirstOnboarding } = lib('canonicalOwnerSubmission.js');
const { previewOwnerInspectionQuote, adminRecordOwnerMobilizationPaymentEvidence } = lib('inspectionFirstOwnerOnboarding.js');
const { adminApprovePayment: secureApprovePayment } = lib('securePaymentApproval.js');
const { adminDecideOwnerApplication } = lib('adminOwnerApplicationDecision.js');

const HASH = 'c'.repeat(64);
const MFA = { firebase: { sign_in_provider: 'password', sign_in_second_factor: 'phone' } };
const now = () => admin.firestore.Timestamp.now();
let owner; let financeA; let financeB; let adminMfa;

test.before(async () => {
  owner = await createUser('owner_step2', { role: 'owner' });
  financeA = await createUser('finance_step2_a', { role: 'finance_admin' }, { tokenExtra: MFA });
  financeB = await createUser('finance_step2_b', { role: 'finance_admin' }, { tokenExtra: MFA });
  adminMfa = await createUser('admin_step2', { role: 'super_admin', admin: true }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

const PROPERTY = {
  id: 'draft_1', propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3,
  slaTier: 'standard', paymentPlan: 'annual', strategy: 'maintenance', address: 'Tower S2, Unit 1, Dubai Marina', city: 'Dubai', area: 'Dubai Marina',
  geo: { lat: 25.08, lng: 55.14, address: 'Tower S2, Unit 1, Dubai Marina', emirate: 'Dubai', city: 'Dubai', area: 'Dubai Marina', source: 'device_gps' },
};

async function docs(intakeId) {
  const paths = {};
  for (const key of ['propertyProof', 'emiratesId', 'passport']) {
    const p = `onboarding-proof/${owner.uid}/${intakeId}/${key}/1_${key}.pdf`;
    await admin.storage().bucket().file(p).save(Buffer.from(`%PDF-1.4 ${key}`), { resumable: false, metadata: { contentType: 'application/pdf', metadata: { ownerUid: owner.uid, docType: key } } });
    paths[key] = p;
  }
  return paths;
}
async function submit(intakeId, prop = PROPERTY) {
  const quote = await call(previewOwnerInspectionQuote, owner, { properties: [prop], selectedAddOns: [] });
  const otpId = `otp_${crypto.randomUUID()}`;
  await db.doc(`contract_signature_otps/${otpId}`).set({ status: 'VERIFIED', uid: owner.uid, contractId: intakeId, contractHash: quote.quoteHash, signature: 'Owner S2', evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 3_600_000) });
  return call(submitOwnerInspectionFirstOnboarding, owner, {
    intakeId, ownerUid: owner.uid, ownerEmail: owner.token.email, properties: [prop], selectedAddOns: [],
    quoteHash: quote.quoteHash, quoteQuotedAtMs: quote.quotedAtMs, signatureName: 'Owner S2', otpVerificationId: otpId, documentPaths: await docs(intakeId),
  });
}
const count = async (col, field, value) => (await db.collection(col).where(field, '==', value).get()).size;
const isActive = async (id) => {
  const [i, c, p] = await Promise.all([db.doc(`intake_submissions/${id}`).get(), db.doc(`contracts/${id}`).get(), db.doc(`payment_transactions/${id}`).get()]);
  return [i.get('ownerOnboardingState'), i.get('status'), c.get('status'), p.get('status')].includes('ACTIVE') || p.get('paymentVerified') === true;
};

// Stage after real submission: inspection evidenced and verified, final quote OTP-signed (fixtures
// mirror d5/f2; the inspection and signature callables need GPS devices and email OTP delivery).
async function advanceToFinalSigned(id) {
  const propRef = db.doc(`properties/${id}_property_1`);
  const prop = (await propRef.get()).data();
  const inspection = {
    id: `insp_${id}`, intakeId: id, propertyId: `${id}_property_1`, ownerUid: owner.uid, status: 'COMPLETED', evidenceStatus: 'VERIFIED',
    evidenceHash: 'd'.repeat(64), evidenceGeneration: '1', checklistVerified: true, visitStartedAt: now(), visitCompletedAt: now(),
    arrivalLocation: { withinRadius: true, lat: 25.0801, lng: 55.1401, expectedLat: 25.08, expectedLng: 55.14, distanceMetres: 15, accuracyMeters: 8, capturedAtMs: Date.now() },
    pricingDriver: 'unit', pricingClass: 'apt-std', pricingVerificationStatus: 'VERIFIED',
    pricingVerification: { units: 1, emirate: 'Dubai', zone: 'B', propertyAge: 3, slaTier: 'standard', paymentPlan: 'annual', floors: 1, lifts: 0, hvac: true, districtCooling: false, fireAlarm: true, firePump: false, sira: false, gen: false, bmu: false, tank: false, pool: false, verifiedMaintenanceRate: 2500 },
  };
  await db.doc(`property_inspections/insp_${id}`).set(inspection);
  const geo = lib('propertyGeoAuthority.js').buildInspectionVerifiedPropertyGeo(prop, inspection, 'emulator-inspector', now());
  await propRef.set({ quoteHash: HASH, ...geo }, { merge: true });
  await db.doc('system_payment_config/current').set({ status: 'ACTIVE', legalBeneficiary: 'BIN GROUP L.L.C - S.P.C', version: 'emulator-fixture-1', effectiveAt: now(), currency: 'AED', approvedMethods: ['CASH', 'CHEQUE'], officeLocation: 'Emulator fixture office' });
  const schedule = { annualContractValue: 1725, activationDeposit: 258.75 };
  await db.doc(`intake_submissions/${id}`).set({ inspectionIds: [`insp_${id}`], inspectionStatus: 'COMPLETED', ownerOnboardingState: 'OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE' }, { merge: true });
  await db.doc(`contracts/${id}`).set({ ...schedule, status: 'OWNER_SIGNED_AWAITING_PAYMENT', inspectionVerified: true, ownerSigned: true, quoteHash: HASH, finalVerifiedQuoteHash: HASH, otpVerificationId: 'otp_final', signedPdfUrl: 'https://example.invalid/c.pdf', signatureState: { ownerSigned: true, pdfUrl: 'https://example.invalid/c.pdf' } }, { merge: true });
  await db.doc(`payment_transactions/${id}`).set({ ...schedule, quoteHash: HASH, inspectionVerified: true, finalVerifiedQuoteHash: HASH, status: 'AWAITING_15_PERCENT_PAYMENT', paymentStatus: 'AWAITING_15_PERCENT_PAYMENT' }, { merge: true });
  await db.doc('contract_signature_otps/otp_final').set({ status: 'VERIFIED', uid: owner.uid, contractId: id, contractHash: HASH, consumedFor: id, signature: 'Owner S2', verifiedAt: now(), consumedAt: now() });
}
const evidence = (id, method = 'CASH') => ({ paymentId: id, paymentReferenceId: `${method}-S2-0001`, paymentMethod: method, ...(method === 'CHEQUE' ? { chequeNumber: '000123', chequeBank: 'Emulator Bank', chequeDate: '2026-11-01' } : {}), filename: 'receipt.pdf', contentType: 'application/pdf', encodedDocument: Buffer.from('%PDF-1.4 step2 receipt').toString('base64') });
function stubSignedUrl(context) {
  const proto = Object.getPrototypeOf(admin.storage().bucket().file('fixture'));
  const orig = proto.getSignedUrl;
  proto.getSignedUrl = async function () { return [`https://example.invalid/${encodeURIComponent(this.name)}`]; };
  context.after(() => { proto.getSignedUrl = orig; });
}

test('submission retry with the same intakeId is idempotent: one application, one property, one contract, one payment row', async () => {
  const id = crypto.randomUUID();
  await submit(id);
  await submit(id);
  await Promise.allSettled([submit(id), submit(id)]);
  assert.equal(await count('properties', 'intakeId', id), 1);
  assert.equal((await db.collection('intake_submissions').where('ownerUid', '==', owner.uid).get()).size, 1);
  assert.equal((await db.doc(`contracts/${id}`).get()).exists, true);
  assert.equal(await isActive(id), false, 'submission never activates');
});

test('a resubmission under a fresh intakeId for the same property address is refused (no duplicate application)', async () => {
  await submit(crypto.randomUUID());
  await expectHttpsError(submit(crypto.randomUUID()), 'already-exists');
  assert.equal((await db.collection('intake_submissions').where('ownerUid', '==', owner.uid).get()).size, 1);
});

test('no early activation: approval before evidence, before final signature, or by the Owner is refused', async () => {
  const id = crypto.randomUUID();
  await submit(id);
  await expectHttpsError(call(secureApprovePayment, financeB, { paymentId: id }), 'failed-precondition');
  await expectHttpsError(call(secureApprovePayment, owner, { paymentId: id }), 'permission-denied');
  await expectHttpsError(call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id)), 'failed-precondition');
  assert.equal(await isActive(id), false);
  await advanceToFinalSigned(id);
  await expectHttpsError(call(secureApprovePayment, financeB, { paymentId: id }), 'failed-precondition');
  assert.equal(await isActive(id), false, 'final signature alone does not activate');
});

for (const method of ['CASH', 'CHEQUE']) {
  test(`${method}: evidence retry, same-admin approval, concurrent and repeated approval give one decision, one invoice, ACTIVE once`, async (context) => {
    stubSignedUrl(context);
    const id = crypto.randomUUID();
    await submit(id);
    await advanceToFinalSigned(id);
    await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id, method));
    const retry = await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id, method)).then(() => 'ok', (e) => e.code);
    assert.ok(['ok', 'failed-precondition', 'already-exists'].includes(retry), `evidence retry -> ${retry}`);
    assert.equal(await isActive(id), false, 'evidence alone does not activate');
    await expectHttpsError(call(secureApprovePayment, financeA, { paymentId: id }), 'failed-precondition');
    assert.equal(await isActive(id), false);
    const results = await Promise.allSettled([call(secureApprovePayment, financeB, { paymentId: id }), call(secureApprovePayment, financeB, { paymentId: id })]);
    assert.ok(results.some((r) => r.status === 'fulfilled'), JSON.stringify(results.map((r) => r.reason?.message)));
    await call(secureApprovePayment, financeB, { paymentId: id });
    assert.equal(await isActive(id), true);
    const decisions = (await db.collection('audit_logs').where('action', '==', 'ADMIN_APPROVE_PAYMENT').get()).docs.filter((d) => [d.get('targetId'), d.get('paymentId')].includes(id));
    assert.equal(decisions.length, 1, 'one financial decision');
    const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
    const invoices = (await db.collection('invoices').get()).docs.filter((d) => d.id === payment.invoiceId || [d.get('paymentId'), d.get('contractId'), d.get('intakeId')].includes(id));
    assert.equal(invoices.length, 1, 'one invoice');
    assert.equal(invoices[0].get('status'), 'PAID');
    assert.equal(await count('properties', 'intakeId', id), 1);
    const resubmit = await submit(id).then(() => 'ok', (e) => e.code);
    assert.equal(await isActive(id), true, `resubmission after activation (${resubmit}) does not reset activation`);
    const lateReject = await call(adminDecideOwnerApplication, adminMfa, { intakeId: id, decision: 'REJECT', reason: 'Retry after activation must be refused.' }).then(() => 'ok', (e) => e.code);
    assert.notEqual(lateReject, 'ok', 'an ACTIVE application cannot be rejected');
    assert.equal(await isActive(id), true);
  });
}

test('owner application decisions: request-changes retry and reject retry write one audit each and never activate', async () => {
  const id = crypto.randomUUID();
  await submit(id);
  const REASON = 'Title deed page 2 is unreadable, please re-upload.';
  await call(adminDecideOwnerApplication, adminMfa, { intakeId: id, decision: 'REQUEST_CHANGES', reason: REASON });
  const again = await call(adminDecideOwnerApplication, adminMfa, { intakeId: id, decision: 'REQUEST_CHANGES', reason: REASON }).then(() => 'ok', (e) => e.code);
  assert.ok(['failed-precondition', 'permission-denied'].includes(again), `repeated request-changes is refused (got ${again})`);
  const changeAudits = (await db.collection('audit_logs').where('intakeId', '==', id).get()).docs.filter((d) => String(d.get('action')).includes('CHANGES'));
  assert.equal(changeAudits.length, 1, 'one request-changes audit');
  const id2 = crypto.randomUUID();
  const addr2 = 'Villa S2, Street 9, Al Barsha';
  await submit(id2, { ...PROPERTY, address: addr2, area: 'Al Barsha', geo: { ...PROPERTY.geo, lat: 25.11, lng: 55.2, address: addr2, area: 'Al Barsha' } });
  await Promise.allSettled([1, 2].map(() => call(adminDecideOwnerApplication, adminMfa, { intakeId: id2, decision: 'REJECT', reason: REASON })));
  const rejects = (await db.collection('audit_logs').where('intakeId', '==', id2).get()).docs.filter((d) => String(d.get('action')).includes('REJECT'));
  assert.equal(rejects.length, 1);
  assert.equal(await isActive(id), false); assert.equal(await isActive(id2), false);
});
