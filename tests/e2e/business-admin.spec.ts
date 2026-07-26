/**
 * Protected production Admin business proof.
 *
 * This suite deliberately performs real Firebase Auth, MFA, App Check-protected
 * callable operations and verifies their server-authoritative terminal state.
 * All records are run-scoped synthetic fixtures and are removed after the run.
 */
import { test, expect, type Page } from '@playwright/test';
import admin from 'firebase-admin';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL = String(process.env.E2E_ADMIN_EMAIL || '').trim().toLowerCase();
const PASSWORD = String(process.env.E2E_ADMIN_PASSWORD || '').trim();
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app').trim().replace(/\/+$/, '');
const MFA_RUNTIME_PATH = path.resolve(process.cwd(), process.env.E2E_ADMIN_MFA_RUNTIME_PATH || '.e2e-admin-mfa-runtime.json');
const PROJECT_ID = process.env.GCP_PROJECT_ID || process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'bin-group-57c60';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'bin-group-57c60.firebasestorage.app';
const RUN_ID = String(process.env.GITHUB_RUN_ID || `${Date.now()}-${randomBytes(3).toString('hex')}`).replace(/[^a-zA-Z0-9-]/g, '').slice(-42);
const PREFIX = `e2e-admin-${RUN_ID}`;

const SUPPORT_EMAIL = `${PREFIX}-support@bin-groups.com`;
const TECHNICIAN_EMAIL = `${PREFIX}-technician@bin-groups.com`;
const SUPPORT_NAME = `E2E Support ${RUN_ID}`;
const TECHNICIAN_NAME = `E2E Technician ${RUN_ID}`;
const SECOND_TECH_ID = `${PREFIX}-tech-two`;
const SECOND_TECH_NAME = `E2E Re-dispatch Technician ${RUN_ID}`;

const OWNER_REVIEW_UID = `${PREFIX}-owner-review`;
const APPROVE_PROPERTY_ID = `${PREFIX}-property-approve`;
const REJECT_PROPERTY_ID = `${PREFIX}-property-reject`;
const APPROVE_PROPERTY_NAME = `E2E Approve Property ${RUN_ID}`;
const REJECT_PROPERTY_NAME = `E2E Reject Property ${RUN_ID}`;

const PAYMENT_ID = `${PREFIX}-activation`;
const PAYMENT_OWNER_UID = `${PREFIX}-payment-owner`;
const PAYMENT_PROPERTY_ID = `${PREFIX}-payment-property`;
const PAYMENT_OTP_ID = `${PREFIX}-signature-otp`;
const PAYMENT_SIGNATURE = `E2E Owner ${RUN_ID}`;
const PAYMENT_QUOTE_HASH = createHash('sha256').update(`quote:${PREFIX}`).digest('hex');
const PAYMENT_ANNUAL_VALUE = 40_000;
const PAYMENT_DEPOSIT = 6_000;
const PAYMENT_INVOICE_ID = `MOB-${createHash('sha256').update(PAYMENT_ID).digest('hex').slice(0, 20).toUpperCase()}`;
const REJECT_PAYMENT_ID = `${PREFIX}-payment-reject`;
const REJECT_PAYMENT_OWNER_UID = `${PREFIX}-payment-reject-owner`;

const BROKER_APPROVE_ID = `${PREFIX}-broker-approve`;
const BROKER_REJECT_ID = `${PREFIX}-broker-reject`;
const BROKER_APPROVE_NAME = `E2E Broker Approve ${RUN_ID}`;
const BROKER_REJECT_NAME = `E2E Broker Reject ${RUN_ID}`;
const BROKER_SUBMISSION_HASH = createHash('sha256').update(`broker:${PREFIX}`).digest('hex');
const BROKER_REJECT_HASH = createHash('sha256').update(`broker-reject:${PREFIX}`).digest('hex');
const BROKER_IBAN = 'AE070331234567890123456';
const BROKER_DOCUMENT_TYPES = ['rera_license', 'bank_details', 'broker_agreement', 'emirates_id'] as const;
const BROKER_STORAGE_PATHS = BROKER_DOCUMENT_TYPES.map((type) => `brokerDocuments/${BROKER_APPROVE_ID}/${type}/${PREFIX}.pdf`);

const PAYOUT_APPROVE_ID = `${PREFIX}-payout-approve`;
const PAYOUT_REJECT_ID = `${PREFIX}-payout-reject`;
const COMMISSION_APPROVE_ID = `${PREFIX}-commission-approve`;
const COMMISSION_REJECT_ID = `${PREFIX}-commission-reject`;

const TICKET_PROPERTY_ID = `${PREFIX}-ticket-property`;
const TICKET_ID = `${PREFIX}-ticket`;

let createdTechnicianUid = '';
let createdSupportUid = '';

const adminUrl = (pathname: string) => `${ADMIN_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
const now = () => admin.firestore.FieldValue.serverTimestamp();

function requireLaunchCredentials() {
  const missing = [
    !EMAIL ? 'E2E_ADMIN_EMAIL' : '',
    !PASSWORD ? 'E2E_ADMIN_PASSWORD' : '',
    !ADMIN_BASE_URL ? 'E2E_ADMIN_BASE_URL' : '',
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}. Admin business proof cannot be skipped.`);
}

