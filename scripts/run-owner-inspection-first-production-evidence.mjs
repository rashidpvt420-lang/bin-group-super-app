#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { exchangeGmailAccessToken, readGmailOtp } from './lib/gmail-otp-reader.mjs';
import { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';

const PROJECT_ID = 'bin-group-57c60';
const API_KEY = 'AIzaSyCd-QdM7mjECh9UqDKk1ofBemanpTRgd4s';
const APP_ID = '1:123413252227:web:285cb53bc26626d699f3b6';
const STORAGE_BUCKET = 'bin-group-57c60.firebasestorage.app';
const FUNCTIONS_BASE = `https://europe-west3-${PROJECT_ID}.cloudfunctions.net`;
const WEB_REFERER = 'https://bin-group-57c60.web.app/';
const ADMIN_REFERER = 'https://bin-group-admin-panel.web.app/';
const OUTPUT_PATH = path.resolve('launch_package/artifacts/owner-onboarding-production-evidence.json');
const WORKFLOW_VERSION = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';
const OTP_HASH_ALGORITHM = 'HMAC_SHA256_OWNER_INSPECTION_V1';
const CANONICAL_FOUNDER_EMAIL = 'ceo@bin-groups.com';

const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const safeId = (value, fallback = 'evidence') => text(value)
  .replace(/[^A-Za-z0-9_-]/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 180) || fallback;
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const ownerEmail = text(process.env.E2E_OWNER_EMAIL).toLowerCase();
const ownerPassword = text(process.env.E2E_OWNER_PASSWORD);
const ownerMailboxEmail = text(process.env.E2E_OWNER_MAILBOX_EMAIL).toLowerCase();
const founderEmail = text(process.env.E2E_FOUNDER_EMAIL).toLowerCase();
const founderPassword = text(process.env.E2E_FOUNDER_PASSWORD);
const founderTotpSecret = text(process.env.E2E_FOUNDER_TOTP_SECRET);
const appCheckDebugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);

for (const [name, value] of Object.entries({
  E2E_OWNER_EMAIL: ownerEmail,
  E2E_OWNER_PASSWORD: ownerPassword,
  E2E_OWNER_MAILBOX_EMAIL: ownerMailboxEmail,
  E2E_FOUNDER_EMAIL: founderEmail,
  E2E_FOUNDER_PASSWORD: founderPassword,
  E2E_FOUNDER_TOTP_SECRET: founderTotpSecret,
  VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: appCheckDebugToken,
})) {
  assert(value, `${name} is required for inspection-first Owner production evidence.`);
}
assert(ownerEmail === ownerMailboxEmail, 'The Owner evidence account must be the protected Owner mailbox.');
assert(founderEmail === CANONICAL_FOUNDER_EMAIL, `E2E_FOUNDER_EMAIL must be ${CANONICAL_FOUNDER_EMAIL}.`);
assert(/^[0-9a-f-]{36}$/i.test(appCheckDebugToken), 'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN must be a registered debug UUID.');

const projectId = resolveFirebaseAdminProjectId();
assert(projectId === PROJECT_ID, `Owner evidence must run against ${PROJECT_ID}; got ${projectId}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);
const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket(STORAGE_BUCKET);

function minimalPdf(label, nonce = randomUUID()) {
  const safe = `${label} ${nonce}`.replace(/[()\\]/g, '_');
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 720 Td (${safe}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \ntrailer<</Root 1 0 R/Size 5>>\nstartxref\n0\n%%EOF\n`, 'utf8');
}

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
  if (body?.error) throw new Error(`${label} callable error: ${JSON.stringify(body.error)}`);
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

