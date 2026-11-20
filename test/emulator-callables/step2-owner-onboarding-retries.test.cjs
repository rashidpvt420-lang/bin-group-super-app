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
const { adminSetOwnerChequeClearance } = lib('ownerPaymentLedgerCallables.js');

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
    if (method === 'CHEQUE') {
      // Clause 9D: a cheque counts as paid only once the bank has cleared it (ported from #1791).
      const early = await expectHttpsError(call(secureApprovePayment, financeB, { paymentId: id }), 'failed-precondition');
      assert.match(early.message, /cleared by the bank/);
      assert.equal(await isActive(id), false, 'an uncleared cheque never activates');
      await call(adminSetOwnerChequeClearance, financeA, { paymentId: id, clearance: 'CLEARED' });
    }
    const results = await Promise.allSettled([call(secureApprovePayment, financeB, { paymentId: id }), call(secureApprovePayment, financeB, { paymentId: id })]);
    assert.ok(results.some((r) => r.status === 'fulfilled'), JSON.stringify(results.map((r) => r.reason?.message)));
    await call(secureApprovePayment, financeB, { paymentId: id });

    // A PAID_RECEIPT_READY marker is not sufficient: missing any canonical metadata field
    // must enter the repair path. Regress the previously missed URL+path-but-no-generation case.
    const approvedPaymentForRepair = (await db.doc(`payment_transactions/${id}`).get()).data();
    const approvedInvoiceRef = db.doc(`invoices/${approvedPaymentForRepair.invoiceId}`);
    await approvedInvoiceRef.update({ receiptPdfGeneration: admin.firestore.FieldValue.delete() });
    await call(secureApprovePayment, financeB, { paymentId: id });
    const repairedInvoice = (await approvedInvoiceRef.get()).data();
    assert.equal(repairedInvoice.documentState, 'PAID_RECEIPT_READY');
    assert.ok(repairedInvoice.receiptPdfUrl, 'missing receipt URL is repaired');
    assert.ok(repairedInvoice.receiptStoragePath, 'missing receipt storage path is repaired');
    assert.ok(repairedInvoice.receiptPdfSha256, 'missing receipt SHA-256 is repaired');
    assert.ok(repairedInvoice.receiptPdfGeneration, 'missing receipt generation is repaired');

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

for (const pauseStage of ['before upload', 'after upload']) {
  test(`a delayed missing-invoice repair (${pauseStage}) preserves PAID and its PDF generation`, { timeout: 120_000 }, async (context) => {
    stubSignedUrl(context);
    const id = crypto.randomUUID();
    await submit(id);
    await advanceToFinalSigned(id);
    await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id));

    const pdfEngine = lib('pdfEngine.js');
    const original = pdfEngine.generateMobilizationUnpaidInvoicePdfArtifact;
    let releaseRepair;
    let notifyRepair;
    const blocked = new Promise((resolve) => { releaseRepair = resolve; });
    const reachedRepair = new Promise((resolve) => { notifyRepair = resolve; });
    let firstRepair = true;
    pdfEngine.generateMobilizationUnpaidInvoicePdfArtifact = async (...args) => {
      // Both requests observe a missing invoice. Hold the first repair until the second
      // commits PAID; cover both a delayed PDF upload and a delayed Firestore write.
      const shouldPause = firstRepair;
      firstRepair = false;
      if (shouldPause && pauseStage === 'before upload') {
        notifyRepair();
        await blocked;
      }
      const artifact = await original(...args);
      if (shouldPause && pauseStage === 'after upload') {
        notifyRepair();
        await blocked;
      }
      return artifact;
    };
    context.after(() => {
      releaseRepair();
      pdfEngine.generateMobilizationUnpaidInvoicePdfArtifact = original;
    });

    const delayed = call(secureApprovePayment, financeB, { paymentId: id });
    // Surface an early failure instead of waiting indefinitely for the paused repair.
    try {
      await Promise.race([reachedRepair, delayed.then(() => { throw new Error('Expected the first repair to pause'); })]);
      await call(secureApprovePayment, financeB, { paymentId: id });
      const approvedPayment = (await db.doc(`payment_transactions/${id}`).get()).data();
      assert.equal((await db.doc(`invoices/${approvedPayment.invoiceId}`).get()).get('status'), 'PAID');
    } finally {
      releaseRepair();
      await delayed;
    }

    const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
    const invoice = await db.doc(`invoices/${payment.invoiceId}`).get();
    assert.equal(invoice.get('status'), 'PAID');
    assert.equal(invoice.get('paymentStatus'), 'PAID');
    assert.equal(invoice.get('amountPaid'), invoice.get('amount'));
    const file = admin.storage().bucket().file(invoice.get('storagePath'));
    const [pdf] = await file.download();
    const [metadata] = await file.getMetadata();
    assert.equal(crypto.createHash('sha256').update(pdf).digest('hex'), invoice.get('pdfSha256'));
    assert.equal(String(metadata.generation), invoice.get('pdfGeneration'), 'a late repair cannot overwrite the referenced PDF');
    assert.equal(await isActive(id), true);
    const decisions = (await db.collection('audit_logs').where('action', '==', 'ADMIN_APPROVE_PAYMENT').get()).docs
      .filter((d) => [d.get('targetId'), d.get('paymentId')].includes(id));
    assert.equal(decisions.length, 1, 'a delayed repair cannot create another financial decision');
  });
}