function parseServiceAccount() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return null;
  for (const candidate of [raw, Buffer.from(raw, 'base64').toString('utf8')]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed?.private_key) parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
      if (parsed?.client_email && parsed?.private_key) return parsed;
    } catch {
      // Try the next supported encoding.
    }
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain service-account JSON or its base64 encoding.');
}

function initializeAdminSdk() {
  if (admin.apps.length) return;
  const serviceAccount = parseServiceAccount();
  admin.initializeApp({
    credential: serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault(),
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
  });
}

function readProtectedMfaRuntime() {
  const runtime = JSON.parse(readFileSync(MFA_RUNTIME_PATH, 'utf8'));
  const code = String(runtime?.verificationCode || '').trim();
  const phone = String(runtime?.phoneNumber || '').trim();
  const evidenceSha = String(runtime?.evidenceSha || '').trim();
  if (!/^\d{6}$/.test(code) || !/^\+1650555\d{4}$/.test(phone)) {
    throw new Error('Protected E2E Admin MFA runtime is missing valid Firebase test-factor values.');
  }
  if (process.env.GITHUB_SHA && evidenceSha !== process.env.GITHUB_SHA) {
    throw new Error('Protected E2E Admin MFA runtime does not match the exact evidence SHA.');
  }
  return { code };
}