async function signInOwner() {
  const body = await jsonRequest(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Referer: WEB_REFERER },
      body: JSON.stringify({ email: ownerEmail, password: ownerPassword, returnSecureToken: true }),
    },
    `Firebase Auth sign-in for ${ownerEmail}`,
  );
  assert(text(body.idToken) && text(body.localId), 'Firebase Auth did not return the Owner ID token and UID.');
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
    'property_inspections',
    'maintenanceTickets',
    'technician_dispatch_jobs',
    'notifications',
  ];
  for (const collectionName of collections) {
    await deleteQuery(db.collection(collectionName).where('ownerUid', '==', uid));
    await deleteQuery(db.collection(collectionName).where('ownerId', '==', uid));
    await deleteQuery(db.collection(collectionName).where('userId', '==', uid));
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

async function waitForDocument(ref, predicate, label, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await ref.get();
    const value = snapshot.data() || {};
    if (snapshot.exists && predicate(value)) return value;
    await sleep(1500);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function waitForMailDelivery(mailId, recipient, timeoutMs = 120_000) {
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
        assert(text(delivery.messageId), `${mailId} is marked SUCCESS without a provider message ID.`);
        assert(accepted.includes(recipient.toLowerCase()), `${mailId} was not accepted for the intended Owner recipient.`);
        return { mailId, providerMessageId: text(delivery.messageId), state };
      }
      if (state === 'ERROR') throw new Error(`${mailId} delivery failed: ${text(delivery.error) || 'unknown SMTP error'}`);
    }
    await sleep(3000);
  }
  throw new Error(`Timed out waiting for provider delivery confirmation for ${mailId}.`);
}

function resolveOwnerMailboxSecret(name) {
  const configured = text(process.env[name]);
  if (configured) return configured;
  try {
    return text(execFileSync(
      'npx',
      ['firebase', 'functions:secrets:access', name, '--project', PROJECT_ID],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ));
  } catch {
    throw new Error(`${name} is required as an environment value or Firebase Secret Manager secret.`);
  }
}

async function ownerMailboxAccessToken() {
  return exchangeGmailAccessToken({
    clientId: resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_CLIENT_ID'),
    clientSecret: resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_CLIENT_SECRET'),
    refreshToken: resolveOwnerMailboxSecret('E2E_OWNER_MAILBOX_REFRESH_TOKEN'),
    label: 'Owner mailbox',
  });
}

async function retrieveInspectionSignatureOtp(requestId, timeoutMs = 120_000) {
  const snapshot = await db.collection('contract_signature_otps').doc(requestId).get();
  assert(snapshot.exists, `OTP evidence ${requestId} was not persisted.`);
  const value = snapshot.data() || {};
  assert(value.otpHashAlgorithm === OTP_HASH_ALGORITHM, 'Owner OTP evidence is not protected by the inspection-first HMAC algorithm.');
  assert(value.otp === undefined && value.code === undefined, 'Owner OTP evidence must never store a plaintext code.');
  assert(value.testEvidence === undefined, 'Owner OTP evidence must not expose test-retrieval material.');
  const providerMessageId = text(value.delivery?.messageId);
  assert(providerMessageId && value.delivery?.providerAccepted === true, 'Owner signature email was not accepted by the SMTP provider.');
  const requestedAt = value.delivery?.sentAt?.toMillis?.() || value.createdAt?.toMillis?.() || Date.now() - 60_000;
  const receipt = await readGmailOtp({
    accessToken: await ownerMailboxAccessToken(),
    expectedMailboxEmail: ownerMailboxEmail,
    sender: CANONICAL_FOUNDER_EMAIL,
    recipient: ownerEmail,
    subject: 'BIN GROUP property application signature OTP',
    correlationId: requestId,
    providerMessageId,
    requestedAtMs: requestedAt,
    otpPattern: /signature OTP is\s*(\d{6})/i,
    timeoutMs,
    label: 'Owner inspection-first signature OTP',
  });
  return {
    code: receipt.otp,
    providerMessageId,
    mailboxReceiptVerified: true,
    mailboxReceivedAt: receipt.receivedAt,
    mailboxMessageIdHash: receipt.messageIdHash,
  };
}

