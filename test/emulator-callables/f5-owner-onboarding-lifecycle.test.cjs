'use strict';
// F-5 regression: the inspection-first Owner onboarding lifecycle is a single enforced state
// machine (functions/ownerOnboardingLifecycle.ts). Every onboarding callable must assert a
// listed transition for its actor, reject illegal jumps (e.g. pending final signature ->
// ACTIVE), and never normalise an unknown recorded state into a legal one.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

const lifecycle = lib('ownerOnboardingLifecycle.js');
const legacy = lib('onboardingStateMachine.js');
const canonical = lib('canonicalStateMachines.js');
const { adminLinkOwnerPropertyInspection } = lib('ownerInspectionAdminLink.js');
const { adminRecordOwnerPropertyInspectionEvidence } = lib('ownerInspectionCompletion.js');
const { adminApprovePayment, adminRejectPayment } = lib('paymentTransactionApproval.js');

const WORKFLOW = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const OWNER = 'owner_f5';
const HASH = 'e'.repeat(64);
const MFA = { firebase: { sign_in_second_factor: 'phone' } };
const now = () => admin.firestore.Timestamp.now();

let financeMfa;
let opsMfa;
test.before(async () => {
  financeMfa = await createUser('finance_f5', { role: 'finance_admin' }, { tokenExtra: MFA });
  opsMfa = await createUser('ops_f5', { role: 'operations_admin' }, { tokenExtra: MFA });
});
test.beforeEach(clearFirestore);

// ---------------------------------------------------------------------------------------------
// Pure state-machine behaviour (compiled functions/lib)
// ---------------------------------------------------------------------------------------------

test('lifecycle: every listed edge is legal only for its named actor', () => {
  const actors = ['owner', 'admin', 'finance_admin'];
  let edges = 0;
  for (const from of lifecycle.OWNER_ONBOARDING_STATES) {
    for (const edge of lifecycle.OWNER_ONBOARDING_TRANSITIONS[from]) {
      for (const actor of actors) {
        const allowed = edge.actors.includes(actor);
        assert.equal(lifecycle.canOwnerOnboardingTransition(from, edge.to, actor), allowed, `${from}->${edge.to} as ${actor}`);
        if (allowed) assert.equal(lifecycle.assertOwnerOnboardingTransition(from, edge.to, actor), edge.to);
        else assert.throws(() => lifecycle.assertOwnerOnboardingTransition(from, edge.to, actor), (e) => e.code === 'permission-denied');
      }
      edges += 1;
    }
  }
  assert.ok(edges >= 20);
  assert.deepEqual(lifecycle.OWNER_ONBOARDING_TRANSITIONS.ACTIVE, []);
  assert.deepEqual(lifecycle.OWNER_ONBOARDING_TRANSITIONS.REJECTED, []);
});

test('lifecycle: illegal jumps are rejected (signature pending -> ACTIVE, pre-inspection -> payment, ACTIVE -> anything)', () => {
  const illegal = [
    ['FINAL_QUOTE_AWAITING_OWNER_SIGNATURE', 'ACTIVE', 'finance_admin'],
    ['FINAL_QUOTE_AWAITING_OWNER_SIGNATURE', 'PAYMENT_EVIDENCE_PENDING_APPROVAL', 'finance_admin'],
    ['SUBMITTED_FOR_PROPERTY_INSPECTION', 'PAYMENT_REJECTED', 'finance_admin'],
    ['SUBMITTED_FOR_PROPERTY_INSPECTION', 'INSPECTION_EVIDENCE_RECORDED', 'admin'],
    ['SITE_VISITS_SCHEDULED', 'FINAL_QUOTE_AWAITING_OWNER_SIGNATURE', 'admin'],
    ['ACTIVE', 'SITE_VISITS_SCHEDULED', 'admin'],
    ['ACTIVE', 'INSPECTION_EVIDENCE_RECORDED', 'admin'],
    ['ACTIVE', 'PAYMENT_EVIDENCE_PENDING_APPROVAL', 'finance_admin'],
    ['OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE', 'SITE_VISITS_SCHEDULED', 'admin'],
    ['DRAFT', 'ACTIVE', 'owner'],
  ];
  for (const [from, to, actor] of illegal) {
    assert.equal(lifecycle.canOwnerOnboardingTransition(from, to, actor), false, `${from}->${to}`);
    assert.throws(() => lifecycle.assertOwnerOnboardingTransition(from, to, actor), (e) => e.code === 'failed-precondition', `${from}->${to}`);
  }
});