for (const pauseStage of ['before upload', 'after upload', 'before commit']) {
  test(`a delayed paid-receipt generation (${pauseStage}) preserves PAID_RECEIPT_READY and its PDF generation`, { timeout: 120_000 }, async (context) => {
    stubSignedUrl(context);
    const id = crypto.randomUUID();
    await submit(id);
    await advanceToFinalSigned(id);
    await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id));

    const pdfEngine = lib('pdfEngine.js');
    const originalReceipt = pdfEngine.generateOwnerPaymentReceiptPdfArtifact;
    let releaseReceipt;
    let notifyReceipt;
    const blocked = new Promise((resolve) => { releaseReceipt = resolve; });
    const reachedReceipt = new Promise((resolve) => { notifyReceipt = resolve; });
    let firstAttempt = true;
    let firstAttemptArtifactPath = null;
    pdfEngine.generateOwnerPaymentReceiptPdfArtifact = async (...args) => {
      const shouldPause = firstAttempt;
      firstAttempt = false;
      if (shouldPause && pauseStage === 'before upload') {
        notifyReceipt();
        await blocked;
      }
      const artifact = await originalReceipt(...args);
      if (shouldPause) {
        firstAttemptArtifactPath = artifact.storagePath;
      }
      if (shouldPause && (pauseStage === 'after upload' || pauseStage === 'before commit')) {
        notifyReceipt();
        await blocked;
      }
      return artifact;
    };
    context.after(() => {
      releaseReceipt();
      pdfEngine.generateOwnerPaymentReceiptPdfArtifact = originalReceipt;
    });

    const delayed = call(secureApprovePayment, financeB, { paymentId: id });
    try {
      await Promise.race([
        reachedReceipt,
        delayed.then(() => { throw new Error('Expected first receipt generation to pause'); })
      ]);
      // Execute concurrent approval which finishes and commits the winning receipt
      await call(secureApprovePayment, financeB, { paymentId: id });
      const winningPayment = (await db.doc(`payment_transactions/${id}`).get()).data();
      const winningInvoice = (await db.doc(`invoices/${winningPayment.invoiceId}`).get()).data();
      assert.equal(winningInvoice.documentState, 'PAID_RECEIPT_READY');
      assert.ok(winningInvoice.receiptPdfSha256);
      assert.ok(winningInvoice.receiptPdfGeneration);
      var preReleasePath = winningInvoice.receiptStoragePath;
      var preReleaseSha = winningInvoice.receiptPdfSha256;
      var preReleaseGen = String(winningInvoice.receiptPdfGeneration);
    } finally {
      releaseReceipt();
      await delayed;
    }

    const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
    const invoice = await db.doc(`invoices/${payment.invoiceId}`).get();
    assert.equal(invoice.get('status'), 'PAID');
    assert.equal(invoice.get('documentState'), 'PAID_RECEIPT_READY');
    assert.equal(invoice.get('receiptStoragePath'), preReleasePath, 'canonical receipt path remains unchanged');
    assert.equal(invoice.get('receiptPdfSha256'), preReleaseSha, 'canonical receipt sha remains unchanged');
    assert.equal(String(invoice.get('receiptPdfGeneration')), preReleaseGen, 'canonical receipt generation remains unchanged');

    const file = admin.storage().bucket().file(invoice.get('receiptStoragePath'));
    const [pdf] = await file.download();
    const [metadata] = await file.getMetadata();
    assert.equal(crypto.createHash('sha256').update(pdf).digest('hex'), invoice.get('receiptPdfSha256'), 'winning receipt SHA matches file');
    assert.equal(String(metadata.generation), invoice.get('receiptPdfGeneration'), 'a late retry cannot overwrite winning receipt PDF');

    if (firstAttemptArtifactPath) {
      assert.notEqual(firstAttemptArtifactPath, preReleasePath, 'delayed attempt used a distinct storage path');
      const [orphanExists] = await admin.storage().bucket().file(firstAttemptArtifactPath).exists();
      assert.equal(orphanExists, false, 'losing attempt orphan artifact must be cleaned up from storage');
    }

    const decisions = (await db.collection('audit_logs').where('action', '==', 'ADMIN_APPROVE_PAYMENT').get()).docs
      .filter((d) => [d.get('targetId'), d.get('paymentId')].includes(id));
    assert.equal(decisions.length, 1, 'concurrent retries produce exactly one payment approval audit');
  });
}