async function verifyInspectionSignatureOtp(ownerSession, appCheckToken, intakeId, quoteHash, signatureName, propertyName) {
  const requested = await callFunction('requestOwnerInspectionSignatureOtp', {
    contractId: intakeId,
    contractHash: quoteHash,
    propertyName,
  }, appCheckToken, ownerSession.idToken);
  const requestId = text(requested.requestId);
  assert(requestId && requested.deliveryConfirmed === true, 'Inspection-first OTP request was not delivered.');
  const mailboxEvidence = await retrieveInspectionSignatureOtp(requestId);
  const verified = await callFunction('verifyOwnerInspectionSignatureOtp', {
    requestId,
    otp: mailboxEvidence.code,
    signature: signatureName,
  }, appCheckToken, ownerSession.idToken);
  assert(verified.ok === true && text(verified.verificationId) === requestId, 'Inspection-first OTP verification failed.');
  return { verificationId: requestId, ...mailboxEvidence };
}

async function uploadOwnerDocument(ownerSession, appCheckToken, intakeId, docType, label) {
  const bytes = minimalPdf(label);
  const result = await callFunction('uploadOwnerInspectionProofDocument', {
    ownerUid: ownerSession.uid,
    ownerEmail,
    intakeId,
    onboardingSessionId: intakeId,
    docType,
    filename: `${docType}.pdf`,
    contentType: 'application/pdf',
    encodedDocument: bytes.toString('base64'),
  }, appCheckToken, ownerSession.idToken);
  assert(text(result.downloadUrl).startsWith('https://'), `${docType} upload did not return a secure URL.`);
  assert(text(result.storagePath).startsWith(`onboarding-proof/${ownerSession.uid}/${intakeId}/`), `${docType} upload is not Owner scoped.`);
  const [exists] = await bucket.file(text(result.storagePath)).exists();
  assert(exists, `${docType} proof is missing from production Storage.`);
  return result;
}