test('lifecycle: unknown states are never normalised', () => {
  for (const bad of ['', 'approved', 'active', 'SUPER_APPROVED', 'signature_pending', null, undefined, 42]) {
    assert.equal(lifecycle.isOwnerOnboardingState(bad), false, String(bad));
    assert.throws(() => lifecycle.assertOwnerOnboardingTransition(bad, 'SITE_VISITS_SCHEDULED', 'admin'), (e) => e.code === 'failed-precondition');
    assert.throws(() => lifecycle.assertOwnerOnboardingTransition('DRAFT', bad, 'owner'), (e) => e.code === 'failed-precondition');
  }
  // An unknown recorded state is authoritative and rejected, not re-derived from legacy fields.
  assert.throws(
    () => lifecycle.resolveOwnerOnboardingState({ intake: { ownerOnboardingState: 'SUPER_APPROVED', status: 'SUBMITTED_FOR_PROPERTY_INSPECTION' } }),
    (e) => e.code === 'failed-precondition',
  );
  // A legacy record with an unrecognised status is rejected rather than treated as DRAFT.
  assert.throws(() => lifecycle.resolveOwnerOnboardingState({ intake: { status: 'SOMETHING_ELSE' } }), (e) => e.code === 'failed-precondition');
});

test('lifecycle: legacy records derive strictly from recorded evidence', () => {
  const r = lifecycle.resolveOwnerOnboardingState;
  assert.equal(r({ intake: { status: '' } }), 'DRAFT');
  assert.equal(r({ intake: { status: 'SUBMITTED_FOR_PROPERTY_INSPECTION' } }), 'SUBMITTED_FOR_PROPERTY_INSPECTION');
  assert.equal(r({ intake: { status: 'SUBMITTED_FOR_PROPERTY_INSPECTION', inspectionIds: ['i1'] }, inspections: [{ status: 'SCHEDULED' }] }), 'SITE_VISITS_SCHEDULED');
  assert.equal(r({ intake: { status: 'SUBMITTED_FOR_PROPERTY_INSPECTION', inspectionIds: ['i1'] }, inspections: [{ evidenceStatus: 'VERIFIED' }] }), 'INSPECTION_EVIDENCE_RECORDED');
  assert.equal(r({ intake: { status: 'SUBMITTED_FOR_PROPERTY_INSPECTION' }, contract: { inspectionVerified: true, status: 'PENDING_OWNER_SIGNATURE' } }), 'FINAL_QUOTE_AWAITING_OWNER_SIGNATURE');
  assert.equal(r({ intake: {}, contract: { inspectionVerified: true, ownerSigned: true, status: 'OWNER_SIGNED_AWAITING_PAYMENT' } }), 'OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE');
  assert.equal(r({ intake: {}, contract: { inspectionVerified: true, ownerSigned: true }, payment: { status: 'PENDING_ADMIN_APPROVAL' } }), 'PAYMENT_EVIDENCE_PENDING_APPROVAL');
  assert.equal(r({ intake: { status: 'ACTIVE' } }), 'ACTIVE');
  assert.equal(r({ intake: { status: 'SUBMITTED_FOR_PROPERTY_INSPECTION' }, payment: { status: 'APPROVED' } }), 'ACTIVE');
  // A stale recorded state must not reopen a completed legacy activation.
  assert.throws(() => r({ intake: { ownerOnboardingState: 'SITE_VISITS_SCHEDULED', status: 'ACTIVE' } }), (e) => e.code === 'failed-precondition');
});

