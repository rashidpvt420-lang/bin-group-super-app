#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
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
const OUTPUT_PATH = path.resolve('launch_package/artifacts/phase1-public-owner-launch-evidence.json');
const WORKFLOW_VERSION = 'OWNER_FIVE_PAGE_INSPECTION_FIRST_V1';

const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const upper = (value) => text(value).toUpperCase();
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const safeId = (value, fallback = 'evidence') => text(value).replace(/[^A-Za-z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 160) || fallback;
const assert = (condition, message) => { if (!condition) throw new Error(message); };

const ownerEmail = lower(process.env.E2E_OWNER_EMAIL);
const ownerPassword = text(process.env.E2E_OWNER_PASSWORD);
const ownerMailboxEmail = lower(process.env.E2E_OWNER_MAILBOX_EMAIL);
const adminEmail = lower(process.env.E2E_ADMIN_EMAIL);
const adminPassword = text(process.env.E2E_ADMIN_PASSWORD);
const founderTotpSecret = text(process.env.E2E_FOUNDER_TOTP_SECRET);
const appCheckDebugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
const ownerMailboxClientId = text(process.env.E2E_OWNER_MAILBOX_CLIENT_ID);
const ownerMailboxClientSecret = text(process.env.E2E_OWNER_MAILBOX_CLIENT_SECRET);
const ownerMailboxRefreshToken = text(process.env.E2E_OWNER_MAILBOX_REFRESH_TOKEN);
const commitSha = text(process.env.GITHUB_SHA);

for (const [name, value] of Object.entries({
  E2E_OWNER_EMAIL: ownerEmail,
  E2E_OWNER_PASSWORD: ownerPassword,
  E2E_OWNER_MAILBOX_EMAIL: ownerMailboxEmail,
  E2E_ADMIN_EMAIL: adminEmail,
  E2E_ADMIN_PASSWORD: adminPassword,
  E2E_FOUNDER_TOTP_SECRET: founderTotpSecret,
  VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: appCheckDebugToken,
  E2E_OWNER_MAILBOX_CLIENT_ID: ownerMailboxClientId,
  E2E_OWNER_MAILBOX_CLIENT_SECRET: ownerMailboxClientSecret,
  E2E_OWNER_MAILBOX_REFRESH_TOKEN: ownerMailboxRefreshToken,
  GITHUB_SHA: commitSha,
})) assert(value, `${name} is required for Phase 1 public Owner launch evidence.`);
assert(adminEmail === 'ceo@bin-groups.com', 'Phase 1 final approval evidence must use the canonical Founder/Admin account.');
assert(/^[0-9a-f]{40}$/.test(commitSha), 'GITHUB_SHA must be the exact deployed 40-character commit SHA.');
assert(/^[0-9a-f-]{36}$/i.test(appCheckDebugToken), 'The protected journey requires a registered App Check debug UUID; clean-browser attestation is proved separately without it.');

const projectId = resolveFirebaseAdminProjectId();
assert(projectId === PROJECT_ID, `Evidence must run against ${PROJECT_ID}; got ${projectId || '(missing)'}.`);
initializeFirebaseAdmin(admin, PROJECT_ID);
const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket(STORAGE_BUCKET);

async function jsonRequest(url, options, label) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw }; }
  if (!response.ok) throw new Error(`${label} failed HTTP ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function exchangeAppCheckToken() {
  const url = new URL(`https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(APP_ID)}:exchangeDebugToken`);
  url.searchParams.set('key', API_KEY);
  const body = await jsonRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: WEB_REFERER },
    body: JSON.stringify({ debugToken: appCheckDebugToken }),
  }, 'App Check protected-journey token exchange');
  assert(text(body.token), 'App Check exchange returned no token.');
  return text(body.token);
}

async function signIn(email, password) {
  const body = await jsonRequest(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Referer: WEB_REFERER },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }, `Firebase sign-in for ${email}`);
  assert(text(body.idToken) && text(body.localId), `Firebase sign-in returned no ID token for ${email}.`);
  return { idToken: text(body.idToken), uid: text(body.localId), email: lower(body.email) };
}

async function callFunction(name, data, appCheckToken, idToken = '') {
  const headers = { 'Content-Type': 'application/json', 'X-Firebase-AppCheck': appCheckToken };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;
  const body = await jsonRequest(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data }),
  }, `Callable ${name}`);
  if (body.error) throw new Error(`Callable ${name} returned ${JSON.stringify(body.error)}`);
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

async function resetOwner() {
  let uid = '';
  try {
    const existing = await auth.getUserByEmail(ownerEmail);
    uid = existing.uid;
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
  if (uid) {
    for (const collectionName of ['payment_transactions', 'contracts', 'intake_submissions', 'properties', 'propertyPassports', 'invoices', 'property_inspections', 'maintenanceTickets', 'technician_dispatch_jobs', 'contract_signature_otps']) {
      await deleteQuery(db.collection(collectionName).where('ownerUid', '==', uid));
      await deleteQuery(db.collection(collectionName).where('ownerId', '==', uid));
    }
    await Promise.all([
      db.collection('users').doc(uid).delete().catch(() => undefined),
      db.collection('owners').doc(uid).delete().catch(() => undefined),
      db.collection('owner_dashboard_unlocks').doc(uid).delete().catch(() => undefined),
      db.collection('contract_signature_otp_rate_limits').doc(uid).delete().catch(() => undefined),
    ]);
    await auth.deleteUser(uid);
  }
}

function minimalPdf(label) {
  const safe = `${label} ${randomUUID()}`.replace(/[()\\]/g, '_');
  return Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 72 720 Td (${safe}) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \ntrailer<</Root 1 0 R/Size 5>>\nstartxref\n0\n%%EOF\n`, 'utf8');
}