test('a Firestore transaction contention retry on receipt commit cleans up the losing orphan artifact and preserves winning receipt', { timeout: 120_000 }, async (context) => {
  stubSignedUrl(context);
  const id = crypto.randomUUID();
  await submit(id);
  await advanceToFinalSigned(id);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id));

  const pdfEngine = lib('pdfEngine.js');
  const originalReceipt = pdfEngine.generateOwnerPaymentReceiptPdfArtifact;
  let losingReceiptPath = null;
  let firstArtifact = true;
  pdfEngine.generateOwnerPaymentReceiptPdfArtifact = async (...args) => {
    const artifact = await originalReceipt(...args);
    if (firstArtifact) {
      firstArtifact = false;
      losingReceiptPath = artifact.storagePath;
    }
    return artifact;
  };

  const originalRunTransaction = db.runTransaction.bind(db);
  let totalReceiptTransactionRuns = 0;
  let receiptAttempt1Committed = null;
  let receiptAttempt2Committed = null;
  let winningReceiptPath = null;
  let winningSha = null;
  let winningGen = null;

  db.runTransaction = async (updateFunction, transactionOptions) => {
    const interceptedUpdate = async (transaction) => {
      const result = await updateFunction(transaction);
      if (result && typeof result === 'object' && 'committed' in result) {
        totalReceiptTransactionRuns += 1;
        if (totalReceiptTransactionRuns === 1) {
          receiptAttempt1Committed = result.committed;
          const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
          const invoiceRef = db.doc(`invoices/${payment.invoiceId}`);
          winningReceiptPath = `invoices/${payment.invoiceId}/receipts/winning-${crypto.randomUUID()}.pdf`;
          const dummyPdf = Buffer.from('%PDF-1.4 WINNING RECEIPT');
          winningSha = crypto.createHash('sha256').update(dummyPdf).digest('hex');
          const file = admin.storage().bucket().file(winningReceiptPath);
          await file.save(dummyPdf, { contentType: 'application/pdf' });
          const [metadata] = await file.getMetadata();
          winningGen = String(metadata.generation);

          await invoiceRef.set({
            receiptPdfUrl: `https://storage.googleapis.com/${winningReceiptPath}`,
            receiptStoragePath: winningReceiptPath,
            receiptPdfSha256: winningSha,
            receiptPdfGeneration: winningGen,
            documentState: 'PAID_RECEIPT_READY',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
        } else if (totalReceiptTransactionRuns === 2) {
          receiptAttempt2Committed = result.committed;
        }
      }
      return result;
    };
    return originalRunTransaction(interceptedUpdate, transactionOptions);
  };

  context.after(() => {
    db.runTransaction = originalRunTransaction;
    pdfEngine.generateOwnerPaymentReceiptPdfArtifact = originalReceipt;
  });

  await call(secureApprovePayment, financeB, { paymentId: id });

  assert.equal(totalReceiptTransactionRuns, 2, 'Firestore transaction must have retried due to contention (ran exactly 2 times)');
  assert.equal(receiptAttempt1Committed, true, 'attempt 1 staged commit before contention abort');
  assert.equal(receiptAttempt2Committed, false, 'attempt 2 retry observed winning receipt and returned committed: false');

  const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
  const invoice = await db.doc(`invoices/${payment.invoiceId}`).get();
  assert.equal(invoice.get('status'), 'PAID');
  assert.equal(invoice.get('documentState'), 'PAID_RECEIPT_READY');
  assert.equal(invoice.get('receiptStoragePath'), winningReceiptPath, 'winning receipt must remain canonical');
  assert.equal(invoice.get('receiptPdfSha256'), winningSha);
  assert.equal(invoice.get('receiptPdfGeneration'), winningGen);

  assert.ok(losingReceiptPath, 'losing attempt generated an artifact');
  const [orphanExists] = await admin.storage().bucket().file(losingReceiptPath).exists();
  assert.equal(orphanExists, false, 'losing attempt orphan artifact must be cleaned up from storage after transaction retry');

  const [winningExists] = await admin.storage().bucket().file(winningReceiptPath).exists();
  assert.equal(winningExists, true, 'winning receipt file must exist in storage');

  const decisions = (await db.collection('audit_logs').where('action', '==', 'ADMIN_APPROVE_PAYMENT').get()).docs
    .filter((d) => [d.get('targetId'), d.get('paymentId')].includes(id));
  assert.equal(decisions.length, 1, 'concurrent retries produce exactly one payment approval audit');
});