async function waitForLoader(page: Page) {
  await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function login(page: Page) {
  const mfa = readProtectedMfaRuntime();
  await page.addInitScript(() => window.localStorage.setItem('bin-e2e-admin-mfa-test', 'enabled'));
  await page.goto(adminUrl('/login'), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('admin-login-email')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('admin-login-email').fill(EMAIL);
  await page.getByTestId('admin-login-password').fill(PASSWORD);
  await page.getByTestId('admin-login-submit').click();

  const challenge = page.getByTestId('admin-mfa-signin-challenge');
  await expect(challenge, 'the protected E2E Admin must receive a real Firebase MFA challenge').toBeVisible({ timeout: 30_000 });
  await page.getByTestId('admin-mfa-send-signin-code').click();
  await expect(page.getByTestId('admin-mfa-signin-code')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('admin-mfa-signin-code').fill(mfa.code);
  await page.getByTestId('admin-mfa-resolve-signin').click();
  await page.waitForURL(`${ADMIN_BASE_URL}/dashboard`, { timeout: 45_000 });
  await waitForLoader(page);
  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|admin console could not start/i,
    { timeout: 10_000 },
  );
}

async function findAuthUser(email: string) {
  try {
    return await admin.auth().getUserByEmail(email);
  } catch (error: any) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

async function deleteAuthUserByEmail(email: string) {
  const user = await findAuthUser(email);
  if (user) await admin.auth().deleteUser(user.uid).catch(() => undefined);
}

async function deleteQuery(collectionName: string, field: string, value: string) {
  const snapshot = await admin.firestore().collection(collectionName).where(field, '==', value).limit(500).get();
  if (snapshot.empty) return;
  const batch = admin.firestore().batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

async function seedBrokerDocuments() {
  const bucket = admin.storage().bucket();
  const db = admin.firestore();
  for (let index = 0; index < BROKER_DOCUMENT_TYPES.length; index += 1) {
    const documentType = BROKER_DOCUMENT_TYPES[index];
    const storagePath = BROKER_STORAGE_PATHS[index];
    await bucket.file(storagePath).save(Buffer.from('%PDF-1.4\n% BIN GROUP protected E2E evidence\n%%EOF\n'), {
      resumable: false,
      contentType: 'application/pdf',
      metadata: { metadata: { brokerId: BROKER_APPROVE_ID, documentType } },
    });
    await db.collection('brokerDocuments').doc(`${PREFIX}-${documentType}`).set({
      brokerId: BROKER_APPROVE_ID,
      docType: documentType,
      documentType,
      title: `E2E ${documentType}`,
      fileName: `${PREFIX}.pdf`,
      storagePath,
      status: 'pending_review',
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    });
  }
}

async function seedOperationalFixtures() {
  const db = admin.firestore();
  const future = admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const freshGps = admin.firestore.Timestamp.now();

  await Promise.all([
    db.collection('owners').doc(OWNER_REVIEW_UID).set({
      name: `E2E Review Owner ${RUN_ID}`,
      displayName: `E2E Review Owner ${RUN_ID}`,
      email: `${PREFIX}-review-owner@bin-groups.com`,
      status: 'ACTIVE',
      e2eRunId: RUN_ID,
      createdAt: now(),
    }),
    db.collection('properties').doc(APPROVE_PROPERTY_ID).set({
      name: APPROVE_PROPERTY_NAME,
      propertyName: APPROVE_PROPERTY_NAME,
      ownerId: OWNER_REVIEW_UID,
      ownerUid: OWNER_REVIEW_UID,
      emirate: 'Dubai',
      serviceZone: 'Dubai Marina',
      address: 'Protected E2E approval fixture',
      status: 'pending_review',
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
    db.collection('properties').doc(REJECT_PROPERTY_ID).set({
      name: REJECT_PROPERTY_NAME,
      propertyName: REJECT_PROPERTY_NAME,
      ownerId: OWNER_REVIEW_UID,
      ownerUid: OWNER_REVIEW_UID,
      emirate: 'Abu Dhabi',
      serviceZone: 'Al Ain',
      address: 'Protected E2E rejection fixture',
      status: 'pending_review',
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
  ]);

  await Promise.all([
    db.collection('users').doc(PAYMENT_OWNER_UID).set({ role: 'owner', email: `${PREFIX}-payment-owner@bin-groups.com`, status: 'pending', e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('owners').doc(PAYMENT_OWNER_UID).set({ role: 'owner', email: `${PREFIX}-payment-owner@bin-groups.com`, status: 'PENDING', e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('intake_submissions').doc(PAYMENT_ID).set({ ownerUid: PAYMENT_OWNER_UID, status: 'PENDING_APPROVAL', quoteHash: PAYMENT_QUOTE_HASH, e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('contracts').doc(PAYMENT_ID).set({
      contractId: PAYMENT_ID,
      intakeId: PAYMENT_ID,
      ownerUid: PAYMENT_OWNER_UID,
      ownerId: PAYMENT_OWNER_UID,
      propertyId: PAYMENT_PROPERTY_ID,
      status: 'pending_approval',
      quoteHash: PAYMENT_QUOTE_HASH,
      annualContractValue: PAYMENT_ANNUAL_VALUE,
      quoteSnapshot: { annualContractValue: PAYMENT_ANNUAL_VALUE, activationDeposit: PAYMENT_DEPOSIT },
      ownerSigned: true,
      otpVerificationId: PAYMENT_OTP_ID,
      signatureState: { ownerSignatureName: PAYMENT_SIGNATURE },
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
    db.collection('contract_signature_otps').doc(PAYMENT_OTP_ID).set({
      status: 'VERIFIED',
      uid: PAYMENT_OWNER_UID,
      contractId: PAYMENT_ID,
      contractHash: PAYMENT_QUOTE_HASH,
      consumedFor: PAYMENT_ID,
      signature: PAYMENT_SIGNATURE,
      verifiedAt: now(),
      consumedAt: now(),
      e2eRunId: RUN_ID,
    }),
    db.collection('properties').doc(PAYMENT_PROPERTY_ID).set({
      name: `E2E Activation Property ${RUN_ID}`,
      ownerUid: PAYMENT_OWNER_UID,
      ownerId: PAYMENT_OWNER_UID,
      intakeId: PAYMENT_ID,
      quoteHash: PAYMENT_QUOTE_HASH,
      status: 'pending_approval',
      geo: { verified: true, dispatchReady: true, requiresGeoReview: false, lat: 25.2048, lng: 55.2708 },
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
    db.collection('payment_transactions').doc(PAYMENT_ID).set({
      paymentId: PAYMENT_ID,
      contractId: PAYMENT_ID,
      intakeId: PAYMENT_ID,
      ownerUid: PAYMENT_OWNER_UID,
      ownerId: PAYMENT_OWNER_UID,
      ownerName: PAYMENT_SIGNATURE,
      ownerEmail: `${PREFIX}-payment-owner@bin-groups.com`,
      propertyId: PAYMENT_PROPERTY_ID,
      amount: PAYMENT_DEPOSIT,
      activationDeposit: PAYMENT_DEPOSIT,
      currency: 'AED',
      paymentMethod: 'STRIPE',
      stripeSessionId: `cs_e2e_${RUN_ID}`,
      verified: true,
      paymentVerified: true,
      status: 'PENDING',
      paymentStatus: 'PAID',
      verificationState: 'PENDING_ADMIN',
      adminApprovalRequired: true,
      unlocksDashboard: false,
      quoteHash: PAYMENT_QUOTE_HASH,
      quoteSnapshot: { annualContractValue: PAYMENT_ANNUAL_VALUE, activationDeposit: PAYMENT_DEPOSIT },
      otpVerificationId: PAYMENT_OTP_ID,
      signatureName: PAYMENT_SIGNATURE,
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
  ]);

  await Promise.all([
    db.collection('users').doc(REJECT_PAYMENT_OWNER_UID).set({ role: 'owner', status: 'pending', e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('owners').doc(REJECT_PAYMENT_OWNER_UID).set({ role: 'owner', status: 'PENDING', e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('contracts').doc(REJECT_PAYMENT_ID).set({ ownerUid: REJECT_PAYMENT_OWNER_UID, status: 'pending_approval', e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('payment_transactions').doc(REJECT_PAYMENT_ID).set({
      paymentId: REJECT_PAYMENT_ID,
      contractId: REJECT_PAYMENT_ID,
      intakeId: REJECT_PAYMENT_ID,
      ownerUid: REJECT_PAYMENT_OWNER_UID,
      ownerName: `E2E Reject Payment Owner ${RUN_ID}`,
      amount: 2_000,
      currency: 'AED',
      paymentMethod: 'BANK_TRANSFER',
      status: 'PENDING',
      paymentStatus: 'PENDING',
      verificationState: 'PENDING_ADMIN',
      adminApprovalRequired: true,
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
  ]);

  await Promise.all([
    db.collection('users').doc(BROKER_APPROVE_ID).set({
      role: 'broker',
      displayName: BROKER_APPROVE_NAME,
      email: `${PREFIX}-broker-approve@bin-groups.com`,
      status: 'PENDING',
      approvalStatus: 'PENDING',
      brokerKycStatus: 'PENDING_REVIEW',
      kycStatus: 'PENDING_REVIEW',
      reraLicense: `RERA-${RUN_ID.slice(-8)}1`,
      emiratesIdNumber: '784-1990-1234567-1',
      bankName: 'E2E UAE Bank',
      bankAccountHolder: BROKER_APPROVE_NAME,
      bankIban: BROKER_IBAN,
      commissionAgreementAccepted: true,
      profileCompletionScore: 100,
      brokerProfileCompletion: 100,
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
    db.collection('broker_kyc_profiles').doc(BROKER_APPROVE_ID).set({
      submissionHash: BROKER_SUBMISSION_HASH,
      profileCompletionScore: 100,
      reraLicense: `RERA-${RUN_ID.slice(-8)}1`,
      emiratesIdNumber: '784-1990-1234567-1',
      bankName: 'E2E UAE Bank',
      bankAccountHolder: BROKER_APPROVE_NAME,
      bankIban: BROKER_IBAN,
      commissionAgreementAccepted: true,
      brokerKycStatus: 'PENDING_REVIEW',
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
    db.collection('users').doc(BROKER_REJECT_ID).set({
      role: 'broker',
      displayName: BROKER_REJECT_NAME,
      email: `${PREFIX}-broker-reject@bin-groups.com`,
      status: 'PENDING',
      brokerKycStatus: 'PENDING_REVIEW',
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
    db.collection('broker_kyc_profiles').doc(BROKER_REJECT_ID).set({
      submissionHash: BROKER_REJECT_HASH,
      brokerKycStatus: 'PENDING_REVIEW',
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
  ]);
  await seedBrokerDocuments();

  await Promise.all([
    db.collection('broker_commissions').doc(COMMISSION_APPROVE_ID).set({ brokerId: BROKER_APPROVE_ID, amount: 1_250, currency: 'AED', status: 'APPROVED', payoutStatus: 'REQUESTED', payoutRequestId: PAYOUT_APPROVE_ID, e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('broker_payout_requests').doc(PAYOUT_APPROVE_ID).set({ brokerId: BROKER_APPROVE_ID, brokerName: BROKER_APPROVE_NAME, brokerEmail: `${PREFIX}-broker-approve@bin-groups.com`, amount: 1_250, currency: 'AED', commissionIds: [COMMISSION_APPROVE_ID], commissionCount: 1, status: 'PENDING_ADMIN_REVIEW', approvalStatus: 'PENDING', paymentStatus: 'REQUESTED', bankName: 'E2E UAE Bank', bankIban: BROKER_IBAN, e2eRunId: RUN_ID, createdAt: now(), requestedAt: now() }),
    db.collection('broker_commissions').doc(COMMISSION_REJECT_ID).set({ brokerId: BROKER_APPROVE_ID, amount: 750, currency: 'AED', status: 'APPROVED', payoutStatus: 'REQUESTED', payoutRequestId: PAYOUT_REJECT_ID, e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('broker_payout_requests').doc(PAYOUT_REJECT_ID).set({ brokerId: BROKER_APPROVE_ID, brokerName: `E2E Payout Reject ${RUN_ID}`, brokerEmail: `${PREFIX}-broker-approve@bin-groups.com`, amount: 750, currency: 'AED', commissionIds: [COMMISSION_REJECT_ID], commissionCount: 1, status: 'PENDING_ADMIN_REVIEW', approvalStatus: 'PENDING', paymentStatus: 'REQUESTED', bankName: 'E2E UAE Bank', bankIban: BROKER_IBAN, e2eRunId: RUN_ID, createdAt: now(), requestedAt: now() }),
  ]);

  const readiness = {
    role: 'technician',
    displayName: SECOND_TECH_NAME,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    medicalCardStatus: 'VALID',
    medicalCardExpiry: future,
    drivingLicenseStatus: 'VALID',
    drivingLicenseExpiry: future,
    certificationsStatus: 'VERIFIED',
    currentShiftId: `${PREFIX}-shift-two`,
    shiftStatus: 'ACTIVE',
    deviceRegistered: true,
    lastGpsAt: freshGps,
    onDuty: true,
    dutyStatus: 'ON_DUTY',
    isAvailable: true,
    currentJobCount: 0,
    maxConcurrentJobs: 3,
    e2eRunId: RUN_ID,
    updatedAt: now(),
  };
  await Promise.all([
    db.collection('users').doc(SECOND_TECH_ID).set(readiness),
    db.collection('technicians').doc(SECOND_TECH_ID).set(readiness),
    db.collection('properties').doc(TICKET_PROPERTY_ID).set({ name: `E2E Dispatch Property ${RUN_ID}`, status: 'ACTIVE', e2eRunId: RUN_ID, createdAt: now() }),
    db.collection('maintenanceTickets').doc(TICKET_ID).set({
      tenantId: `${PREFIX}-tenant`,
      propertyId: TICKET_PROPERTY_ID,
      propertyName: `E2E Dispatch Property ${RUN_ID}`,
      unitId: `${PREFIX}-unit-101`,
      unitNumber: '101',
      floorNumber: '1',
      category: 'HVAC / AC systems',
      description: `E2E dispatch and re-dispatch ${RUN_ID}`,
      status: 'OPEN',
      priority: 'HIGH',
      e2eRunId: RUN_ID,
      createdAt: now(),
      updatedAt: now(),
    }),
  ]);
}

async function cleanupOperationalFixtures() {
  const db = admin.firestore();
  await Promise.all([deleteAuthUserByEmail(SUPPORT_EMAIL), deleteAuthUserByEmail(TECHNICIAN_EMAIL)]);

  const directDeletes: Array<[string, string]> = [
    ['owners', OWNER_REVIEW_UID], ['properties', APPROVE_PROPERTY_ID], ['properties', REJECT_PROPERTY_ID],
    ['users', PAYMENT_OWNER_UID], ['owners', PAYMENT_OWNER_UID], ['intake_submissions', PAYMENT_ID], ['contracts', PAYMENT_ID],
    ['contract_signature_otps', PAYMENT_OTP_ID], ['properties', PAYMENT_PROPERTY_ID], ['payment_transactions', PAYMENT_ID],
    ['invoices', PAYMENT_INVOICE_ID], ['propertyPassports', PAYMENT_PROPERTY_ID],
    ['users', REJECT_PAYMENT_OWNER_UID], ['owners', REJECT_PAYMENT_OWNER_UID], ['contracts', REJECT_PAYMENT_ID], ['payment_transactions', REJECT_PAYMENT_ID], ['intake_submissions', REJECT_PAYMENT_ID],
    ['users', BROKER_APPROVE_ID], ['broker_kyc_profiles', BROKER_APPROVE_ID], ['users', BROKER_REJECT_ID], ['broker_kyc_profiles', BROKER_REJECT_ID],
    ['broker_commissions', COMMISSION_APPROVE_ID], ['broker_commissions', COMMISSION_REJECT_ID], ['broker_payout_requests', PAYOUT_APPROVE_ID], ['broker_payout_requests', PAYOUT_REJECT_ID],
    ['users', SECOND_TECH_ID], ['technicians', SECOND_TECH_ID], ['properties', TICKET_PROPERTY_ID], ['maintenanceTickets', TICKET_ID],
  ];
  if (createdSupportUid) directDeletes.push(['users', createdSupportUid], ['staffAccess', createdSupportUid], ['staff', createdSupportUid], ['hrProfiles', createdSupportUid]);
  if (createdTechnicianUid) directDeletes.push(['users', createdTechnicianUid], ['staffAccess', createdTechnicianUid], ['staff', createdTechnicianUid], ['hrProfiles', createdTechnicianUid], ['technicians', createdTechnicianUid]);
  await Promise.all(directDeletes.map(([collectionName, id]) => db.collection(collectionName).doc(id).delete().catch(() => undefined)));

  await Promise.all(BROKER_DOCUMENT_TYPES.map((type) => db.collection('brokerDocuments').doc(`${PREFIX}-${type}`).delete().catch(() => undefined)));
  await Promise.all(BROKER_STORAGE_PATHS.map((storagePath) => admin.storage().bucket().file(storagePath).delete({ ignoreNotFound: true }).catch(() => undefined)));
  await db.collection('invoice_registry').doc(createHash('sha256').update(JSON.stringify({
    invoiceId: PAYMENT_INVOICE_ID,
    paymentId: PAYMENT_ID,
    contractId: PAYMENT_ID,
    intakeId: PAYMENT_ID,
    amount: PAYMENT_DEPOSIT,
    currency: 'AED',
    feeType: 'MOBILIZATION_DEPOSIT',
    quoteHash: PAYMENT_QUOTE_HASH,
  })).digest('hex')).delete().catch(() => undefined);

  for (const [field, value] of [
    ['paymentId', PAYMENT_ID], ['paymentId', REJECT_PAYMENT_ID], ['targetId', APPROVE_PROPERTY_ID], ['targetId', REJECT_PROPERTY_ID],
    ['targetId', BROKER_APPROVE_ID], ['targetId', BROKER_REJECT_ID], ['targetId', PAYOUT_APPROVE_ID], ['targetId', PAYOUT_REJECT_ID], ['ticketId', TICKET_ID],
  ] as Array<[string, string]>) await deleteQuery('audit_logs', field, value).catch(() => undefined);
  await deleteQuery('notifications', 'userId', OWNER_REVIEW_UID).catch(() => undefined);
  await deleteQuery('mail', 'metadata.ownerUid', PAYMENT_OWNER_UID).catch(() => undefined);
}

async function createStaffThroughUi(page: Page, name: string, email: string, roleLabel: string) {
  await page.getByRole('button', { name: /ADD STAFF \/ TECHNICIAN/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Full Name').fill(name);
  await dialog.getByLabel('Email Address').fill(email);
  await dialog.getByLabel('Role').click();
  await page.getByRole('option', { name: new RegExp(roleLabel, 'i') }).click();
  await dialog.getByRole('button', { name: /CREATE & SEND INVITATION/i }).click();
  await expect(dialog).not.toBeVisible({ timeout: 40_000 });
  return expect.poll(async () => (await findAuthUser(email))?.uid || '', { timeout: 45_000 }).not.toBe('');
}

async function patchTechnicianReadiness(uid: string) {
  const readiness = {
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    medicalCardStatus: 'VALID',
    medicalCardExpiry: admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000),
    drivingLicenseStatus: 'VALID',
    drivingLicenseExpiry: admin.firestore.Timestamp.fromMillis(Date.now() + 365 * 24 * 60 * 60 * 1000),
    certificationsStatus: 'VERIFIED',
    currentShiftId: `${PREFIX}-shift-one`,
    shiftStatus: 'ACTIVE',
    deviceRegistered: true,
    lastGpsAt: admin.firestore.Timestamp.now(),
    onDuty: true,
    dutyStatus: 'ON_DUTY',
    isAvailable: true,
    currentJobCount: 0,
    maxConcurrentJobs: 3,
    e2eRunId: RUN_ID,
    updatedAt: now(),
  };
  await Promise.all([
    admin.firestore().collection('users').doc(uid).set(readiness, { merge: true }),
    admin.firestore().collection('technicians').doc(uid).set({ role: 'technician', displayName: TECHNICIAN_NAME, ...readiness }, { merge: true }),
  ]);
}

test.describe('Admin protected operational business workflow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    requireLaunchCredentials();
    initializeAdminSdk();
    await cleanupOperationalFixtures().catch(() => undefined);
    await seedOperationalFixtures();
  });

  test.afterAll(async () => {
    if (!admin.apps.length) return;
    await cleanupOperationalFixtures();
  });

  test.beforeEach(async ({ page }) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = monitor;
    await monitor.assertTokenFingerprint();
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('adminCreateUser creates Staff and Technician with least-privilege custom claims', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(adminUrl('/hr'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.getByText('Staff Access Control')).toBeVisible({ timeout: 25_000 });

    await createStaffThroughUi(page, SUPPORT_NAME, SUPPORT_EMAIL, 'Support Admin');
    const supportUser = await expect.poll(async () => await findAuthUser(SUPPORT_EMAIL), { timeout: 45_000 }).toBeTruthy().then(() => findAuthUser(SUPPORT_EMAIL));
    if (!supportUser) throw new Error('adminCreateUser did not create the Support Admin Auth identity.');
    createdSupportUid = supportUser.uid;
    expect(supportUser.customClaims?.role).toBe('support_admin');
    expect(supportUser.customClaims?.admin).toBe(false);
    expect(supportUser.customClaims?.isAdmin).toBe(false);
    expect(supportUser.customClaims?.superAdmin).toBe(false);
    expect(supportUser.customClaims?.ceo).toBe(false);
    expect(supportUser.customClaims?.modules).toEqual(['dashboard', 'tenants', 'tickets']);
    expect(supportUser.customClaims?.permissions?.canDispatchJobs).toBe(true);
    expect(supportUser.customClaims?.permissions?.canManageTechnicians).not.toBe(true);

    await createStaffThroughUi(page, TECHNICIAN_NAME, TECHNICIAN_EMAIL, 'Technician');
    const technicianUser = await expect.poll(async () => await findAuthUser(TECHNICIAN_EMAIL), { timeout: 45_000 }).toBeTruthy().then(() => findAuthUser(TECHNICIAN_EMAIL));
    if (!technicianUser) throw new Error('adminCreateUser did not create the Technician Auth identity.');
    createdTechnicianUid = technicianUser.uid;
    expect(technicianUser.customClaims?.role).toBe('technician');
    expect(technicianUser.customClaims?.technician).toBe(true);
    expect(technicianUser.customClaims?.admin).toBe(false);
    expect(technicianUser.customClaims?.modules).toEqual([]);

    const [supportProfile, supportAccess, technicianProfile, technicianAccess] = await Promise.all([
      admin.firestore().collection('users').doc(createdSupportUid).get(),
      admin.firestore().collection('staffAccess').doc(createdSupportUid).get(),
      admin.firestore().collection('users').doc(createdTechnicianUid).get(),
      admin.firestore().collection('staffAccess').doc(createdTechnicianUid).get(),
    ]);
    expect(supportProfile.data()?.role).toBe('support_admin');
    expect(supportAccess.data()?.modules).toEqual(['dashboard', 'tenants', 'tickets']);
    expect(technicianProfile.data()?.role).toBe('technician');
    expect(technicianAccess.data()?.modules).toEqual([]);
    await patchTechnicianReadiness(createdTechnicianUid);
  });

  test('adminReviewOwnerProperty approves and rejects real pending Owner properties', async ({ page }) => {
    test.setTimeout(150_000);
    await page.goto(adminUrl('/owners'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);

    const approveRow = page.getByRole('row').filter({ hasText: APPROVE_PROPERTY_NAME }).first();
    await expect(approveRow).toBeVisible({ timeout: 30_000 });
    page.once('dialog', async (dialog) => dialog.accept());
    await approveRow.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await admin.firestore().collection('properties').doc(APPROVE_PROPERTY_ID).get()).data()?.status, { timeout: 40_000 }).toBe('APPROVED');

    const rejectRow = page.getByRole('row').filter({ hasText: REJECT_PROPERTY_NAME }).first();
    await expect(rejectRow).toBeVisible({ timeout: 30_000 });
    await rejectRow.getByRole('button', { name: 'Reject', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Reject Property Submission' });
    await dialog.getByLabel('Rejection Reason').fill('Protected E2E property evidence requires correction.');
    page.once('dialog', async (browserDialog) => browserDialog.accept());
    await dialog.getByRole('button', { name: 'Reject Property' }).click();
    await expect.poll(async () => (await admin.firestore().collection('properties').doc(REJECT_PROPERTY_ID).get()).data()?.status, { timeout: 40_000 }).toBe('REJECTED');

    const [approveAudit, rejectAudit] = await Promise.all([
      admin.firestore().collection('audit_logs').where('targetId', '==', APPROVE_PROPERTY_ID).where('action', '==', 'APPROVE_PROPERTY').get(),
      admin.firestore().collection('audit_logs').where('targetId', '==', REJECT_PROPERTY_ID).where('action', '==', 'REJECT_PROPERTY').get(),
    ]);
    expect(approveAudit.size).toBe(1);
    expect(rejectAudit.size).toBe(1);
  });

  test('payment approval, rejection and exactly-once activation mutate all authoritative records', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(adminUrl('/payments'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);

    const activationRow = page.getByRole('row').filter({ hasText: PAYMENT_ID }).first();
    await expect(activationRow).toBeVisible({ timeout: 35_000 });
    await activationRow.getByRole('button', { name: /Verify & Unlock/i }).click();
    const approvalDialog = page.getByRole('dialog', { name: /Confirm Payment & Unlock Owner/i });
    await expect(approvalDialog).toBeVisible();
    const confirm = approvalDialog.getByRole('button', { name: /Confirm & Unlock Owner/i });
    await expect(confirm).toBeEnabled();
    await confirm.evaluate((node: HTMLElement) => { node.click(); node.click(); });

    const db = admin.firestore();
    await expect.poll(async () => {
      const [payment, contract, intake, owner, property] = await Promise.all([
        db.collection('payment_transactions').doc(PAYMENT_ID).get(),
        db.collection('contracts').doc(PAYMENT_ID).get(),
        db.collection('intake_submissions').doc(PAYMENT_ID).get(),
        db.collection('users').doc(PAYMENT_OWNER_UID).get(),
        db.collection('properties').doc(PAYMENT_PROPERTY_ID).get(),
      ]);
      return [payment.data()?.status, contract.data()?.status, intake.data()?.status, owner.data()?.dashboardUnlocked, property.data()?.status].join('|');
    }, { timeout: 60_000 }).toBe('APPROVED|ACTIVE|ACTIVE|true|ACTIVE');

    const [invoice, registry, approvalAudits] = await Promise.all([
      db.collection('invoices').doc(PAYMENT_INVOICE_ID).get(),
      db.collection('invoice_registry').where('entityId', '==', PAYMENT_INVOICE_ID).get(),
      db.collection('audit_logs').where('action', '==', 'ADMIN_APPROVE_PAYMENT').where('paymentId', '==', PAYMENT_ID).get(),
    ]);
    expect(invoice.exists).toBe(true);
    expect(invoice.data()?.status).toBe('PAID');
    expect(registry.size).toBe(1);
    expect(approvalAudits.size, 'double invocation must remain idempotent and create one activation audit').toBe(1);

    await page.goto(adminUrl('/payments'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    const rejectRow = page.getByRole('row').filter({ hasText: REJECT_PAYMENT_ID }).first();
    await expect(rejectRow).toBeVisible({ timeout: 35_000 });
    await rejectRow.getByRole('button', { name: /Reject \/ Return/i }).click();
    const rejectDialog = page.getByRole('dialog', { name: /Return \/ Reject Payment Proof/i });
    await rejectDialog.getByLabel('Return reason / admin review note').fill('Protected E2E payment evidence does not match the submitted reference.');
    await rejectDialog.getByRole('button', { name: /Return \/ Reject/i }).click();
    await expect.poll(async () => (await db.collection('payment_transactions').doc(REJECT_PAYMENT_ID).get()).data()?.status, { timeout: 45_000 }).toBe('REJECTED');
  });

  test('adminReviewBrokerKyc and adminReviewBrokerPayoutRequest execute approval, rejection and settlement', async ({ page }) => {
    test.setTimeout(220_000);
    const db = admin.firestore();
    await page.goto(adminUrl('/broker'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);

    const approveBrokerRow = page.getByRole('row').filter({ hasText: BROKER_APPROVE_NAME }).first();
    await expect(approveBrokerRow).toBeVisible({ timeout: 35_000 });
    await approveBrokerRow.locator('button').nth(1).click();
    const approveDialog = page.getByRole('dialog', { name: /Approve broker KYC/i });
    await approveDialog.getByLabel('Review note').fill('Protected E2E KYC dossier verified against immutable Storage metadata.');
    await approveDialog.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => {
      const [publicProfile, privateProfile] = await Promise.all([
        db.collection('users').doc(BROKER_APPROVE_ID).get(),
        db.collection('broker_kyc_profiles').doc(BROKER_APPROVE_ID).get(),
      ]);
      return `${publicProfile.data()?.brokerKycStatus}|${privateProfile.data()?.brokerKycStatus}`;
    }, { timeout: 60_000 }).toBe('VERIFIED|VERIFIED');

    const rejectBrokerRow = page.getByRole('row').filter({ hasText: BROKER_REJECT_NAME }).first();
    await expect(rejectBrokerRow).toBeVisible({ timeout: 35_000 });
    await rejectBrokerRow.locator('button').nth(2).click();
    const rejectKycDialog = page.getByRole('dialog', { name: /Reject broker KYC/i });
    await rejectKycDialog.getByLabel('Rejection reason').fill('Protected E2E Broker identity evidence is incomplete.');
    await rejectKycDialog.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect.poll(async () => (await db.collection('users').doc(BROKER_REJECT_ID).get()).data()?.brokerKycStatus, { timeout: 45_000 }).toBe('REJECTED');

    const payoutApproveCard = page.getByText(BROKER_APPROVE_NAME, { exact: true }).last().locator('xpath=ancestor::div[contains(@class,"MuiBox-root")][1]');
    await expect(payoutApproveCard.getByRole('button', { name: 'Approve', exact: true })).toBeVisible({ timeout: 35_000 });
    await payoutApproveCard.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect.poll(async () => (await db.collection('broker_payout_requests').doc(PAYOUT_APPROVE_ID).get()).data()?.status, { timeout: 45_000 }).toBe('APPROVED');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    const refreshedPayoutCard = page.getByText(BROKER_APPROVE_NAME, { exact: true }).last().locator('xpath=ancestor::div[contains(@class,"MuiBox-root")][1]');
    page.once('dialog', async (dialog) => dialog.accept(`E2E-PAYOUT-${RUN_ID}`));
    await refreshedPayoutCard.getByRole('button', { name: /Mark paid/i }).click();
    await expect.poll(async () => (await db.collection('broker_payout_requests').doc(PAYOUT_APPROVE_ID).get()).data()?.status, { timeout: 45_000 }).toBe('PAID');
    expect((await db.collection('broker_commissions').doc(COMMISSION_APPROVE_ID).get()).data()?.status).toBe('PAID');

    const payoutRejectCard = page.getByText(`E2E Payout Reject ${RUN_ID}`, { exact: true }).locator('xpath=ancestor::div[contains(@class,"MuiBox-root")][1]');
    page.once('dialog', async (dialog) => dialog.accept('Protected E2E payout bank evidence requires correction.'));
    await payoutRejectCard.getByRole('button', { name: 'Reject', exact: true }).click();
    await expect.poll(async () => (await db.collection('broker_payout_requests').doc(PAYOUT_REJECT_ID).get()).data()?.status, { timeout: 45_000 }).toBe('REJECTED');
    expect((await db.collection('broker_commissions').doc(COMMISSION_REJECT_ID).get()).data()?.payoutStatus).toBe('AVAILABLE');
  });

  test('adminAssignTechnician assigns and re-dispatches an active ticket with a server audit trail', async ({ page }) => {
    test.setTimeout(180_000);
    if (!createdTechnicianUid) throw new Error('The live Admin-created Technician is required for dispatch proof.');
    const db = admin.firestore();

    await page.goto(adminUrl('/tickets'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    let ticketRow = page.getByRole('row').filter({ hasText: `E2E Dispatch Property ${RUN_ID}` }).first();
    await expect(ticketRow).toBeVisible({ timeout: 35_000 });
    await ticketRow.getByRole('button', { name: 'ASSIGN', exact: true }).click();
    const assignmentDialog = page.getByRole('dialog', { name: /MANUAL SPECIALIST ASSIGNMENT/i });
    await assignmentDialog.getByText(TECHNICIAN_NAME, { exact: true }).click();
    await expect.poll(async () => (await db.collection('maintenanceTickets').doc(TICKET_ID).get()).data()?.assignedTechnicianId, { timeout: 50_000 }).toBe(createdTechnicianUid);

    await db.collection('maintenanceTickets').doc(TICKET_ID).set({ status: 'EN_ROUTE', updatedAt: now() }, { merge: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    ticketRow = page.getByRole('row').filter({ hasText: `E2E Dispatch Property ${RUN_ID}` }).first();
    await ticketRow.getByRole('button', { name: 'REASSIGN', exact: true }).click();
    const reassignDialog = page.getByRole('dialog', { name: /MANUAL SPECIALIST ASSIGNMENT/i });
    await reassignDialog.getByText(SECOND_TECH_NAME, { exact: true }).click();

    await expect.poll(async () => {
      const ticket = (await db.collection('maintenanceTickets').doc(TICKET_ID).get()).data() || {};
      return `${ticket.assignedTechnicianId}|${ticket.status}|${ticket.reassignmentReasonSource}`;
    }, { timeout: 50_000 }).toBe(`${SECOND_TECH_ID}|ASSIGNED|ADMIN_PORTAL_DEFAULT`);

    const audits = await db.collection('audit_logs')
      .where('action', '==', 'ADMIN_REASSIGN_READY_TECHNICIAN')
      .where('ticketId', '==', TICKET_ID)
      .get();
    expect(audits.size).toBe(1);
    expect(audits.docs[0].data()?.previousTechnicianId).toBe(createdTechnicianUid);
    expect(audits.docs[0].data()?.technicianId).toBe(SECOND_TECH_ID);
  });
});