function onePixelPng() {
  return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2V4sAAAAASUVORK5CYII=', 'base64');
}

async function readSignatureOtp(requestId, providerMessageId, requestedAtMs) {
  const accessToken = await exchangeGmailAccessToken({
    clientId: ownerMailboxClientId,
    clientSecret: ownerMailboxClientSecret,
    refreshToken: ownerMailboxRefreshToken,
    label: 'Phase 1 Owner mailbox',
  });
  return readGmailOtp({
    accessToken,
    expectedMailboxEmail: ownerMailboxEmail,
    sender: 'ceo@bin-groups.com',
    recipient: ownerEmail,
    subject: 'BIN GROUP property application signature OTP',
    correlationId: requestId,
    providerMessageId,
    requestedAtMs,
    otpPattern: /signature OTP is\s+(\d{6})/i,
    timeoutMs: 120000,
    label: 'Phase 1 Owner signature OTP',
  });
}

async function assertPrivateObject(storagePath, expected) {
  const [metadata] = await bucket.file(storagePath).getMetadata();
  const custom = metadata.metadata || {};
  assert(!text(custom.firebaseStorageDownloadTokens), `${storagePath} contains a forbidden permanent Firebase download token.`);
  assert(text(metadata.cacheControl) === 'private, no-store, max-age=0', `${storagePath} is missing private no-store cache control.`);
  for (const [key, value] of Object.entries(expected)) assert(text(custom[key]) === text(value), `${storagePath} metadata ${key} mismatch.`);
  return { generation: text(metadata.generation), size: Number(metadata.size || 0), contentType: text(metadata.contentType) };
}

