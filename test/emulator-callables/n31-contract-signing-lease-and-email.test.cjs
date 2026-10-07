'use strict';
// N-31 regression: ownerSignContractAndQueuePdf must (a) hold a signing lease so concurrent
// submissions cannot overwrite the canonical PDF after its sha256/generation is recorded,
// (b) record the signed-PDF email as queued (not delivered), and (c) HTML-escape the
// owner-supplied signer name in the queued email.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const { admin, db, lib, createUser, clearFirestore, call, expectHttpsError } = require('./_setup.cjs');

// The Storage emulator cannot sign URLs (no service-account credentials); stub signing only.
const storageModule = require(require.resolve('@google-cloud/storage', { paths: [path.join(__dirname, '..', '..', 'functions')] }));
const originalGetSignedUrl = storageModule.File.prototype.getSignedUrl;
storageModule.File.prototype.getSignedUrl = async function stubbedSignedUrl() {
  return [`https://storage.example.invalid/${encodeURIComponent(this.name)}?signed=1`];
};
test.after(() => { storageModule.File.prototype.getSignedUrl = originalGetSignedUrl; });

const { ownerSignContractAndQueuePdf } = lib('adminOwnerOperations.js');
const QUOTE_HASH = 'b'.repeat(64);
const HOSTILE_NAME = 'Owner <img src=x onerror=alert(1)> "N31"';

let owner;
test.before(async () => {
  owner = await createUser('owner_n31', { role: 'owner' }, { email: 'owner-n31@example.invalid' });
});
test.beforeEach(clearFirestore);

async function seedContract(contractId, overrides = {}) {
  await db.doc(`contracts/${contractId}`).set({
    ownerId: owner.uid,
    ownerUid: owner.uid,
    ownerEmail: owner.token.email,
    quoteHash: QUOTE_HASH,
    status: 'PENDING_OWNER_SIGNATURE',
    packageName: 'N31 Plan',
    propertyName: 'N31 Villa',
    propertyIds: ['prop_n31'],
    annualContractValue: 12000,
    depositAmount: 1800,
    ownerSigned: false,
    signatureState: { ownerSigned: false },
    ...overrides,
  });
}

async function seedOtp(verificationId, contractId, signature = HOSTILE_NAME) {
  await db.doc(`contract_signature_otps/${verificationId}`).set({
    status: 'VERIFIED',
    uid: owner.uid,
    contractId,
    contractHash: QUOTE_HASH,
    signature,
    evidenceExpiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 10 * 60 * 1000),
  });
}

function sign(contractId, otpVerificationId, signatureName = HOSTILE_NAME) {
  return call(ownerSignContractAndQueuePdf, owner, { contractId, otpVerificationId, signatureName });
}