test('legacy onboarding machines: no signature_pending -> approved shortcut and no normalisation of unknown states', () => {
  assert.equal(legacy.canTransitionOnboarding('signature_pending', 'approved'), false);
  assert.throws(() => legacy.assertOnboardingTransition('signature_pending', 'approved'));
  assert.equal(legacy.canTransitionOnboarding('admin_review', 'approved'), true);
  assert.equal(legacy.canTransitionOnboarding('totally_unknown', 'account_created'), false, 'unknown must not normalise to draft');
  assert.throws(() => legacy.assertOnboardingTransition('totally_unknown', 'account_created'));
  assert.throws(() => legacy.assertOnboardingTransition('draft', 'not_a_state'));
  assert.equal(canonical.canTransitionCanonicalState('onboarding', 'signature_pending', 'approved'), false);
  assert.equal(canonical.canTransitionCanonicalState('onboarding', 'garbage', 'account_created'), false);
  assert.throws(() => canonical.assertCanonicalTransition('onboarding', 'garbage', 'account_created'));
  assert.throws(() => canonical.assertCanonicalTransition('property', 'NOT_A_PROPERTY_STATE', 'UNDER_REVIEW'));
  assert.equal(canonical.canTransitionCanonicalState('property', 'CHANGES_REQUESTED', 'UNDER_REVIEW'), true);
});

// ---------------------------------------------------------------------------------------------
// Callables (emulator)
// ---------------------------------------------------------------------------------------------

const baseProperty = (intakeId) => ({
  id: `${intakeId}_property_1`, propertyId: `${intakeId}_property_1`, ownerUid: OWNER, ownerId: OWNER, intakeId,
  propertyType: 'Apartment', emirate: 'Dubai', zone: 'B', units: 1, age: 3, slaTier: 'standard', paymentPlan: 'annual',
  strategy: 'maintenance', address: 'Tower F5, Unit 1, Dubai Marina', city: 'Dubai', area: 'Dubai Marina',
  geo: { lat: 25.08, lng: 55.14, address: 'Tower F5, Unit 1, Dubai Marina', emirate: 'Dubai', city: 'Dubai', area: 'Dubai Marina', verified: false, dispatchReady: false, requiresGeoReview: true },
});
const PRICING = {
  units: 1, emirate: 'Dubai', zone: 'B', propertyAge: 3, slaTier: 'standard', paymentPlan: 'annual',
  floors: 1, lifts: 0, hvac: true, districtCooling: false, fireAlarm: true, firePump: false, sira: false,
  gen: false, bmu: false, tank: false, pool: false, verifiedMaintenanceRate: 2500,
};

// Freshly submitted application: one scheduled (not yet evidenced) inspection, nothing linked.
async function seedSubmitted(intakeId, intakeExtra = {}) {
  const property = baseProperty(intakeId);
  await db.doc(`intake_submissions/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, status: 'SUBMITTED_FOR_PROPERTY_INSPECTION',
    properties: [property], selectedAddOns: [], ...intakeExtra,
  });
  await db.doc(`contracts/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, intakeId, status: 'PENDING_PROPERTY_INSPECTION', inspectionVerified: false, ownerSigned: false,
  });
  await db.doc(`payment_transactions/${intakeId}`).set({
    workflowVersion: WORKFLOW, ownerUid: OWNER, ownerId: OWNER, intakeId, contractId: intakeId,
    status: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE', paymentStatus: 'NOT_DUE_UNTIL_INSPECTION_COMPLETE', activationDeposit: 258.75, amount: 258.75,
  });
  await db.doc(`properties/${property.propertyId}`).set({ ...property, status: 'PENDING_PROPERTY_INSPECTION' });
  await db.doc(`property_inspections/insp_${intakeId}`).set({
    id: `insp_${intakeId}`, workflowVersion: WORKFLOW, intakeId, propertyId: property.propertyId, ownerUid: OWNER, status: 'SCHEDULED',
    pricingDriver: 'unit', pricingClass: 'apt-std',
  });
}

async function seedActive(intakeId) {
  await seedSubmitted(intakeId, { inspectionIds: [`insp_${intakeId}`], status: 'ACTIVE' });
  await db.doc(`contracts/${intakeId}`).set({
    status: 'ACTIVE', adminApproved: true, inspectionVerified: true, ownerSigned: true, quoteHash: HASH, finalVerifiedQuoteHash: HASH,
  }, { merge: true });
  await db.doc(`payment_transactions/${intakeId}`).set({
    status: 'APPROVED', paymentStatus: 'APPROVED', paymentVerified: true, approved: true, inspectionVerified: true,
  }, { merge: true });
  await db.doc(`property_inspections/insp_${intakeId}`).set({
    status: 'COMPLETED', evidenceStatus: 'VERIFIED', evidenceHash: 'd'.repeat(64), evidenceGeneration: '1', checklistVerified: true, findings: 'Original verified findings.',
  }, { merge: true });
}