async function main() {
  const startedAt = new Date().toISOString();
  const runId = safeId(process.env.GITHUB_RUN_ID || Date.now(), 'local');
  const intakeId = safeId(`phase1_public_owner_${runId}_${Date.now()}`, `phase1_owner_${Date.now()}`);
  const signatureName = 'Phase 1 Public Launch Owner';
  const propertyName = 'Phase 1 Evidence Property';
  const propertyLat = 24.4539;
  const propertyLng = 54.3773;
  const appCheckToken = await exchangeAppCheckToken();

  await resetOwner();
  const user = await auth.createUser({ email: ownerEmail, password: ownerPassword, emailVerified: true, disabled: false, displayName: signatureName });
  await auth.setCustomUserClaims(user.uid, { role: 'owner', userRole: 'owner', primaryRole: 'owner', admin: false, isAdmin: false, testAccount: true });
  await db.collection('users').doc(user.uid).set({ uid: user.uid, email: ownerEmail, displayName: signatureName, role: 'owner', status: 'pending_property_application', dashboardLocked: true, dashboardUnlocked: false, testAccount: true, createdAt: admin.firestore.FieldValue.serverTimestamp() });
  await db.collection('owners').doc(user.uid).set({ ownerUid: user.uid, uid: user.uid, ownerEmail: ownerEmail, email: ownerEmail, displayName: signatureName, role: 'owner', status: 'PENDING_PROPERTY_APPLICATION', dashboardLocked: true, dashboardUnlocked: false, testAccount: true, createdAt: admin.firestore.FieldValue.serverTimestamp() });

  const ownerSession = await signIn(ownerEmail, ownerPassword);
  assert(ownerSession.uid === user.uid, 'Owner Auth identity mismatch.');
  await callFunction('upsertOwnerOnboardingProfile', { fullName: signatureName, email: ownerEmail, mobile: '+971500000000', intakeId }, appCheckToken, ownerSession.idToken);
  const refreshedOwnerSession = await signIn(ownerEmail, ownerPassword);

  const property = {
    id: 'prop-1',
    propertyId: 'prop-1',
    emirate: 'Abu Dhabi',
    area: 'Al Bateen',
    zone: 'B',
    propertyType: 'Building',
    subType: 'Residential Building',
    useType: 'Rental',
    ownerType: 'Private',
    floors: 4,
    units: 8,
    bedrooms: 8,
    bathrooms: 8,
    shops: 0,
    offices: 0,
    rooms: 0,
    sqft: 12000,
    age: 4,
    annualRent: 480000,
    pool: false,
    lifts: 1,
    tank: true,
    bmu: false,
    sira: true,
    fireAlarm: true,
    firePump: true,
    escalators: false,
    centralLPG: false,
    wasteMan: true,
    gen: false,
    hvac: true,
    districtCooling: false,
    electrical: true,
    plumbing: true,
    drainage: true,
    pumps: true,
    emergencyLighting: true,
    accessControl: true,
    bms: false,
    iotSensors: false,
    gym: false,
    majlis: false,
    majlisType: 'none',
    missions: [],
    condition: 'Good',
    assetGrade: 'Premium',
    currentStatus: 'Active',
    address: `${propertyName}, Al Bateen, Abu Dhabi`,
    strategy: 'fm_only',
    serviceModel: 'FM_ONLY',
    slaTier: 'standard',
    paymentPlan: 'annual',
    geo: { lat: propertyLat, lng: propertyLng, geohash: 'thqep', source: 'phase1-live-owner', address: `${propertyName}, Al Bateen, Abu Dhabi`, emirate: 'Abu Dhabi', city: 'Abu Dhabi', area: 'Al Bateen', verified: false, dispatchReady: false, requiresGeoReview: true },
  };

  const quote = await callFunction('previewOwnerInspectionQuote', { properties: [property], selectedAddOns: [] }, appCheckToken, refreshedOwnerSession.idToken);
  assert(text(quote.quoteHash).match(/^[a-f0-9]{64}$/), 'Server quote hash missing.');
  assert(Number(quote.activationDeposit) === Math.round(Number(quote.annualContractValue) * 0.15 * 100) / 100, 'Server quote does not contain the exact 15% amount.');

  const otpRequest = await callFunction('requestOwnerInspectionSignatureOtp', { contractId: intakeId, contractHash: quote.quoteHash, propertyName }, appCheckToken, refreshedOwnerSession.idToken);
  const requestId = text(otpRequest.requestId);
  assert(requestId && otpRequest.deliveryConfirmed === true, 'Owner signature OTP was not accepted by the provider.');
  const otpDoc = await db.collection('contract_signature_otps').doc(requestId).get();
  assert(otpDoc.exists, 'Owner OTP evidence was not stored.');
  const otpData = otpDoc.data() || {};
  assert(otpData.otp === undefined && otpData.code === undefined, 'Owner OTP plaintext was stored.');
  assert(text(otpData.otpHashAlgorithm) === 'HMAC_SHA256_OWNER_INSPECTION_V1', 'Owner OTP is not protected by the expected HMAC algorithm.');
  const mailboxOtp = await readSignatureOtp(requestId, text(otpData.delivery?.messageId), otpData.delivery?.sentAt?.toMillis?.() || otpData.createdAt?.toMillis?.() || Date.now() - 30000);
  const otpVerification = await callFunction('verifyOwnerInspectionSignatureOtp', { requestId, otp: mailboxOtp.otp, signature: signatureName }, appCheckToken, refreshedOwnerSession.idToken);
  assert(otpVerification.ok === true && text(otpVerification.verificationId) === requestId, 'Owner signature OTP verification failed.');

  const documents = {};
  for (const docType of ['propertyProof', 'emiratesId', 'passport']) {
    const bytes = minimalPdf(`Phase 1 ${docType}`);
    const uploaded = await callFunction('uploadOwnerInspectionProofDocument', {
      ownerUid: user.uid,
      ownerEmail,
      intakeId,
      onboardingSessionId: intakeId,
      docType,
      filename: `${docType}.pdf`,
      contentType: 'application/pdf',
      encodedDocument: bytes.toString('base64'),
    }, appCheckToken, refreshedOwnerSession.idToken);
    assert(text(uploaded.storagePath).startsWith(`onboarding-proof/${user.uid}/${intakeId}/${docType}/`), `${docType} private path mismatch.`);
    assert(text(uploaded.sha256) === sha256(bytes), `${docType} SHA-256 mismatch.`);
    await assertPrivateObject(uploaded.storagePath, { ownerUid: user.uid, intakeId, docType, sha256: uploaded.sha256, accessClass: 'ADMIN_SIGNED_URL_ONLY' });
    documents[docType] = uploaded;
  }

  const submitted = await callFunction('submitOwnerInspectionFirstOnboarding', {
    ownerUid: user.uid,
    ownerEmail,
    ownerName: signatureName,
    ownerMobile: '+971500000000',
    intakeId,
    onboardingSessionId: intakeId,
    companyProfile: { name: '', licenseNumber: '', contactPerson: signatureName, phone: '+971500000000', email: ownerEmail },
    properties: [property],
    selectedAddOns: [],
    signatureName,
    otpVerificationId: requestId,
    contractOtpVerificationId: requestId,
    quoteHash: quote.quoteHash,
    quoteQuotedAtMs: quote.quotedAtMs,
    documentEvidence: documents,
  }, appCheckToken, refreshedOwnerSession.idToken);
  assert(submitted.success === true && text(submitted.intakeId) === intakeId && submitted.dashboardLocked === true, 'Five-page Owner submission failed.');

  const canonicalPropertyId = `${intakeId}_property_1`;
  const canonicalProperty = await db.collection('properties').doc(canonicalPropertyId).get();
  assert(canonicalProperty.exists, 'Server-generated canonical property record is missing.');
  assert(text(canonicalProperty.data()?.clientDraftId) === 'prop-1', 'Client draft property ID was not preserved as trace evidence.');
  const unsafeProperty = await db.collection('properties').doc('prop-1').get();
  assert(!unsafeProperty.exists || text(unsafeProperty.data()?.ownerUid) !== user.uid || text(unsafeProperty.data()?.intakeId) !== intakeId, 'The global properties/prop-1 record was overwritten by the new Owner.');

  const founderMfa = await signInWithRequiredTotpMfa({ apiKey: API_KEY, email: adminEmail, password: adminPassword, totpSecret: founderTotpSecret, referer: ADMIN_REFERER });
  const adminIdToken = founderMfa.idToken;
  const createdVisit = await callFunction('adminCreateOwnerPortfolioPropertyInspection', { intakeId, propertyIndex: 0 }, appCheckToken, adminIdToken);
  const inspectionId = text(createdVisit.inspectionId);
  assert(inspectionId, 'Admin visit creation returned no inspection ID.');
  await callFunction('adminLinkOwnerPropertyInspection', { intakeId, inspectionIds: [inspectionId] }, appCheckToken, adminIdToken);

  const visitPhoto = onePixelPng();
  const completedAtMs = Date.now();
  const visitEvidence = await callFunction('adminRecordOwnerPortfolioVisitEvidence', {
    intakeId,
    inspectionId,
    arrivalLat: propertyLat,
    arrivalLng: propertyLng,
    startedAtMs: completedAtMs - 15 * 60 * 1000,
    completedAtMs,
    findings: 'Property access, utilities, safety systems, exterior condition and occupancy were physically reviewed and recorded.',
    checklist: { accessVerified: true, exteriorReviewed: true, utilitiesReviewed: true, safetyReviewed: true, occupancyConfirmed: true },
    filename: 'phase1-property-visit.png',
    contentType: 'image/png',
    encodedPhoto: visitPhoto.toString('base64'),
  }, appCheckToken, adminIdToken);
  assert(visitEvidence.status === 'EVIDENCE_VERIFIED' && Number(visitEvidence.arrivalDistanceMetres) === 0, 'Property visit evidence was not verified at the submitted GPS.');
  const inspectionDoc = await db.collection('property_inspections').doc(inspectionId).get();
  const photoEvidence = inspectionDoc.data()?.visitEvidence?.photoEvidence?.[0];
  assert(photoEvidence?.storagePath, 'Visit photo evidence path is missing.');
  await assertPrivateObject(photoEvidence.storagePath, { intakeId, inspectionId, propertyId: canonicalPropertyId, sha256: photoEvidence.sha256, accessClass: 'ADMIN_SIGNED_URL_ONLY' });

  const readiness = await callFunction('adminGetOwnerPortfolioInspectionReadiness', { intakeId }, appCheckToken, adminIdToken);
  assert(readiness.allEvidenceVerified === true && Number(readiness.verifiedCount) === 1, 'Admin readiness does not show all visit evidence verified.');
  const completed = await callFunction('adminCompleteOwnerPortfolioInspections', { intakeId }, appCheckToken, adminIdToken);
  assert(completed.status === 'COMPLETED' && Number(completed.activationDeposit) === Number(quote.activationDeposit), 'Verified visits did not make the exact 15% payment due.');

  const paymentConfig = await callFunction('getOwnerPaymentConfiguration', {}, appCheckToken, refreshedOwnerSession.idToken);
  const paymentMethod = Array.isArray(paymentConfig.approvedMethods) && paymentConfig.approvedMethods.includes('CASH') ? 'CASH' : 'CHEQUE';
  assert(['CASH', 'CHEQUE'].includes(paymentMethod) && paymentConfig.approvedMethods.includes(paymentMethod), 'Active Phase 1 configuration does not enable Cash or Cheque.');
  const receipt = minimalPdf(`Phase 1 ${paymentMethod} receipt`);
  const paymentReferenceId = `PHASE1-${runId}-${Date.now()}`;
  const recordedPayment = await callFunction('adminRecordOwnerMobilizationPaymentEvidence', {
    paymentId: intakeId,
    paymentReferenceId,
    amountReceived: quote.activationDeposit,
    paymentMethod,
    filename: 'phase1-mobilisation-receipt.pdf',
    contentType: 'application/pdf',
    encodedDocument: receipt.toString('base64'),
  }, appCheckToken, adminIdToken);
  assert(recordedPayment.status === 'RECORDED' && text(recordedPayment.paymentConfigVersion) === text(paymentConfig.version), 'Payment evidence was not bound to the active configuration.');
  const paymentBeforeApproval = await db.collection('payment_transactions').doc(intakeId).get();
  const paymentData = paymentBeforeApproval.data() || {};
  assert(text(paymentData.paymentConfigHash) === text(paymentConfig.configHash), 'Payment configuration hash was not preserved.');
  assert(text(paymentData.paymentManifest?.launchPhase) === 'PHASE1_CASH_CHEQUE_PUBLIC', 'Phase 1 payment manifest is missing.');
  assert(!text(paymentData.paymentProofUrl) && !text(paymentData.receiptUrl), 'Payment evidence exposed a permanent receipt URL.');
  await assertPrivateObject(paymentData.paymentProofPath, { ownerUid: user.uid, paymentId: intakeId, intakeId, sha256: paymentData.paymentProofHash, accessClass: 'FINANCE_ADMIN_SIGNED_URL_ONLY' });

  const approval = await callFunction('adminApprovePayment', {
    paymentId: intakeId,
    paymentReferenceId,
    amountReceived: quote.activationDeposit,
    method: paymentMethod,
    internalNotes: 'Exact Phase 1 payment verified after all evidence-backed visits.',
  }, appCheckToken, adminIdToken);
  assert(approval.status === 'SUCCESS' && approval.dashboardUnlocked === true && text(approval.workflowVersion) === WORKFLOW_VERSION, 'Final MFA approval did not activate the Owner.');

  const [userFinal, ownerFinal, intakeFinal, contractFinal, paymentFinal, propertyFinal] = await Promise.all([
    db.collection('users').doc(user.uid).get(),
    db.collection('owners').doc(user.uid).get(),
    db.collection('intake_submissions').doc(intakeId).get(),
    db.collection('contracts').doc(intakeId).get(),
    db.collection('payment_transactions').doc(intakeId).get(),
    db.collection('properties').doc(canonicalPropertyId).get(),
  ]);
  assert(userFinal.data()?.dashboardUnlocked === true && userFinal.data()?.dashboardLocked === false, 'User dashboard was not unlocked.');
  assert(upper(ownerFinal.data()?.status) === 'ACTIVE', 'Owner profile is not active.');
  assert(intakeFinal.data()?.activationState === 'ACTIVE', 'Owner intake is not active.');
  assert(upper(contractFinal.data()?.status) === 'ACTIVE' && contractFinal.data()?.adminApproved === true, 'Contract is not active and Admin approved.');
  assert(upper(paymentFinal.data()?.status) === 'APPROVED' && paymentFinal.data()?.paymentVerified === true, 'Payment is not approved and verified.');
  assert(upper(propertyFinal.data()?.status) === 'ACTIVE' && propertyFinal.data()?.visitEvidenceVerified === true, 'Canonical property is not active with verified visit evidence.');
  assert(await db.collection('invoices').where('paymentId', '==', intakeId).limit(1).get().then((snapshot) => !snapshot.empty), 'Mobilisation invoice was not generated.');

  const evidence = {
    schemaVersion: 1,
    status: 'passed',
    source: 'phase1-public-owner-launch-evidence',
    projectId: PROJECT_ID,
    repository: text(process.env.GITHUB_REPOSITORY),
    commitSha,
    workflowRunId: text(process.env.GITHUB_RUN_ID),
    workflowRunAttempt: text(process.env.GITHUB_RUN_ATTEMPT),
    startedAt,
    verifiedAt: new Date().toISOString(),
    launchMode: 'phase1-public',
    workflowVersion: WORKFLOW_VERSION,
    ownerUid: user.uid,
    intakeId,
    contractId: intakeId,
    paymentId: intakeId,
    canonicalPropertyId,
    clientDraftIdCollisionPrevented: true,
    quoteHash: quote.quoteHash,
    annualContractValue: Number(quote.annualContractValue),
    activationDeposit: Number(quote.activationDeposit),
    signatureOtp: { requestId, providerMessageIdHash: mailboxOtp.messageIdHash, mailboxReceiptVerified: true, receivedAt: mailboxOtp.receivedAt },
    protectedDocuments: Object.fromEntries(Object.entries(documents).map(([key, value]) => [key, { storagePath: value.storagePath, sha256: value.sha256, generation: value.generation, permanentDownloadToken: false }])),
    inspection: { inspectionId, evidenceVerified: true, arrivalDistanceMetres: Number(visitEvidence.arrivalDistanceMetres), checklistComplete: true, photoEvidencePrivate: true },
    payment: { method: paymentMethod, paymentReferenceId, amountReceived: Number(quote.activationDeposit), configVersion: paymentConfig.version, configHash: paymentConfig.configHash, receiptHash: paymentData.paymentProofHash, receiptGeneration: paymentData.paymentProofGeneration, permanentReceiptUrl: false },
    adminMfa: { verified: true, factorType: founderMfa.secondFactorType, factorIdentifierHash: sha256(founderMfa.secondFactorIdentifier) },
    dashboardUnlocked: true,
    contractActive: true,
    propertyActive: true,
    invoiceGenerated: true,
    bankTransferEnabled: false,
    stripeEnabled: false,
    hardLaunchDecision: 'YES-GO',
  };
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  console.log(`[phase1-public-owner-launch] YES-GO evidence written to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('[phase1-public-owner-launch] FAILED:', error?.stack || error);
  process.exitCode = 1;
});