async function main() {
  const startedAt = new Date().toISOString();
  const runId = safeId(process.env.GITHUB_RUN_ID || Date.now(), 'local');
  const intakeId = safeId(`e2e_owner_inspection_first_${runId}_${Date.now()}`, `e2e_owner_${Date.now()}`);
  const signatureName = 'E2E Owner Inspection First Evidence';
  const propertyName = 'E2E Owner Acquisition Tower';
  const clientDraftId = 'draft-owner-property-1';
  const expectedPropertyId = `${intakeId}_property_1`;
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
  assert(ownerUid && registration.dashboardLocked === true, 'New Owner registration did not create a locked account.');

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

  const ownerSession = await signInOwner();
  assert(ownerSession.uid === ownerUid, 'New Owner sign-in UID does not match the acquired account.');
  const founderSession = await signInWithRequiredTotpMfa({
    apiKey: API_KEY,
    email: founderEmail,
    password: founderPassword,
    totpSecret: founderTotpSecret,
    referer: ADMIN_REFERER,
  });

  const nowIso = new Date().toISOString();
  const property = {
    id: clientDraftId,
    propertyId: clientDraftId,
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
    sqft: 42000,
    age: 5,
    annualRent: 960000,
    annualRevenue: 960000,
    lifts: 2,
    fireAlarm: true,
    firePump: true,
    hvac: true,
    hvacCount: 24,
    electrical: true,
    plumbing: true,
    drainage: true,
    pumps: true,
    emergencyLighting: true,
    accessControl: true,
    bms: true,
    iotSensors: true,
    condition: 'Good',
    assetGrade: 'Premium',
    assetClass: 'Residential Building',
    serviceModel: 'FM_ONLY',
    strategy: 'fm_only',
    currentStatus: 'Active',
    address: `${propertyName}, Al Reem Island, Abu Dhabi`,
    geo: {
      point: { latitude: 24.4958, longitude: 54.4074 },
      lat: 24.4958,
      lng: 54.4074,
      geohash: 'thqejx0m',
      source: 'e2e-owner-five-page-submission',
      address: `${propertyName}, Al Reem Island, Abu Dhabi`,
      emirate: 'Abu Dhabi',
      area: 'Al Reem Island',
      verified: true,
      dispatchReady: true,
      requiresGeoReview: false,
      verifiedAt: nowIso,
    },
  };

  const configuration = await callFunction('getOwnerPaymentConfiguration', {}, appCheckToken, ownerSession.idToken);
  const approvedMethods = [...(Array.isArray(configuration.approvedMethods) ? configuration.approvedMethods : [])].map(upper).sort();
  assert(JSON.stringify(approvedMethods) === JSON.stringify(['CASH', 'CHEQUE']), `Phase 1 methods must be exactly CASH and CHEQUE; got ${approvedMethods.join(', ')}.`);
  assert(configuration.currency === 'AED' && /^[a-f0-9]{64}$/i.test(text(configuration.configHash)), 'Active Phase 1 payment configuration is invalid.');

  const documents = {
    propertyProof: await uploadOwnerDocument(ownerSession, appCheckToken, intakeId, 'propertyProof', 'Property ownership proof'),
    emiratesId: await uploadOwnerDocument(ownerSession, appCheckToken, intakeId, 'emiratesId', 'Emirates ID proof'),
    passport: await uploadOwnerDocument(ownerSession, appCheckToken, intakeId, 'passport', 'Passport proof'),
  };

  const quote = await callFunction('previewOwnerInspectionQuote', { properties: [property], selectedAddOns: [] }, appCheckToken, ownerSession.idToken);
  assert(/^[a-f0-9]{64}$/i.test(text(quote.quoteHash)), 'Inspection-first server quote hash is invalid.');
  assert(Math.abs(Number(quote.activationDeposit) - Number(quote.annualContractValue) * 0.15) <= 0.01, 'Quote does not lock the exact 15% mobilisation deposit.');
  const otp = await verifyInspectionSignatureOtp(ownerSession, appCheckToken, intakeId, quote.quoteHash, signatureName, propertyName);

  const submissionPayload = {
    ownerUid,
    ownerEmail,
    ownerName: signatureName,
    ownerMobile: '+971500000000',
    intakeId,
    onboardingSessionId: intakeId,
    properties: [property],
    selectedAddOns: [],
    quoteHash: quote.quoteHash,
    quoteQuotedAtMs: quote.quotedAtMs,
    signatureName,
    otpVerificationId: otp.verificationId,
    companyProfile: {
      name: 'E2E Private Owner Portfolio',
      contactPerson: signatureName,
      email: ownerEmail,
      phone: '+971500000000',
    },
    documentUrls: {
      propertyProof: documents.propertyProof.downloadUrl,
      emiratesId: documents.emiratesId.downloadUrl,
      passport: documents.passport.downloadUrl,
      tradeLicense: '',
    },
  };

  const submitted = await callFunction('submitOwnerInspectionFirstOnboarding', submissionPayload, appCheckToken, ownerSession.idToken);
  assert(submitted.success === true && submitted.idempotent === false && submitted.dashboardLocked === true, 'Five-page Owner application was not submitted as a new locked intake.');
  const replay = await callFunction('submitOwnerInspectionFirstOnboarding', submissionPayload, appCheckToken, ownerSession.idToken);
  assert(replay.success === true && replay.idempotent === true, 'Five-page Owner submission replay is not idempotent.');

  const intake = await waitForDocument(
    db.collection('intake_submissions').doc(intakeId),
    (value) => upper(value.status) === 'SUBMITTED_FOR_PROPERTY_INSPECTION',
    'inspection-first Owner intake',
  );
  assert(intake.workflowVersion === WORKFLOW_VERSION, 'Owner intake does not use the protected five-page workflow version.');
  assert(intake.paymentStatus === 'NOT_DUE_UNTIL_INSPECTION_COMPLETE', 'Payment became due before Admin property visits.');
  const canonicalProperty = await db.collection('properties').doc(expectedPropertyId).get();
  assert(canonicalProperty.exists, `Server-generated property ${expectedPropertyId} was not created.`);
  const canonicalPropertyData = canonicalProperty.data() || {};
  assert(canonicalPropertyData.clientDraftId === clientDraftId, 'Server property did not preserve the client draft reference.');
  assert(canonicalPropertyData.propertyId === expectedPropertyId && canonicalPropertyData.id === expectedPropertyId, 'Client property ID was not replaced by the intake-scoped server ID.');
  assert(canonicalPropertyData.geo?.dispatchReady === false && canonicalPropertyData.geo?.requiresGeoReview === true, 'Owner-submitted GPS bypassed Admin verification.');
  const userBeforeVisits = (await db.collection('users').doc(ownerUid).get()).data() || {};
  assert(userBeforeVisits.dashboardLocked === true && userBeforeVisits.dashboardUnlocked !== true, 'Owner dashboard unlocked before property visits.');

  const createdInspection = await callFunction('adminCreateOwnerPortfolioPropertyInspection', {
    intakeId,
    propertyIndex: 0,
  }, appCheckToken, founderSession.idToken);
  const inspectionId = text(createdInspection.inspectionId);
  assert(inspectionId.startsWith('owner_inspection_'), 'Admin did not create the deterministic property inspection.');
  const linked = await callFunction('adminLinkOwnerPropertyInspection', {
    intakeId,
    inspectionIds: [inspectionId],
  }, appCheckToken, founderSession.idToken);
  assert(Array.isArray(linked.inspectionIds) && linked.inspectionIds.length === 1, 'Admin did not link one inspection per property.');

  const visitBytes = minimalPdf('Property visit GPS checklist photo evidence');
  const visitStartedAtMs = Date.now() - 5 * 60 * 1000;
  const visitCompletedAtMs = Date.now() - 60 * 1000;
  const visitEvidence = await callFunction('adminRecordOwnerPropertyInspectionEvidence', {
    intakeId,
    inspectionId,
    inspectorName: 'E2E Founder Inspector',
    findings: 'Property identity, location, safety, systems and service scope verified on site.',
    startedAtMs: visitStartedAtMs,
    completedAtMs: visitCompletedAtMs,
    arrivalLat: 24.4958,
    arrivalLng: 54.4074,
    checklist: {
      propertyIdentityConfirmed: true,
      locationConfirmed: true,
      accessAndSafetyReviewed: true,
      systemsAndConditionReviewed: true,
      serviceScopeConfirmed: true,
    },
    filename: 'owner-property-visit-evidence.pdf',
    contentType: 'application/pdf',
    encodedDocument: visitBytes.toString('base64'),
  }, appCheckToken, founderSession.idToken);
  assert(visitEvidence.status === 'VERIFIED' && /^[a-f0-9]{64}$/i.test(text(visitEvidence.evidenceHash)) && text(visitEvidence.generation), 'Property visit evidence did not produce immutable proof.');
  assert(Number(visitEvidence.distanceMetres) <= 750, 'Property visit GPS is outside the permitted radius.');

  const completedVisits = await callFunction('adminCompleteOwnerPortfolioInspections', {
    intakeId,
    notes: 'All evidence-backed Owner portfolio visits completed and verified.',
  }, appCheckToken, founderSession.idToken);
  assert(completedVisits.status === 'COMPLETED' && completedVisits.nextState === 'AWAITING_15_PERCENT_PAYMENT', 'Portfolio completion did not move the exact 15% payment to due.');

  const paymentBeforeEvidence = (await db.collection('payment_transactions').doc(intakeId).get()).data() || {};
  assert(paymentBeforeEvidence.inspectionVerified === true && upper(paymentBeforeEvidence.paymentStatus) === 'PENDING_ADMIN_PAYMENT_VERIFICATION', 'Payment did not remain locked until verified visits completed.');
  const propertyAfterVisit = (await db.collection('properties').doc(expectedPropertyId).get()).data() || {};
  assert(propertyAfterVisit.geo?.verified === true && propertyAfterVisit.geo?.dispatchReady === true && propertyAfterVisit.geo?.requiresGeoReview === false, 'Admin visit did not make the canonical GPS dispatch-ready.');

  const receiptBytes = minimalPdf('Exact 15 percent cash mobilisation receipt');
  const receiptHash = sha256(receiptBytes);
  const paymentReferenceId = `E2E-CASH-${runId}`;
  const recordedPayment = await callFunction('adminRecordOwnerMobilizationPaymentEvidence', {
    paymentId: intakeId,
    paymentReferenceId,
    paymentMethod: 'CASH',
    amountReceived: quote.activationDeposit,
    filename: 'mobilisation-cash-receipt.pdf',
    contentType: 'application/pdf',
    encodedDocument: receiptBytes.toString('base64'),
  }, appCheckToken, founderSession.idToken);
  assert(recordedPayment.status === 'RECORDED' && recordedPayment.method === 'CASH', 'Admin did not record Phase 1 Cash evidence.');
  assert(recordedPayment.receiptHash === receiptHash && text(recordedPayment.generation), 'Recorded 15% receipt hash or generation is invalid.');

  const paymentWithEvidence = (await db.collection('payment_transactions').doc(intakeId).get()).data() || {};
  assert(text(paymentWithEvidence.paymentConfigVersion) === text(configuration.version), 'Payment evidence did not persist the active configuration version.');
  assert(text(paymentWithEvidence.paymentConfigHash) === text(configuration.configHash), 'Payment evidence did not persist the active configuration hash.');
  assert(paymentWithEvidence.paymentManifest?.selectedMethod === 'CASH', 'Payment manifest did not bind the selected Phase 1 method.');
  assert(text(paymentWithEvidence.paymentProofHash) === receiptHash && text(paymentWithEvidence.paymentProofGeneration), 'Payment transaction is missing immutable receipt evidence.');

  const approvalPayload = {
    paymentId: intakeId,
    paymentReferenceId,
    amountReceived: quote.activationDeposit,
    method: 'CASH',
    receivedAt: new Date().toISOString(),
    notes: 'E2E inspection-first Owner activation approval.',
  };
  const approved = await callFunction('adminApprovePayment', approvalPayload, appCheckToken, founderSession.idToken);
  assert(approved.status === 'SUCCESS' && approved.idempotent === false, 'Founder MFA payment approval did not activate the Owner.');
  const approvalReplay = await callFunction('adminApprovePayment', approvalPayload, appCheckToken, founderSession.idToken);
  assert(approvalReplay.status === 'SUCCESS' && approvalReplay.idempotent === true, 'Final approval replay is not idempotent.');

  const activatedPayment = await waitForDocument(
    db.collection('payment_transactions').doc(intakeId),
    (value) => upper(value.status) === 'APPROVED' && value.paymentVerified === true && value.unlocksDashboard === true,
    'approved inspection-first Owner activation',
  );
  const activatedContract = (await db.collection('contracts').doc(intakeId).get()).data() || {};
  const activatedUser = (await db.collection('users').doc(ownerUid).get()).data() || {};
  const activatedProperty = (await db.collection('properties').doc(expectedPropertyId).get()).data() || {};
  const inspection = (await db.collection('property_inspections').doc(inspectionId).get()).data() || {};
  const invoiceId = text(activatedPayment.invoiceId);
  const invoice = (await db.collection('invoices').doc(invoiceId).get()).data() || {};

  assert(upper(activatedContract.status) === 'ACTIVE' && activatedContract.adminApproved === true, 'Contract was not activated after verified visits and exact 15% payment.');
  assert(activatedUser.dashboardUnlocked === true && activatedUser.dashboardLocked === false, 'Owner dashboard did not unlock after Founder MFA approval.');
  assert(activatedUser.paymentVerified === true && activatedUser.adminApproved === true, 'Owner final activation flags are incomplete.');
  assert(upper(activatedProperty.status) === 'ACTIVE' && upper(activatedProperty.activationStatus) === 'ACTIVE', 'Server-generated property is not active.');
  assert(upper(inspection.status) === 'COMPLETED' && upper(inspection.evidenceStatus) === 'VERIFIED', 'Evidence-backed property inspection is not complete.');
  assert(invoiceId.startsWith('MOB-') && text(invoice.proofHash) === text(activatedPayment.invoiceProofHash), 'Mobilisation invoice hash is missing or inconsistent.');
  assert(Math.abs(Number(invoice.amount) - Number(quote.activationDeposit)) <= 0.01, 'Mobilisation invoice does not equal the locked 15% deposit.');

  const invoiceMail = await waitForMailDelivery(`owner_invoice_${intakeId}_${invoiceId}`, ownerEmail);

  const evidence = {
    schemaVersion: 2,
    status: 'passed',
    source: 'run-owner-inspection-first-production-evidence',
    projectId,
    productionUrl: 'https://bin-group-57c60.web.app',
    commitSha: text(process.env.GITHUB_SHA),
    workflowRunId: text(process.env.GITHUB_RUN_ID),
    workflowVersion: WORKFLOW_VERSION,
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
      propertyCount: 1,
      clientDraftId,
      serverGeneratedPropertyIds: [expectedPropertyId],
      quoteHash: quote.quoteHash,
      annualContractValue: quote.annualContractValue,
      activationDeposit: quote.activationDeposit,
      mobilizationPercent: 15,
      submissionIdempotentReplay: true,
      paymentNotDueBeforeInspections: true,
      finalApprovalIdempotentReplay: true,
      invoiceId,
      invoiceProofHash: text(invoice.proofHash),
    },
    inspectionEvidence: {
      inspectionIds: [inspectionId],
      inspectionCount: 1,
      evidenceHash: text(inspection.evidenceHash),
      evidenceGeneration: text(inspection.evidenceGeneration),
      checklistVerified: inspection.checklistVerified === true,
      arrivalWithinRadius: inspection.arrivalLocation?.withinRadius === true,
      distanceMetres: Number(inspection.arrivalLocation?.distanceMetres),
      visitStartedAtPresent: Boolean(inspection.visitStartedAt),
      visitCompletedAtPresent: Boolean(inspection.visitCompletedAt),
    },
    paymentEvidence: {
      policy: 'phase1-manual',
      method: 'CASH',
      paymentConfigVersion: text(paymentWithEvidence.paymentConfigVersion),
      paymentConfigHash: text(paymentWithEvidence.paymentConfigHash),
      approvedMethods,
      amountReceived: Number(paymentWithEvidence.amountReceived),
      receiptHash,
      receiptGeneration: text(paymentWithEvidence.paymentProofGeneration),
      sensitiveValuesExcluded: true,
    },
    adminApproval: {
      canonicalFounderEmail: CANONICAL_FOUNDER_EMAIL,
      mfaSecondFactorType: founderSession.secondFactorType,
      mfaSecondFactorIdentifierPresent: Boolean(founderSession.secondFactorIdentifier),
      contractActivated: true,
      propertyActivated: true,
      dashboardUnlocked: true,
    },
    emailDelivery: {
      contractOtpProviderMessageId: otp.providerMessageId,
      contractOtpMailboxReceiptVerified: otp.mailboxReceiptVerified,
      contractOtpMailboxReceivedAt: otp.mailboxReceivedAt,
      contractOtpMailboxMessageIdHash: otp.mailboxMessageIdHash,
      invoiceMail,
    },
    hardLaunchClaim: false,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`[owner-inspection-first-evidence] PASS intake=${intakeId} property=${expectedPropertyId} inspection=${inspectionId} invoice=${invoiceId}`);
  console.log(`[owner-inspection-first-evidence] wrote ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('[owner-inspection-first-evidence] FAIL', error?.stack || error);
  process.exit(1);
});
