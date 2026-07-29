#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const API_KEY = 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s';
const APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const STORAGE_BUCKET = 'bin-group-57c60.firebasestorage.app';
const FUNCTIONS_BASE = `https://europe-west3-${PROJECT_ID}.cloudfunctions.net`;
const WEB_REFERER = 'https://bin-group-57c60.web.app/';
const BRANDED_FROM = 'BIN GROUP <ceo@bin-groups.com>';
const BRANDED_REPLY_TO = 'BIN GROUP Admin <ceo@bin-groups.com>';
const OUTPUT_PATH = path.resolve('launch_package/artifacts/owner-onboarding-production-evidence.json');

const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const safeId = (value, fallback = 'evidence') => text(value)
  .replace(/[^A-Za-z0-9_-]/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 180) || fallback;

const ownerEmail = text(process.env.E2E_OWNER_EMAIL).toLowerCase();
const ownerPassword = text(process.env.E2E_OWNER_PASSWORD);
const adminEmail = text(process.env.E2E_ADMIN_EMAIL).toLowerCase();
const adminPassword = text(process.env.E2E_ADMIN_PASSWORD);
const appCheckDebugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);

for (const [name, value] of Object.entries({
  E2E_OWNER_EMAIL: ownerEmail,
  E2E_OWNER_PASSWORD: ownerPassword,
  E2E_ADMIN_EMAIL: adminEmail,
  E2E_ADMIN_PASSWORD: adminPassword,
  VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: appCheckDebugToken,
})) {
  assert(value, `${name} is required for Owner production evidence.`);
}
assert(/^[0-9a-f-]{36}$/i.test(appCheckDebugToken), 'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN must be a registered debug UUID.');

const projectId = resolveFirebaseAdminProjectId();
assert(projectId === PROJECT_ID, `Owner evidence must run against ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);
const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket(STORAGE_BUCKET);

async function jsonRequest(url, options, label) {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let body = {};
  try {
    body = bodyText ? JSON.parse(bodyText) : {};
  } catch {
    body = { raw: bodyText };
  }
  if (!response.ok) {
    throw new Error(`${label} failed HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function exchangeAppCheckToken() {
  const url = new URL(`https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(APP_ID)}:exchangeDebugToken`);
  url.searchParams.set('key', API_KEY);
  const body = await jsonRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: WEB_REFERER },
    body: JSON.stringify({ debugToken: appCheckDebugToken }),
  }, 'App Check debug-token exchange');
  assert(text(body.token), 'App Check exchange did not return a token.');
  return text(body.token);
}

async function signIn(email, password) {
  const body = await jsonRequest(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: WEB_REFERER },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
    `Firebase Auth sign-in for ${email}`,
  );
  assert(text(body.idToken) && text(body.localId), `Firebase Auth did not return an ID token for ${email}.`);
  return { idToken: text(body.idToken), uid: text(body.localId), email: text(body.email).toLowerCase() };
}

async function callFunction(name, data, appCheckToken, idToken = '') {
  const headers = {
    'Content-Type': 'application/json',
    'X-Firebase-AppCheck': appCheckToken,
  };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const body = await jsonRequest(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  }, `Callable ${name}`);
  if (body.error) throw new Error(`Callable ${name} error: ${JSON.stringify(body.error)}`);
  return body.result ?? body.data ?? body;
}

async function deleteQuery(query) {
  while (true) {
    const snapshot = await query.limit(200).get();
    if (snapshot.empty) return;
    const batch = db.batch();
    snapshot.docs.forEach((document) => batch.delete(document.ref));
    await batch.commit();
    if (snapshot.size < 200) return;
  }
}