const evidenceInput = (intakeId) => {
  const completedAtMs = Date.now() - 60_000;
  return {
    intakeId, inspectionId: `insp_${intakeId}`, inspectorName: 'Inspector F5', findings: 'Replacement findings that must not land.',
    startedAtMs: completedAtMs - 30 * 60_000, completedAtMs, arrivalLat: 25.0801, arrivalLng: 55.1401,
    checklist: { propertyIdentityConfirmed: true, locationConfirmed: true, accessAndSafetyReviewed: true, systemsAndConditionReviewed: true, serviceScopeConfirmed: true },
    filename: 'visit.jpg', contentType: 'image/jpeg', encodedDocument: Buffer.from('f5 visit evidence fixture').toString('base64'),
    pricingVerification: PRICING,
  };
};

test('happy path: link records SITE_VISITS_SCHEDULED, evidence records INSPECTION_EVIDENCE_RECORDED', async () => {
  const intakeId = crypto.randomUUID();
  await seedSubmitted(intakeId);
  await call(adminLinkOwnerPropertyInspection, opsMfa, { intakeId, inspectionIds: [`insp_${intakeId}`] });
  let intake = (await db.doc(`intake_submissions/${intakeId}`).get()).data();
  assert.equal(intake.ownerOnboardingState, 'SITE_VISITS_SCHEDULED');
  assert.equal(intake.ownerOnboardingPreviousState, 'SUBMITTED_FOR_PROPERTY_INSPECTION');
  assert.equal(intake.ownerOnboardingStateActor, 'admin');
  assert.equal(intake.ownerOnboardingStateChangedBy, 'ops_f5');

  await call(adminRecordOwnerPropertyInspectionEvidence, opsMfa, evidenceInput(intakeId));
  intake = (await db.doc(`intake_submissions/${intakeId}`).get()).data();
  assert.equal(intake.ownerOnboardingState, 'INSPECTION_EVIDENCE_RECORDED');
  assert.equal(intake.ownerOnboardingPreviousState, 'SITE_VISITS_SCHEDULED');
});

test('re-linking an ACTIVE application is rejected and does not reset payment or contract', async () => {
  const intakeId = crypto.randomUUID();
  await seedActive(intakeId);
  await expectHttpsError(call(adminLinkOwnerPropertyInspection, opsMfa, { intakeId, inspectionIds: [`insp_${intakeId}`] }), 'failed-precondition');
  const [payment, contract] = await Promise.all([db.doc(`payment_transactions/${intakeId}`).get(), db.doc(`contracts/${intakeId}`).get()]);
  assert.equal(payment.get('status'), 'APPROVED');
  assert.equal(payment.get('inspectionVerified'), true);
  assert.equal(contract.get('activationStatus'), undefined);
});

test('visit evidence cannot overwrite a completed inspection on an ACTIVE application', async () => {
  const intakeId = crypto.randomUUID();
  await seedActive(intakeId);
  await expectHttpsError(call(adminRecordOwnerPropertyInspectionEvidence, opsMfa, evidenceInput(intakeId)), 'failed-precondition');
  const inspection = (await db.doc(`property_inspections/insp_${intakeId}`).get()).data();
  assert.equal(inspection.status, 'COMPLETED');
  assert.equal(inspection.findings, 'Original verified findings.');
});

test('visit evidence cannot skip scheduling (SUBMITTED -> INSPECTION_EVIDENCE_RECORDED)', async () => {
  const intakeId = crypto.randomUUID();
  await seedSubmitted(intakeId);
  await expectHttpsError(call(adminRecordOwnerPropertyInspectionEvidence, opsMfa, evidenceInput(intakeId)), 'failed-precondition');
  const inspection = (await db.doc(`property_inspections/insp_${intakeId}`).get()).data();
  assert.equal(inspection.evidenceStatus, undefined);
});