async function storedObject(storagePath) {
  const file = admin.storage().bucket().file(storagePath);
  const [metadata] = await file.getMetadata();
  const [bytes] = await file.download();
  return { generation: String(metadata.generation), sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

test('signing records the email as queued, escapes the signer name, and clears the lease', async () => {
  await seedContract('n31_ok');
  await seedOtp('otp_n31_ok', 'n31_ok');
  const result = await sign('n31_ok', 'otp_n31_ok');
  assert.equal(result.status, 'READY_FOR_ACTIVATION');
  assert.equal(result.idempotent, false);

  const contract = (await db.doc('contracts/n31_ok').get()).data();
  assert.equal(contract.ownerSigned, true);
  assert.equal(contract.signatureState.emailed, false, 'mail is only queued; it must not be recorded as delivered');
  assert.equal(contract.signatureState.emailQueued, true);
  assert.equal(contract.signingLease, undefined, 'the signing lease must be released on success');

  const request = (await db.doc('contract_signing_requests/n31_ok').get()).data();
  assert.equal(request.status, 'SIGNED_PDF_EMAIL_QUEUED');

  const mail = (await db.doc('mail/owner_contract_signed_n31_ok').get()).data();
  assert.ok(!mail.message.html.includes('<img'), 'signer-supplied markup must not reach the email HTML');
  assert.match(mail.message.html, /Owner &lt;img src=x onerror=alert\(1\)&gt; &quot;N31&quot;/);

  const object = await storedObject(contract.canonicalPdfStoragePath);
  assert.equal(object.generation, contract.canonicalPdfGeneration);
  assert.equal(object.sha256, contract.canonicalPdfSha256);
});

test('a second submission while another attempt holds the lease is rejected without side effects', async () => {
  await seedContract('n31_leased', { signingLease: { attemptId: 'other_attempt', uid: owner.uid, expiresAtMs: Date.now() + 60_000 } });
  await seedOtp('otp_n31_leased', 'n31_leased');
  await expectHttpsError(sign('n31_leased', 'otp_n31_leased'), 'aborted');

  const contract = (await db.doc('contracts/n31_leased').get()).data();
  assert.equal(contract.ownerSigned, false);
  assert.equal(contract.signingLease.attemptId, 'other_attempt', 'the other attempt keeps its lease');
  const otp = (await db.doc('contract_signature_otps/otp_n31_leased').get()).data();
  assert.equal(otp.consumedFor, undefined, 'OTP evidence must not be consumed by a rejected attempt');
  const [files] = await admin.storage().bucket().getFiles({ prefix: 'contracts/n31_leased/' });
  assert.equal(files.length, 0, 'a rejected attempt must not write the canonical PDF object');
});

test('an expired lease from a crashed attempt does not block signing', async () => {
  await seedContract('n31_stale', { signingLease: { attemptId: 'crashed_attempt', uid: owner.uid, expiresAtMs: Date.now() - 1_000 } });
  await seedOtp('otp_n31_stale', 'n31_stale');
  const result = await sign('n31_stale', 'otp_n31_stale');
  assert.equal(result.idempotent, false);
  const contract = (await db.doc('contracts/n31_stale').get()).data();
  assert.equal(contract.ownerSigned, true);
  assert.equal(contract.signingLease, undefined);
});

test('concurrent submissions produce one signature whose recorded PDF evidence matches the stored bytes', async () => {
  await seedContract('n31_race');
  await seedOtp('otp_n31_race', 'n31_race');
  const outcomes = await Promise.allSettled([sign('n31_race', 'otp_n31_race'), sign('n31_race', 'otp_n31_race')]);
  const fresh = outcomes.filter((o) => o.status === 'fulfilled' && o.value.idempotent === false);
  assert.equal(fresh.length, 1, `exactly one attempt may sign: ${JSON.stringify(outcomes.map((o) => o.status === 'fulfilled' ? o.value : o.reason?.code))}`);
  for (const outcome of outcomes) {
    if (outcome.status === 'rejected') assert.equal(outcome.reason?.code, 'aborted');
  }
  const contract = (await db.doc('contracts/n31_race').get()).data();
  assert.equal(contract.ownerSigned, true);
  const object = await storedObject(contract.canonicalPdfStoragePath);
  assert.equal(object.generation, contract.canonicalPdfGeneration, 'stored PDF generation must match recorded evidence');
  assert.equal(object.sha256, contract.canonicalPdfSha256, 'stored PDF bytes must match recorded sha256');
});


test('inspection-first final signature atomically advances lifecycle and creates the immutable unpaid invoice', async () => {
  const contractId = 'n31_inspection_first';
  await seedContract(contractId, { workflowVersion: 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1', intakeId: contractId, inspectionVerified: true });
  await db.doc(`intake_submissions/${contractId}`).set({ ownerUid: owner.uid, ownerOnboardingState: 'FINAL_QUOTE_AWAITING_OWNER_SIGNATURE' });
  await seedOtp('otp_n31_inspection_first', contractId);
  const result = await sign(contractId, 'otp_n31_inspection_first');
  assert.equal(result.idempotent, false);
  const intake = (await db.doc(`intake_submissions/${contractId}`).get()).data();
  assert.equal(intake.ownerOnboardingState, 'OWNER_SIGNED_AWAITING_PAYMENT_EVIDENCE');
  assert.equal(intake.ownerOnboardingStateChangedBy, owner.uid);
  const contract = (await db.doc(`contracts/${contractId}`).get()).data();
  assert.equal(contract.ownerSigned, true);
  assert.ok(contract.invoiceId);
  const invoice = (await db.doc(`invoices/${contract.invoiceId}`).get()).data();
  assert.equal(invoice.status, 'PENDING');
  assert.equal(invoice.paymentStatus, 'UNPAID');
  assert.equal(invoice.amount, 1800);
  assert.equal(invoice.amountPaid, 0);
  const invoiceArtifact = await storedObject(invoice.storagePath);
  assert.equal(invoiceArtifact.sha256, invoice.pdfSha256);
  assert.equal(invoiceArtifact.generation, invoice.pdfGeneration);
  const artifact = await storedObject(contract.canonicalPdfStoragePath);
  assert.equal(artifact.sha256, contract.canonicalPdfSha256);
  assert.equal((await sign(contractId, 'otp_n31_inspection_first')).idempotent, true);
});


test('a valid signature OTP cannot skip the inspection-first final quote state', async () => {
  const contractId = 'n31_illegal_lifecycle';
  await seedContract(contractId, { workflowVersion: 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1', intakeId: contractId, inspectionVerified: true });
  await db.doc(`intake_submissions/${contractId}`).set({ ownerUid: owner.uid, ownerOnboardingState: 'SITE_VISITS_SCHEDULED' });
  await seedOtp('otp_n31_illegal_lifecycle', contractId);
  await expectHttpsError(sign(contractId, 'otp_n31_illegal_lifecycle'), 'failed-precondition');
  assert.equal((await db.doc(`contracts/${contractId}`).get()).get('ownerSigned'), false);
  assert.equal((await db.doc('contract_signature_otps/otp_n31_illegal_lifecycle').get()).get('consumedFor'), undefined);
  const [files] = await admin.storage().bucket().getFiles({ prefix: `contracts/${contractId}/` });
  assert.equal(files.length, 0);
});