async function deleteOwnerScopedRecords(uid) {
  if (!uid) return;
  const collections = [
    'payment_transactions',
    'contracts',
    'intake_submissions',
    'properties',
    'propertyPassports',
    'owner_registration_requests',
    'pending_owners',
    'invoices',
    'contract_signature_otps',
  ];
  for (const collectionName of collections) {
    await deleteQuery(db.collection(collectionName).where('ownerUid', '==', uid));
    await deleteQuery(db.collection(collectionName).where('ownerId', '==', uid));
  }
  await Promise.all([
    db.collection('users').doc(uid).delete().catch(() => undefined),
    db.collection('owners').doc(uid).delete().catch(() => undefined),
    db.collection('owner_dashboard_unlocks').doc(uid).delete().catch(() => undefined),
    db.collection('contract_signature_otp_rate_limits').doc(uid).delete().catch(() => undefined),
  ]);
}

async function resetOwnerAccount() {
  try {
    const existing = await auth.getUserByEmail(ownerEmail);
    await deleteOwnerScopedRecords(existing.uid);
    await auth.deleteUser(existing.uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
}

function minimalPdf(label, nonce) {
  const safe = `${label} ${nonce}`.replace(/[()\\]/g, '_');
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 720 Td (${safe}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \ntrailer<</Root 1 0 R/Size 5>>\nstartxref\n0\n%%EOF\n`, 'utf8');
}

async function uploadProofDocument(ownerSession, appCheckToken, intakeId, docType, label) {
  const payload = minimalPdf(label, randomUUID());
  const result = await callFunction('uploadOwnerOnboardingProofDocument', {
    ownerUid: ownerSession.uid,
    ownerEmail,
    intakeId,
    onboardingSessionId: intakeId,
    docType,
    filename: `${docType}.pdf`,
    contentType: 'application/pdf',
    encodedDocument: payload.toString('base64'),
  }, appCheckToken, ownerSession.idToken);
  assert(text(result.downloadUrl).startsWith('https://'), `${docType} upload did not return a secure URL.`);
  assert(text(result.storagePath).startsWith(`onboarding-proof/${ownerSession.uid}/${intakeId}/`), `${docType} upload path is not owner scoped.`);
  const [exists] = await bucket.file(text(result.storagePath)).exists();
  assert(exists, `${docType} upload is missing from production Storage.`);
  return result;
}

function multipartUploadBody(boundary, metadata, bytes, contentType) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`, 'utf8'),
    Buffer.from(`--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`, 'utf8'),
    bytes,
    Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'),
  ]);
}