test('an unknown recorded lifecycle state is rejected, not normalised', async () => {
  const intakeId = crypto.randomUUID();
  await seedSubmitted(intakeId, { ownerOnboardingState: 'SUPER_APPROVED' });
  const error = await expectHttpsError(call(adminLinkOwnerPropertyInspection, opsMfa, { intakeId, inspectionIds: [`insp_${intakeId}`] }), 'failed-precondition');
  assert.match(error.message, /unknown|SUPER_APPROVED/i);
  const intake = (await db.doc(`intake_submissions/${intakeId}`).get()).data();
  assert.equal(intake.ownerOnboardingState, 'SUPER_APPROVED');
  assert.equal(intake.inspectionIds, undefined);
});

test('payment rejection is refused before any 15% evidence exists (pre-inspection application)', async () => {
  const intakeId = crypto.randomUUID();
  await seedSubmitted(intakeId);
  await expectHttpsError(call(adminRejectPayment, financeMfa, { paymentId: intakeId, reason: 'f5 illegal reject' }), 'failed-precondition');
  const payment = (await db.doc(`payment_transactions/${intakeId}`).get()).data();
  assert.equal(payment.status, 'NOT_DUE_UNTIL_INSPECTION_COMPLETE');
});

test('payment approval is refused while the final quote still awaits the Owner signature', async () => {
  const intakeId = crypto.randomUUID();
  await seedSubmitted(intakeId, { inspectionIds: [`insp_${intakeId}`] });
  await db.doc(`contracts/${intakeId}`).set({ status: 'PENDING_OWNER_SIGNATURE', inspectionVerified: true, ownerSigned: false, quoteHash: HASH, finalVerifiedQuoteHash: HASH }, { merge: true });
  await db.doc(`payment_transactions/${intakeId}`).set({ status: 'PENDING_ADMIN_APPROVAL', paymentStatus: 'PENDING_ADMIN_APPROVAL', inspectionVerified: true, finalVerifiedQuoteHash: HASH, ownerOnboardingState: null }, { merge: true });
  await db.doc(`intake_submissions/${intakeId}`).set({ ownerOnboardingState: 'FINAL_QUOTE_AWAITING_OWNER_SIGNATURE', ownerOnboardingStateVersion: lifecycle.OWNER_ONBOARDING_LIFECYCLE_VERSION }, { merge: true });
  await expectHttpsError(call(adminApprovePayment, financeMfa, { paymentId: intakeId, amountReceived: 258.75 }), 'failed-precondition');
  const [payment, contract] = await Promise.all([db.doc(`payment_transactions/${intakeId}`).get(), db.doc(`contracts/${intakeId}`).get()]);
  assert.notEqual(payment.get('status'), 'APPROVED');
  assert.notEqual(contract.get('status'), 'ACTIVE');
});


test('legacy resolution refuses erased authority and does not confuse quote approval with activation', () => {
  const r = lifecycle.resolveOwnerOnboardingState;
  for (const state of [null, undefined, '', 'active', 42]) {
    assert.throws(() => r({ intake: { status: 'SUBMITTED_FOR_PROPERTY_INSPECTION', ownerOnboardingState: state } }), (e) => e.code === 'failed-precondition');
  }
  assert.throws(() => r({ contract: { status: 'ACTIVE' } }), (e) => e.code === 'failed-precondition');
  assert.equal(r({ intake: {}, contract: { adminApproved: true, inspectionVerified: true, ownerSigned: false } }), 'FINAL_QUOTE_AWAITING_OWNER_SIGNATURE');
  assert.equal(r({ intake: { status: 'REJECTED' }, contract: { inspectionVerified: true } }), 'REJECTED');
  assert.throws(() => r({ intake: { status: 'SUBMITTED_FOR_PROPERTY_INSPECTION' }, contract: { ownerSigned: false }, payment: { status: 'PENDING_ADMIN_APPROVAL' } }), (e) => e.code === 'failed-precondition');
  assert.throws(() => r({ intake: { ownerOnboardingState: 'SITE_VISITS_SCHEDULED' }, payment: { status: 'APPROVED' } }), (e) => e.code === 'failed-precondition');
});