test('an exception during receipt transaction cleans up the orphan artifact without overwriting ready receipt state or masking the error', { timeout: 120_000 }, async (context) => {
  stubSignedUrl(context);
  const id = crypto.randomUUID();
  await submit(id);
  await advanceToFinalSigned(id);
  await call(adminRecordOwnerMobilizationPaymentEvidence, financeA, evidence(id));

  const pdfEngine = lib('pdfEngine.js');
  const originalReceipt = pdfEngine.generateOwnerPaymentReceiptPdfArtifact;
  let losingReceiptPath = null;
  pdfEngine.generateOwnerPaymentReceiptPdfArtifact = async (...args) => {
    const artifact = await originalReceipt(...args);
    losingReceiptPath = artifact.storagePath;
    return artifact;
  };

  const originalRunTransaction = db.runTransaction.bind(db);
  const SIMULATED_ERROR = 'Simulated Firestore transaction network timeout failure';
  let winningReceiptPath = null;
  let winningSha = null;
  let winningGen = null;

  db.runTransaction = async (updateFunction, transactionOptions) => {
    const interceptedUpdate = async (transaction) => {
      const result = await updateFunction(transaction);
      if (result && typeof result === 'object' && 'committed' in result) {
        // While this transaction was preparing, a concurrent process committed a canonical winning receipt
        const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
        const invoiceRef = db.doc(`invoices/${payment.invoiceId}`);
        winningReceiptPath = `invoices/${payment.invoiceId}/receipts/winning-${crypto.randomUUID()}.pdf`;
        const dummyPdf = Buffer.from('%PDF-1.4 CONCURRENT WINNING RECEIPT');
        winningSha = crypto.createHash('sha256').update(dummyPdf).digest('hex');
        const file = admin.storage().bucket().file(winningReceiptPath);
        await file.save(dummyPdf, { contentType: 'application/pdf' });
        const [metadata] = await file.getMetadata();
        winningGen = String(metadata.generation);

        await invoiceRef.set({
          receiptPdfUrl: `https://storage.googleapis.com/${winningReceiptPath}`,
          receiptStoragePath: winningReceiptPath,
          receiptPdfSha256: winningSha,
          receiptPdfGeneration: winningGen,
          documentState: 'PAID_RECEIPT_READY',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Simulate a database/network exception that aborts this attempt's transaction
        throw new Error(SIMULATED_ERROR);
      }
      return result;
    };
    return originalRunTransaction(interceptedUpdate, transactionOptions);
  };

  context.after(() => {
    db.runTransaction = originalRunTransaction;
    pdfEngine.generateOwnerPaymentReceiptPdfArtifact = originalReceipt;
  });

  let caughtError = null;
  try {
    await call(secureApprovePayment, financeB, { paymentId: id });
  } catch (err) {
    caughtError = err;
  }

  assert.ok(caughtError, 'approval call must throw and not swallow the transaction error');
  assert.ok(
    String(caughtError.message || caughtError).includes(SIMULATED_ERROR),
    `error message must preserve original transaction failure (got: ${caughtError.message})`
  );

  const payment = (await db.doc(`payment_transactions/${id}`).get()).data();
  const invoice = await db.doc(`invoices/${payment.invoiceId}`).get();
  assert.equal(invoice.get('status'), 'PAID');
  assert.equal(invoice.get('documentState'), 'PAID_RECEIPT_READY', 'ready receipt must not be downgraded on exception');
  assert.equal(invoice.get('receiptStoragePath'), winningReceiptPath, 'winning receipt must remain canonical');
  assert.equal(invoice.get('receiptPdfSha256'), winningSha);
  assert.equal(invoice.get('receiptPdfGeneration'), winningGen);

  assert.ok(losingReceiptPath, 'losing attempt generated an artifact');
  const [orphanExists] = await admin.storage().bucket().file(losingReceiptPath).exists();
  assert.equal(orphanExists, false, 'losing attempt orphan artifact must be cleaned up from storage after transaction error');

  const [winningExists] = await admin.storage().bucket().file(winningReceiptPath).exists();
  assert.equal(winningExists, true, 'winning receipt file must remain intact in storage');
});

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