async function uploadReceipt(ownerSession, appCheckToken, intakeId, attempt) {
  const bytes = minimalPdf(`BIN GROUP bank receipt attempt ${attempt}`, randomUUID());
  const receiptHash = sha256(bytes);
  const storagePath = `payment-references/owners/${ownerSession.uid}/${intakeId}/${Date.now()}_attempt_${attempt}_receipt.pdf`;
  const downloadToken = randomUUID();
  const boundary = `bin_group_${randomUUID().replace(/-/g, '')}`;
  const metadata = {
    name: storagePath,
    contentType: 'application/pdf',
    metadata: {
      firebaseStorageDownloadTokens: downloadToken,
      ownerUid: ownerSession.uid,
      paymentId: intakeId,
      evidenceType: 'owner_payment_receipt',
      receiptHash,
      uploadedBy: ownerEmail,
      uploadedAt: new Date().toISOString(),
    },
  };
  const url = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(STORAGE_BUCKET)}/o?uploadType=multipart&name=${encodeURIComponent(storagePath)}`;
  const request = async (authorization) => jsonRequest(url, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'X-Firebase-AppCheck': appCheckToken,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartUploadBody(boundary, metadata, bytes, 'application/pdf'),
  }, `Owner receipt upload attempt ${attempt}`);

  let result;
  try {
    result = await request(`Firebase ${ownerSession.idToken}`);
  } catch (firstError) {
    result = await request(`Bearer ${ownerSession.idToken}`).catch(() => { throw firstError; });
  }
  const [storedMetadata] = await bucket.file(storagePath).getMetadata();
  assert(text(storedMetadata.generation), `Receipt attempt ${attempt} has no immutable Storage generation.`);
  assert(text(storedMetadata.metadata?.ownerUid) === ownerSession.uid, `Receipt attempt ${attempt} owner metadata mismatch.`);
  assert(text(storedMetadata.metadata?.paymentId) === intakeId, `Receipt attempt ${attempt} payment metadata mismatch.`);
  assert(text(storedMetadata.metadata?.evidenceType) === 'owner_payment_receipt', `Receipt attempt ${attempt} evidence type mismatch.`);
  assert(text(storedMetadata.metadata?.receiptHash) === receiptHash, `Receipt attempt ${attempt} hash metadata mismatch.`);
  return {
    receiptHash,
    receiptPath: storagePath,
    receiptGeneration: text(storedMetadata.generation || result.generation),
    receiptUrl: `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`,
    receiptName: `attempt_${attempt}_receipt.pdf`,
  };
}

async function deriveOtp(requestId) {
  const snapshot = await db.collection('contract_signature_otps').doc(requestId).get();
  assert(snapshot.exists, `OTP evidence ${requestId} was not persisted.`);
  const value = snapshot.data() || {};
  const expectedHash = text(value.otpHash);
  const salt = text(value.salt);
  assert(/^[a-f0-9]{64}$/.test(expectedHash) && salt, 'OTP evidence is missing its protected hash and salt.');
  assert(text(value.delivery?.messageId), 'Contract OTP SMTP provider did not return a message ID.');
  for (let number = 0; number <= 999999; number += 1) {
    const code = String(number).padStart(6, '0');
    if (sha256(`${code}:${salt}`) === expectedHash) {
      return { code, providerMessageId: text(value.delivery?.messageId) };
    }
  }
  throw new Error(`Unable to derive the six-digit OTP for protected test evidence ${requestId}.`);
}

async function verifyContractOtp(ownerSession, appCheckToken, intakeId, quoteHash, signatureName, propertyName) {
  const requested = await callFunction('requestContractSignatureOtp', {
    email: ownerEmail,
    contractId: intakeId,
    contractHash: quoteHash,
    propertyName,
  }, appCheckToken, ownerSession.idToken);
  const requestId = text(requested.requestId);
  assert(requestId, 'Contract OTP request did not return a request ID.');
  const derived = await deriveOtp(requestId);
  const verified = await callFunction('verifyContractSignatureOtp', {
    requestId,
    otp: derived.code,
    signature: signatureName,
  }, appCheckToken, ownerSession.idToken);
  assert(verified.ok === true && text(verified.verificationId) === requestId, 'Contract OTP verification failed.');
  return { verificationId: requestId, providerMessageId: derived.providerMessageId };
}

function paymentManifest(configuration, quote, receipt, reference) {
  return {
    method: 'BANK_TRANSFER',
    amount: quote.activationDeposit,
    activationDeposit: quote.activationDeposit,
    annualContractValue: quote.annualContractValue,
    currency: 'AED',
    configVersion: configuration.version,
    paymentConfigVersion: configuration.version,
    configHash: configuration.configHash,
    paymentConfigHash: configuration.configHash,
    configEffectiveAtMs: configuration.effectiveAtMs,
    legalBeneficiary: configuration.legalBeneficiary,
    payableTo: configuration.legalBeneficiary,
    bankName: configuration.bankName,
    accountNumber: configuration.accountNumber,
    iban: configuration.iban,
    swiftBic: configuration.swiftBic,
    officeLocation: configuration.officeLocation,
    paymentPlan: 'annual',
    reference,
    ...receipt,
  };
}

function packagePayload({ ownerSession, intakeId, property, quote, configuration, receipt, documents, otpVerificationId, signatureName, reference }) {
  return {
    ownerUid: ownerSession.uid,
    ownerEmail,
    intakeId,
    onboardingSessionId: intakeId,
    paymentMethod: 'BANK_TRANSFER',
    amount: quote.activationDeposit,
    activationDeposit: quote.activationDeposit,
    annualContractValue: quote.annualContractValue,
    quoteHash: quote.quoteHash,
    quoteQuotedAtMs: quote.quotedAtMs,
    paymentConfigVersion: configuration.version,
    paymentConfigHash: configuration.configHash,
    paymentManifest: paymentManifest(configuration, quote, receipt, reference),
    companyProfile: {
      name: 'E2E Private Owner Portfolio',
      licenseNumber: '',
      contactPerson: signatureName,
      email: ownerEmail,
      phone: '+971500000000',
    },
    serviceDetails: {
      properties: 1,
      totalUnits: property.units,
      selectedPlan: 'MAINTENANCE ONLY',
      selectedAddOns: [],
      contractMode: 'FM_ONLY',
      paymentPlan: 'annual',
    },
    documentUrls: {
      propertyProof: documents.propertyProof.downloadUrl,
      emiratesId: documents.emiratesId.downloadUrl,
      passport: documents.passport.downloadUrl,
      tradeLicense: '',
      tenancySupport: '',
    },
    properties: [property],
    signatureName,
    otpVerificationId,
    paymentPlan: 'annual',
  };
}

async function waitForMailDelivery(mailId, recipient, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  const ref = db.collection('mail').doc(mailId);
  while (Date.now() < deadline) {
    const snapshot = await ref.get();
    if (snapshot.exists) {
      const value = snapshot.data() || {};
      const delivery = value.delivery || {};
      const state = upper(delivery.state);
      if (state === 'SUCCESS') {
        const accepted = Array.isArray(delivery.accepted) ? delivery.accepted.map((entry) => text(entry).toLowerCase()) : [];
        const rejected = Array.isArray(delivery.rejected) ? delivery.rejected : [];
        assert(text(delivery.messageId), `${mailId} is marked SUCCESS without a provider message ID.`);
        assert(text(delivery.from) === BRANDED_FROM, `${mailId} did not preserve the approved From identity.`);
        assert(text(delivery.replyTo) === BRANDED_REPLY_TO, `${mailId} did not preserve the approved Reply-To identity.`);
        assert(accepted.includes(recipient.toLowerCase()), `${mailId} was not accepted for the intended Owner recipient.`);
        assert(rejected.length === 0, `${mailId} has rejected recipients.`);
        return { mailId, providerMessageId: text(delivery.messageId), state };
      }
      if (state === 'ERROR') throw new Error(`${mailId} delivery failed: ${text(delivery.error) || 'unknown SMTP error'}`);
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for provider delivery confirmation for ${mailId}.`);
}