test('account binding preserves active accounts and refuses a submitted application atomically', async () => {
  const { upsertOwnerOnboardingProfile } = lib('ownerOnboarding.js');
  const owner = await createUser(OWNER, { role: 'owner' });
  const intakeId = crypto.randomUUID();
  await seedSubmitted(intakeId);
  await db.doc(`users/${OWNER}`).set({ role: 'owner', name: 'Existing Owner', status: 'pending' });
  await expectHttpsError(call(upsertOwnerOnboardingProfile, owner, { fullName: 'Replacement', mobile: '+971500000001', intakeId }), 'failed-precondition');
  assert.equal((await db.doc(`users/${OWNER}`).get()).get('name'), 'Existing Owner');
  assert.equal((await db.collection('audit_logs').get()).size, 0);
  await db.doc(`users/${OWNER}`).set({ status: 'active', paymentVerified: true, dashboardUnlocked: true }, { merge: true });
  await expectHttpsError(call(upsertOwnerOnboardingProfile, owner, { fullName: 'Replacement', mobile: '+971500000001' }), 'failed-precondition');
  assert.equal((await db.doc(`users/${OWNER}`).get()).get('dashboardUnlocked'), true);
});

test('a stale recorded state cannot re-link or overwrite evidence after legacy activation', async () => {
  const intakeId = crypto.randomUUID();
  await seedActive(intakeId);
  await db.doc(`intake_submissions/${intakeId}`).set({ ownerOnboardingState: 'SITE_VISITS_SCHEDULED' }, { merge: true });
  await expectHttpsError(call(adminLinkOwnerPropertyInspection, opsMfa, { intakeId, inspectionIds: [`insp_${intakeId}`] }), 'failed-precondition');
  await expectHttpsError(call(adminRecordOwnerPropertyInspectionEvidence, opsMfa, evidenceInput(intakeId)), 'failed-precondition');
  assert.equal((await db.doc(`payment_transactions/${intakeId}`).get()).get('status'), 'APPROVED');
  assert.equal((await db.doc(`property_inspections/insp_${intakeId}`).get()).get('findings'), 'Original verified findings.');
});


test('linking loses a concurrent lifecycle race without resetting financial records or adding an audit', async () => {
  const intakeId = crypto.randomUUID();
  await seedSubmitted(intakeId);
  const prototype = Object.getPrototypeOf(db.batch());
  const original = prototype.commit;
  let once = true;
  prototype.commit = async function (...args) {
    if (once) {
      once = false;
      await db.doc(`intake_submissions/${intakeId}`).set({ status: 'ACTIVE', ownerOnboardingState: 'ACTIVE' }, { merge: true });
    }
    return original.apply(this, args);
  };
  try { await expectHttpsError(call(adminLinkOwnerPropertyInspection, opsMfa, { intakeId, inspectionIds: [`insp_${intakeId}`] }), 'aborted'); }
  finally { prototype.commit = original; }
  assert.equal((await db.doc(`intake_submissions/${intakeId}`).get()).get('ownerOnboardingState'), 'ACTIVE');
  assert.equal((await db.doc(`payment_transactions/${intakeId}`).get()).get('status'), 'NOT_DUE_UNTIL_INSPECTION_COMPLETE');
  assert.equal((await db.collection('audit_logs').get()).size, 0);
});


test('account binding rechecks lifecycle after its preliminary reads and does not mutate claims on refusal', async () => {
  const { upsertOwnerOnboardingProfile } = lib('ownerOnboarding.js');
  const owner = await createUser('owner_f5_binding_race', { role: 'owner', evidenceMarker: 'preserved' });
  const intakeId = crypto.randomUUID();
  await db.doc(`users/${owner.uid}`).set({ role: 'owner', status: 'pending', name: 'Original' });
  await db.doc(`intake_submissions/${intakeId}`).set({ ownerUid: owner.uid, ownerOnboardingState: 'DRAFT' });
  const original = db.runTransaction;
  db.runTransaction = async function (fn, options) {
    await db.doc(`intake_submissions/${intakeId}`).set({ status: 'ACTIVE', ownerOnboardingState: 'ACTIVE' }, { merge: true });
    return original.call(this, fn, options);
  };
  try { await expectHttpsError(call(upsertOwnerOnboardingProfile, owner, { fullName: 'Replacement', mobile: '+971500000001', intakeId }), 'failed-precondition'); }
  finally { db.runTransaction = original; }
  assert.equal((await db.doc(`users/${owner.uid}`).get()).get('name'), 'Original');
  assert.deepEqual((await admin.auth().getUser(owner.uid)).customClaims, { role: 'owner', evidenceMarker: 'preserved' });
  assert.equal((await db.collection('audit_logs').get()).size, 0);
});