async function waitForDocument(ref, predicate, label, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await ref.get();
    const value = snapshot.data() || {};
    if (snapshot.exists && predicate(value)) return value;
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function main() {
  const startedAt = new Date().toISOString();
  const runId = safeId(process.env.GITHUB_RUN_ID || Date.now(), 'local');
  const intakeId = safeId(`e2e_owner_onboarding_${runId}_${Date.now()}`, `e2e_owner_${Date.now()}`);
  const signatureName = 'E2E Owner Production Evidence';
  const propertyName = 'E2E Owner Acquisition Tower';
  const appCheckToken = await exchangeAppCheckToken();

  await resetOwnerAccount();

  const registration = await callFunction('submitPendingOwnerRegistration', {
    fullName: signatureName,
    email: ownerEmail,
    mobile: '+971500000000',
    password: ownerPassword,
    intakeId,
  }, appCheckToken);
  const ownerUid = text(registration.ownerUid || registration.uid);
  assert(ownerUid, 'New Owner registration did not create an Auth UID.');
  assert(registration.dashboardLocked === true, 'New Owner registration must start with a locked dashboard.');

  const createdOwner = await auth.getUser(ownerUid);
  await auth.updateUser(ownerUid, { emailVerified: true, disabled: false, displayName: signatureName });
  await auth.setCustomUserClaims(ownerUid, { ...(createdOwner.customClaims || {}), role: 'owner', testAccount: true });
  await db.collection('users').doc(ownerUid).set({
    testAccount: true,
    role: 'owner',
    status: 'pending_admin_approval',
    dashboardLocked: true,
    dashboardUnlocked: false,
    adminApproved: false,
    paymentVerified: false,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const ownerSession = await signIn(ownerEmail, ownerPassword);
  assert(ownerSession.uid === ownerUid, 'New Owner sign-in UID does not match the acquired account.');
  const adminSession = await signIn(adminEmail, adminPassword);

  const nowIso = new Date().toISOString();
  const property = {
    id: 'e2e-owner-acquisition-property',
    emirate: 'Abu Dhabi',
    area: 'Al Reem Island',
    zone: 'B',
    propertyType: 'Building',
    subType: 'Residential Building',
    useType: 'Rental',
    ownerType: 'Private',
    floors: 8,
    units: 24,
    bedrooms: 24,
    bathrooms: 24,
    shops: 0,
    offices: 0,
    rooms: 0,
    sqft: 42000,
    age: 5,
    annualRent: 960000,
    annualRevenue: 960000,
    pool: false,
    lifts: 2,
    tank: true,
    bmu: false,
    sira: true,
    fireAlarm: true,
    firePump: true,
    escalators: false,
    centralLPG: false,
    wasteMan: true,
    gen: true,
    hvac: true,
    hvacCount: 24,
    districtCooling: true,
    electrical: true,
    plumbing: true,
    drainage: true,
    pumps: true,
    emergencyLighting: true,
    accessControl: true,
    bms: true,
    iotSensors: true,
    gym: false,
    majlis: false,
    majlisType: 'none',
    missions: [],
    condition: 'Good',
    assetGrade: 'Premium',
    assetClass: 'Residential Building',
    serviceModel: 'FM_ONLY',
    currentStatus: 'Active',
    address: `${propertyName}, Al Reem Island, Abu Dhabi`,
    strategy: 'fm_only',
    slaTier: 'standard',
    paymentPlan: 'annual',
    titleDeedStatus: 'uploaded',
    geo: {
      point: { latitude: 24.4958, longitude: 54.4074 },
      lat: 24.4958,
      lng: 54.4074,
      geohash: 'thqejx0m',
      source: 'e2e-production-owner-proof',
      placeId: 'e2e-owner-acquisition-tower',
      address: `${propertyName}, Al Reem Island, Abu Dhabi`,
      emirate: 'Abu Dhabi',
      city: 'Abu Dhabi',
      area: 'Al Reem Island',
      verified: true,
      dispatchReady: true,
      requiresGeoReview: false,
      verifiedAt: nowIso,
      updatedAt: nowIso,
    },
  };

  const configuration = await callFunction('getOwnerPaymentConfiguration', {}, appCheckToken, ownerSession.idToken);
  assert(configuration.currency === 'AED', 'Owner payment configuration must be AED.');
  assert(Array.isArray(configuration.approvedMethods) && configuration.approvedMethods.includes('BANK_TRANSFER'), 'BANK_TRANSFER must be enabled for Owner production evidence.');

  const documents = {
    propertyProof: await uploadProofDocument(ownerSession, appCheckToken, intakeId, 'propertyProof', 'Property ownership proof'),
    emiratesId: await uploadProofDocument(ownerSession, appCheckToken, intakeId, 'emiratesId', 'Emirates ID proof'),
    passport: await uploadProofDocument(ownerSession, appCheckToken, intakeId, 'passport', 'Passport proof'),
  };

  const initialQuote = await callFunction('previewOwnerOnboardingQuote', { properties: [property], selectedAddOns: [] }, appCheckToken, ownerSession.idToken);
  assert(/^[a-f0-9]{64}$/.test(text(initialQuote.quoteHash)), 'Initial server quote hash is invalid.');
  assert(initialQuote.activationDeposit === Math.round(initialQuote.annualContractValue * 0.15), 'Initial quote does not enforce the exact 15% mobilization deposit.');
  const initialOtp = await verifyContractOtp(ownerSession, appCheckToken, intakeId, initialQuote.quoteHash, signatureName, propertyName);
  const initialReceipt = await uploadReceipt(ownerSession, appCheckToken, intakeId, 1);
  const initialReference = `E2E-BANK-${runId}-A1`;
  const initialPayload = packagePayload({
    ownerSession,
    intakeId,
    property,
    quote: initialQuote,
    configuration,
    receipt: initialReceipt,
    documents,
    otpVerificationId: initialOtp.verificationId,
    signatureName,
    reference: initialReference,
  });

  const initialSubmission = await callFunction('submitOwnerOnboardingPaymentPackage', initialPayload, appCheckToken, ownerSession.idToken);
  assert(initialSubmission.success === true && initialSubmission.idempotent === false, 'Initial Owner package was not created as a new submission.');
  const duplicateSubmission = await callFunction('submitOwnerOnboardingPaymentPackage', initialPayload, appCheckToken, ownerSession.idToken);
  assert(duplicateSubmission.success === true && duplicateSubmission.idempotent === true, 'Duplicate Owner package submission was not idempotent.');

  const initialPayment = await waitForDocument(
    db.collection('payment_transactions').doc(intakeId),
    (value) => upper(value.status || value.paymentStatus) === 'PENDING' && value.otpEvidenceVerified === true,
    'initial Owner payment package',
  );
  assert(text(initialPayment.quoteHash) === initialQuote.quoteHash, 'Initial payment quote hash mismatch.');
  assert(text(initialPayment.paymentProofHash) === initialReceipt.receiptHash, 'Initial receipt hash was not preserved on payment evidence.');
  assert(text(initialPayment.paymentProofGeneration) === initialReceipt.receiptGeneration, 'Initial receipt generation was not preserved.');
  assert(text(initialPayment.contractUrl).startsWith('https://'), 'Initial signed contract URL is missing.');
  const initialUser = (await db.collection('users').doc(ownerUid).get()).data() || {};
  assert(initialUser.dashboardLocked === true && initialUser.dashboardUnlocked !== true, 'Owner dashboard unlocked before admin approval.');

  const initialQuoteKey = safeId(initialQuote.quoteHash.slice(0, 16), 'quote');
  const initialOnboardingMail = await waitForMailDelivery(`owner_onboarding_${intakeId}_${initialQuoteKey}`, ownerEmail);
  const initialContractMail = await waitForMailDelivery(`owner_contract_${intakeId}_${initialQuoteKey}`, ownerEmail);

  const rejected = await callFunction('adminRejectPayment', {
    paymentId: intakeId,
    reason: 'E2E production proof: receipt requires corrected bank reference.',
  }, appCheckToken, adminSession.idToken);
  assert(rejected.status === 'SUCCESS' && rejected.idempotent === false, 'Admin rejection callable did not complete successfully.');
  const rejectedPayment = await waitForDocument(
    db.collection('payment_transactions').doc(intakeId),
    (value) => upper(value.status || value.paymentStatus) === 'REJECTED',
    'Owner payment rejection',
  );
  assert(upper(rejectedPayment.verificationState) === 'ADMIN_REJECTED', 'Rejected payment verification state is not locked.');
  const rejectedUser = (await db.collection('users').doc(ownerUid).get()).data() || {};
  assert(rejectedUser.dashboardLocked === true && rejectedUser.dashboardUnlocked !== true, 'Rejected Owner dashboard was not locked.');
  const rejectionMail = await waitForMailDelivery(`owner_payment_rejected_${intakeId}_${initialQuoteKey}`, ownerEmail);

  await sleep(25);
  const resubmissionQuote = await callFunction('previewOwnerOnboardingQuote', { properties: [property], selectedAddOns: [] }, appCheckToken, ownerSession.idToken);
  assert(resubmissionQuote.quoteHash !== initialQuote.quoteHash, 'Resubmission did not rotate the server quote version.');
  assert(resubmissionQuote.activationDeposit === Math.round(resubmissionQuote.annualContractValue * 0.15), 'Resubmission quote does not enforce the exact 15% mobilization deposit.');
  const resubmissionOtp = await verifyContractOtp(ownerSession, appCheckToken, intakeId, resubmissionQuote.quoteHash, signatureName, propertyName);
  const resubmissionReceipt = await uploadReceipt(ownerSession, appCheckToken, intakeId, 2);
  assert(resubmissionReceipt.receiptHash !== initialReceipt.receiptHash, 'Resubmission receipt did not rotate immutable evidence.');
  const resubmissionReference = `E2E-BANK-${runId}-A2`;
  const resubmissionPayload = packagePayload({
    ownerSession,
    intakeId,
    property,
    quote: resubmissionQuote,
    configuration,
    receipt: resubmissionReceipt,
    documents,
    otpVerificationId: resubmissionOtp.verificationId,
    signatureName,
    reference: resubmissionReference,
  });
  const resubmitted = await callFunction('submitOwnerOnboardingPaymentPackage', resubmissionPayload, appCheckToken, ownerSession.idToken);
  assert(resubmitted.success === true && resubmitted.idempotent === false, 'Rejected Owner package did not resubmit as a new quote version.');

  const pendingResubmission = await waitForDocument(
    db.collection('payment_transactions').doc(intakeId),
    (value) => upper(value.status || value.paymentStatus) === 'PENDING' && text(value.quoteHash) === resubmissionQuote.quoteHash,
    'Owner payment resubmission',
  );
  assert(text(pendingResubmission.paymentProofHash) === resubmissionReceipt.receiptHash, 'Resubmitted receipt hash was not stored.');
  assert(text(pendingResubmission.paymentProofGeneration) === resubmissionReceipt.receiptGeneration, 'Resubmitted receipt generation was not stored.');
  assert(Array.isArray(pendingResubmission.previousQuoteHashes) && pendingResubmission.previousQuoteHashes.includes(initialQuote.quoteHash), 'Rejected quote history was not retained.');

  const resubmissionQuoteKey = safeId(resubmissionQuote.quoteHash.slice(0, 16), 'quote');
  const resubmissionOnboardingMail = await waitForMailDelivery(`owner_onboarding_${intakeId}_${resubmissionQuoteKey}`, ownerEmail);
  const resubmissionContractMail = await waitForMailDelivery(`owner_contract_${intakeId}_${resubmissionQuoteKey}`, ownerEmail);

  const approvalPayload = {
    paymentId: intakeId,
    paymentReferenceId: resubmissionReference,
    amountReceived: resubmissionQuote.activationDeposit,
    method: 'BANK_TRANSFER',
    receivedAt: new Date().toISOString(),
    notes: 'E2E production Owner onboarding approval.',
  };
  const approved = await callFunction('adminApprovePayment', approvalPayload, appCheckToken, adminSession.idToken);
  assert(approved.status === 'SUCCESS' && approved.idempotent === false, 'Owner payment approval did not activate the account.');
  const duplicateApproval = await callFunction('adminApprovePayment', approvalPayload, appCheckToken, adminSession.idToken);
  assert(duplicateApproval.status === 'SUCCESS' && duplicateApproval.idempotent === true, 'Duplicate admin approval was not idempotent.');

  const activatedPayment = await waitForDocument(
    db.collection('payment_transactions').doc(intakeId),
    (value) => upper(value.status || value.paymentStatus) === 'APPROVED' && value.unblocksDashboard !== false && value.unlocksDashboard === true && value.paymentVerified === true,
    'approved Owner payment activation',
  );
  const activatedContract = (await db.collection('contracts').doc(intakeId).get()).data() || {};
  const activatedUser = (await db.collection('users').doc(ownerUid).get()).data() || {};
  const propertySnapshot = await db.collection('properties').where('intakeId', '==', intakeId).get();
  const passportSnapshot = await db.collection('propertyPassports').where('intakeId', '==', intakeId).get();
  const invoiceId = text(activatedPayment.invoiceId);
  const invoice = (await db.collection('invoices').doc(invoiceId).get()).data() || {};

  assert(upper(activatedContract.status) === 'ACTIVE' && activatedContract.adminApproved === true, 'Contract was not activated exactly once.');
  assert(activatedUser.dashboardUnlocked === true && activatedUser.dashboardLocked === false, 'Owner dashboard did not unlock after approval.');
  assert(activatedUser.paymentVerified === true && activatedUser.adminApproved === true, 'Owner approval flags are incomplete.');
  assert(propertySnapshot.size === 1, `Expected one activated acquisition property; found ${propertySnapshot.size}.`);
  propertySnapshot.docs.forEach((document) => {
    const value = document.data() || {};
    assert(upper(value.status) === 'ACTIVE' && upper(value.activationStatus) === 'ACTIVE', `${document.id} is not active.`);
  });
  assert(passportSnapshot.size === 1 && passportSnapshot.docs.every((document) => document.data()?.activated === true), 'Property passport did not activate.');
  assert(invoiceId && text(invoice.proofHash) === text(activatedPayment.invoiceProofHash), 'Mobilization invoice hash is missing or inconsistent.');
  assert(Number(invoice.amount) === resubmissionQuote.activationDeposit, 'Mobilization invoice amount does not match the locked 15% deposit.');

  const invoiceMail = await waitForMailDelivery(`owner_invoice_${intakeId}_${invoiceId}`, ownerEmail);
  const invoiceCount = await db.collection('invoices').where('paymentId', '==', intakeId).get();
  assert(invoiceCount.size === 1, `Duplicate approval created ${invoiceCount.size} invoices instead of one.`);

  const evidence = {
    schemaVersion: 1,
    status: 'passed',
    source: 'run-owner-onboarding-production-evidence',
    projectId,
    productionUrl: 'https://bin-group-57c60.web.app',
    commitSha: text(process.env.GITHUB_SHA),
    workflowRunId: text(process.env.GITHUB_RUN_ID),
    startedAt,
    finishedAt: new Date().toISOString(),
    owner: {
      uid: ownerUid,
      emailDomain: ownerEmail.split('@')[1] || '',
      acquiredThroughCallable: true,
      authenticated: true,
      dashboardStartedLocked: true,
      dashboardUnlockedAfterApproval: true,
    },
    onboarding: {
      intakeId,
      propertyCount: propertySnapshot.size,
      documentTypes: ['propertyProof', 'emiratesId', 'passport'],
      serverQuoteHashInitial: initialQuote.quoteHash,
      serverQuoteHashResubmission: resubmissionQuote.quoteHash,
      annualContractValue: resubmissionQuote.annualContractValue,
      activationDeposit: resubmissionQuote.activationDeposit,
      mobilizationPercent: 15,
      contractUrlPresent: true,
      initialSubmissionIdempotentReplay: true,
      adminRejectionProven: true,
      resubmissionProven: true,
      approvalIdempotentReplay: true,
      invoiceId,
      invoiceProofHash: text(invoice.proofHash),
    },
    receiptEvidence: {
      initialHash: initialReceipt.receiptHash,
      initialGeneration: initialReceipt.receiptGeneration,
      resubmissionHash: resubmissionReceipt.receiptHash,
      resubmissionGeneration: resubmissionReceipt.receiptGeneration,
      rotated: initialReceipt.receiptHash !== resubmissionReceipt.receiptHash,
    },
    emailDelivery: {
      contractOtpInitialProviderMessageId: initialOtp.providerMessageId,
      contractOtpResubmissionProviderMessageId: resubmissionOtp.providerMessageId,
      initialOnboardingMail,
      initialContractMail,
      rejectionMail,
      resubmissionOnboardingMail,
      resubmissionContractMail,
      invoiceMail,
    },
    hardLaunchClaim: false,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`[owner-onboarding-evidence] PASS intake=${intakeId} invoice=${invoiceId}`);
  console.log(`[owner-onboarding-evidence] wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('[owner-onboarding-evidence] FAIL', error?.stack || error);
  process.exit(1);
});
