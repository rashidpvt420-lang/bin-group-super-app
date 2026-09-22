#!/usr/bin/env node

import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import admin from 'firebase-admin';
import { chromium } from '@playwright/test';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';
import { signInWithRequiredTotpMfa } from './lib/firebase-mfa-sign-in.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Operational Application Evidence';
const JOB = 'verify-and-publish';
const CANONICAL_FOUNDER_LOGIN = 'rashidpvt420-lang';
const PRODUCTION_URL = 'https://bin-group-57c60.web.app';
const CREATE_NOTIFICATION_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/createNotification';
const ADMIN_MATCH_BROKER_ATTRIBUTION_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/adminMatchBrokerAttribution';
const ADMIN_APPROVE_PAYMENT_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/adminApprovePayment';
const ADMIN_CREATE_USER_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/adminCreateUser';
const ADMIN_UPDATE_STAFF_ONBOARDING_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/adminUpdateStaffOnboarding';
const REBUILD_CONTRACT_RENEWAL_WATCH_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/rebuildContractRenewalWatch';
const BROKER_EVIDENCE_TYPE = 'OPERATIONAL_APPLICATION_BROKER_PAYMENT_BINDING';
const BROKER_ACTIVATION_EVIDENCE_TYPE = 'OPERATIONAL_APPLICATION_BROKER_ACTIVATION_FIXTURE';
const STAFF_EVIDENCE_TYPE = 'OPERATIONAL_APPLICATION_STAFF_CLAIMS';
const RENEWAL_EVIDENCE_TYPE = 'OPERATIONAL_APPLICATION_RENEWAL_SCHEDULER';
const EXPECTED_STORAGE_BUCKET = 'bin-group-57c60.firebasestorage.app';
const TERMINAL_DELIVERY_STATES = new Set(['SUCCESS', 'PARTIAL', 'FAILED', 'NO_REGISTERED_TOKEN']);
const PARTICIPANT_FIELDS = ['tenantId', 'tenantUid', 'userId', 'createdBy', 'requesterId'];
const PUSH_REGISTRATION_ATTEMPTS = 3;
const PUSH_REGISTRATION_WAIT_MS = 30_000;
const EVIDENCE_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl8fP8AAAAASUVORK5CYII=';
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
const upper = (value) => text(value).toUpperCase();
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const fail = (message) => {
  throw new Error(`[prepare-application-evidence] ${message}`);
};
const millis = (value) => {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(Number(value?._seconds))) return Number(value._seconds) * 1000;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
};
const responseJson = async (response) => {
  const raw = await response.text();
  try { return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};
const photoEvidence = (ticket) => [
  ticket.photoUrl,
  ticket.imageUrl,
  ticket.evidenceUrl,
  ticket.beforePhotoUrl,
  ticket.requestPhotoUrl,
  ticket.primaryPhotoUrl,
  ...(Array.isArray(ticket.photoUrls) ? ticket.photoUrls : []),
  ...(Array.isArray(ticket.photos) ? ticket.photos : []),
  ...(Array.isArray(ticket.beforePhotos) ? ticket.beforePhotos : []),
  ...(Array.isArray(ticket.tenantPhotos) ? ticket.tenantPhotos : []),
  ...(Array.isArray(ticket.initialPhotoUrls) ? ticket.initialPhotoUrls : []),
  ...(Array.isArray(ticket.images) ? ticket.images : []),
  ...(Array.isArray(ticket.attachments) ? ticket.attachments.map((item) => item?.url || item?.path) : []),
].map(text).find((value) => /^(https:\/\/|gs:\/\/|tickets\/|maintenance-requests\/|tenant-tickets\/)/i.test(value)) || '';

function classifyPushDiagnostic(value) {
  const message = lower(value);
  if (!message) return 'unknown';
  if (message.includes('vapid')) return 'vapid';
  if (message.includes('app check') || message.includes('appcheck')) return 'app-check';
  if (message.includes('permission') || message.includes('denied')) return 'permission';
  if (message.includes('service worker') || message.includes('service-worker')) return 'service-worker';
  if (message.includes('messaging') || message.includes('fcm')) return 'messaging';
  if (message.includes('unauthenticated') || message.includes('auth/')) return 'auth';
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) return 'network';
  if (message.includes('registration') || message.includes('push service')) return 'registration';
  return 'other';
}

async function pushClientState(page) {
  return page.evaluate(async () => {
    const supportsNotifications = 'Notification' in window;
    const supportsServiceWorker = 'serviceWorker' in navigator;
    let messagingWorkerActive = false;
    let registrationCount = 0;
    if (supportsServiceWorker) {
      const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
      registrationCount = registrations.length;
      messagingWorkerActive = registrations.some((registration) =>
        Boolean(registration.active?.scriptURL?.endsWith('/firebase-messaging-sw.js')),
      );
    }
    return {
      permission: supportsNotifications ? Notification.permission : 'unsupported',
      supportsNotifications,
      supportsServiceWorker,
      registrationCount,
      messagingWorkerActive,
    };
  });
}

function assertProtectedContext() {
  if (process.env.GITHUB_ACTIONS !== 'true') fail('GitHub Actions is required');
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('protected main is required');
  if (process.env.GITHUB_WORKFLOW !== WORKFLOW || process.env.GITHUB_JOB !== JOB) fail('unexpected protected workflow context');
  if (process.env.GITHUB_ACTOR !== CANONICAL_FOUNDER_LOGIN) fail('exact repository-owner command provenance is required');
  if (!['all', 'tenantNotificationDelivery', 'brokerCommissionLockExactlyOnce', 'adminStaffClaims', 'renewalScheduler'].includes(text(process.env.OPERATIONAL_GATE))) fail('application evidence preparation was not selected');
  if (!/^[0-9a-f]{40}$/.test(text(process.env.GITHUB_SHA))) fail('frozen release SHA is invalid');
  if (!/^[0-9a-f]{40}$/.test(text(process.env.CLEARANCE_CONTROL_PLANE_SHA))) fail('control-plane SHA is invalid');
  if (!/^\d+$/.test(text(process.env.GITHUB_RUN_ID))) fail('workflow run ID is invalid');
  if (text(process.env.E2E_BASE_URL).replace(/\/+$/, '') !== PRODUCTION_URL) fail('E2E_BASE_URL must be the canonical production site');
}

async function matchingTestTicket(db, tenantUid, { required = true, createdAfter = 0 } = {}) {
  const documents = new Map();
  for (const collection of ['maintenanceTickets', 'tickets']) {
    for (const field of PARTICIPANT_FIELDS) {
      const snapshot = await db.collection(collection).where(field, '==', tenantUid).limit(250).get();
      for (const document of snapshot.docs) {
        documents.set(`${collection}/${document.id}`, {
          collection,
          id: document.id,
          data: document.data() || {},
        });
      }
    }
  }

  const candidates = [...documents.values()]
    .filter(({ id, data }) => /^[A-Za-z0-9_-]{3,180}$/.test(id)
      && PARTICIPANT_FIELDS.map((field) => text(data[field])).includes(tenantUid)
      && Boolean(text(data.propertyId))
      && Boolean(text(data.unitId || data.unitNumber || data.unit))
      && Boolean(photoEvidence(data))
      && (createdAfter <= 0 || Math.max(millis(data.updatedAt), millis(data.createdAt), millis(data.evidenceUploadedAt)) >= createdAfter - 5_000))
    .sort((left, right) => Math.max(millis(right.data.updatedAt), millis(right.data.createdAt), millis(right.data.evidenceUploadedAt))
      - Math.max(millis(left.data.updatedAt), millis(left.data.createdAt), millis(left.data.evidenceUploadedAt)));
  if (!candidates.length && required) fail('protected E2E Tenant has no production ticket with photo, property, and unit evidence');
  return candidates[0] || null;
}

async function createTicketThroughDeployedTenantUi(page, startedAt) {
  await page.goto(`${PRODUCTION_URL}/tenant/request?category=plumbing&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  const locationField = page.getByTestId('tenant-request-location');
  try {
    await locationField.waitFor({ state: 'visible', timeout: 20_000 });
  } catch {
    const fallbackVisible = await page.locator('[data-testid="tenant-residence-loading"]').isVisible().catch(() => false);
    fail(`deployed Tenant request form is unavailable for the protected test Tenant${fallbackVisible ? ' (residence still loading)' : ''}`);
  }

  await locationField.locator('input, textarea').first().fill('Kitchen sink - protected launch evidence');
  await page.getByTestId('tenant-request-description').locator('input, textarea').first().fill('Protected production maintenance request used to verify the real Tenant ticket and notification delivery path.');
  await page.locator('input[type="file"]').first().setInputFiles({
    name: `operational-evidence-${process.env.GITHUB_RUN_ID}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(EVIDENCE_PNG_BASE64, 'base64'),
  });

  const submit = page.locator('[data-testid="tenant-request-submit"]');
  await submit.waitFor({ state: 'visible', timeout: 10_000 });
  if (await submit.isDisabled()) {
    fail('deployed Tenant request form rejected dispatch prerequisites (unit/property/GPS/photo/category)');
  }
  await submit.click();
  await page.waitForURL('**/tenant/tickets', { timeout: 60_000 });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const projectId = resolveFirebaseAdminProjectId();
    initializeFirebaseAdmin(admin, projectId);
    const tenant = await admin.auth().getUserByEmail(lower(process.env.E2E_TENANT_EMAIL));
    const ticket = await matchingTestTicket(admin.firestore(), tenant.uid, { required: false, createdAfter: startedAt });
    if (ticket) return ticket;
    await sleep(1_000);
  }
  fail('deployed Tenant request completed navigation but no fresh photo-backed production ticket became observable');
}

async function waitForFreshPushRegistration(db, tenantUid, startedAt, timeoutMs = PUSH_REGISTRATION_WAIT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = await db.collection('users').doc(tenantUid).collection('fcmTokens').get();
    const fresh = snapshot.docs.some((document) => {
      const data = document.data() || {};
      const token = text(data.token);
      return token.length >= 50
        && sha256(token) === document.id
        && data.active !== false
        && lower(data.permission || 'granted') === 'granted'
        && millis(data.lastRegisteredAt || data.updatedAt || data.createdAt) >= startedAt - 5_000;
    });
    if (fresh) return true;
    await sleep(1_000);
  }
  return false;
}

async function ensureFreshPushRegistration({ db, tenantUid, startedAt, page, diagnostics }) {
  for (let attempt = 1; attempt <= PUSH_REGISTRATION_ATTEMPTS; attempt += 1) {
    if (await waitForFreshPushRegistration(db, tenantUid, startedAt)) return;
    if (attempt < PUSH_REGISTRATION_ATTEMPTS) {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForURL('**/tenant/dashboard', { timeout: 30_000 });
      await sleep(1_500);
    }
  }

  const state = await pushClientState(page).catch(() => ({
    permission: 'unknown',
    supportsNotifications: false,
    supportsServiceWorker: false,
    registrationCount: 0,
    messagingWorkerActive: false,
  }));
  const diagnosticText = [...diagnostics].sort().join('|') || 'none';
  fail(
    `deployed Tenant client did not register a fresh production FCM token `
      + `(permission=${state.permission};notifications=${state.supportsNotifications};serviceWorker=${state.supportsServiceWorker};`
      + `messagingWorkerActive=${state.messagingWorkerActive};registrationCount=${state.registrationCount};diagnostics=${diagnosticText})`,
  );
}

async function signInAndExchangeAppCheck({ apiKey, appId, debugToken, email, password, tenantUid }) {
  const signInEndpoint = new URL('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword');
  signInEndpoint.searchParams.set('key', apiKey);
  const signInResponse = await fetch(signInEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: `${PRODUCTION_URL}/` },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const signInPayload = await responseJson(signInResponse);
  if (!signInResponse.ok || !text(signInPayload?.idToken) || text(signInPayload?.localId) !== tenantUid) {
    fail(`protected E2E Tenant Firebase sign-in failed with HTTP ${signInResponse.status}`);
  }

  const exchangeEndpoint = new URL(
    `https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(appId)}:exchangeDebugToken`,
  );
  exchangeEndpoint.searchParams.set('key', apiKey);
  const exchangeResponse = await fetch(exchangeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: `${PRODUCTION_URL}/` },
    body: JSON.stringify({ debugToken }),
  });
  const exchangePayload = await responseJson(exchangeResponse);
  if (!exchangeResponse.ok || !text(exchangePayload?.token)) {
    fail(`production App Check exchange failed with HTTP ${exchangeResponse.status}`);
  }
  return { idToken: text(signInPayload.idToken), appCheckToken: text(exchangePayload.token) };
}

async function createAndVerifyNotification({ db, auth, tenantUid, ticket }) {
  const response = await fetch(CREATE_NOTIFICATION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.idToken}`,
      'X-Firebase-AppCheck': auth.appCheckToken,
      'content-type': 'application/json',
      Origin: PRODUCTION_URL,
      Referer: `${PRODUCTION_URL}/`,
    },
    body: JSON.stringify({
      data: {
        recipientId: tenantUid,
        recipientRole: 'tenant',
        type: 'OPERATIONAL_EVIDENCE_TENANT_DELIVERY',
        title: 'BIN GROUP service notification verification',
        body: 'Protected delivery verification for an existing test maintenance request.',
        ticketId: ticket.id,
        link: `/tenant/ticket/${ticket.id}`,
        metadata: {
          operationalEvidence: true,
          workflowRunId: text(process.env.GITHUB_RUN_ID),
          releaseSha: text(process.env.GITHUB_SHA),
        },
      },
    }),
  });
  const payload = await responseJson(response);
  const result = payload?.result || payload?.data || payload;
  const notificationIds = Array.isArray(result?.notificationIds) ? result.notificationIds.map(text).filter(Boolean) : [];
  if (!response.ok || result?.recipientCount !== 1 || notificationIds.length !== 1) {
    fail(`deployed createNotification did not create one Tenant receipt (HTTP ${response.status})`);
  }

  const notificationId = notificationIds[0];
  const deadline = Date.now() + 120_000;
  let lastState = 'PENDING';
  while (Date.now() < deadline) {
    const snapshot = await db.collection('notifications').doc(notificationId).get();
    const data = snapshot.data() || {};
    lastState = text(data.pushDeliveryState).toUpperCase() || 'PENDING';
    if (
      snapshot.exists
      && lastState === 'SUCCESS'
      && Number(data.pushTokenCount || 0) >= 1
      && Number(data.pushSuccessCount || 0) >= 1
      && Number(data.pushFailureCount || 0) === 0
      && text(data.deliverySource) === 'callable:createNotification'
      && text(data.createdByUid) === tenantUid
      && text(data.recipientId) === tenantUid
      && text(data.ticketId) === ticket.id
      && text(data.metadata?.workflowRunId) === text(process.env.GITHUB_RUN_ID)
      && text(data.metadata?.releaseSha) === text(process.env.GITHUB_SHA)
    ) {
      return notificationId;
    }
    if (TERMINAL_DELIVERY_STATES.has(lastState) && lastState !== 'SUCCESS') break;
    await sleep(1_000);
  }
  fail(`production FCM receipt did not succeed (state=${lastState})`);
}

function staffEvidenceEmail() {
  return `operational-application-staff-${text(process.env.GITHUB_RUN_ID)}@example.invalid`;
}

async function founderCallableSession({ apiKey, appId, debugToken }) {
  const founderEmail = lower(process.env.E2E_FOUNDER_EMAIL);
  const founderPassword = text(process.env.E2E_FOUNDER_PASSWORD);
  const founderTotpSecret = text(process.env.E2E_FOUNDER_TOTP_SECRET);
  if (founderEmail !== 'ceo@bin-groups.com' || !founderPassword || !founderTotpSecret) {
    fail('canonical Founder MFA bindings are incomplete for staff evidence preparation');
  }
  const founder = await signInWithRequiredTotpMfa({
    apiKey,
    email: founderEmail,
    password: founderPassword,
    totpSecret: founderTotpSecret,
    referer: 'https://admin.bin-groups.com/',
  });
  if (!founder?.idToken || !founder?.uid || founder.secondFactorType !== 'totp' || !founder.secondFactorIdentifier) {
    fail('Founder TOTP verification did not return a protected second-factor session');
  }

  const exchangeEndpoint = new URL(
    `https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(appId)}:exchangeDebugToken`,
  );
  exchangeEndpoint.searchParams.set('key', apiKey);
  const exchangeResponse = await fetch(exchangeEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ debugToken }),
  });
  const exchangePayload = await responseJson(exchangeResponse);
  if (!exchangeResponse.ok || !text(exchangePayload?.token)) {
    fail(`Founder App Check exchange failed with HTTP ${exchangeResponse.status}`);
  }
  return { uid: founder.uid, idToken: founder.idToken, appCheckToken: text(exchangePayload.token) };
}

async function invokeProtectedCallable(url, session, data, label) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'X-Firebase-AppCheck': session.appCheckToken,
      'content-type': 'application/json',
      Origin: 'https://admin.bin-groups.com',
      Referer: 'https://admin.bin-groups.com/',
    },
    body: JSON.stringify({ data }),
  });
  const payload = await responseJson(response);
  const result = payload?.result || payload?.data || payload;
  if (!response.ok || !result?.success) fail(`${label} failed with HTTP ${response.status}`);
  return result;
}

async function deleteMatchingDocuments(snapshot) {
  await Promise.all(snapshot.docs.map((document) => document.ref.delete()));
}

async function cleanupStaffClaimsEvidence({ db, auth }) {
  const email = staffEvidenceEmail();
  const record = await auth.getUserByEmail(email).catch((error) => {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  });
  if (!record) return;

  const uid = record.uid;
  const userSnapshot = await db.collection('users').doc(uid).get();
  const marker = userSnapshot.data() || {};
  if (text(marker.e2eEvidenceType) !== STAFF_EVIDENCE_TYPE || text(marker.e2eRunId) !== text(process.env.GITHUB_RUN_ID)) {
    fail('refusing to clean a non-evidence staff identity');
  }

  const [auditSnapshot, mailSnapshot] = await Promise.all([
    db.collection('audit_logs').where('targetId', '==', uid).limit(100).get(),
    db.collection('mail').where('targetUid', '==', uid).limit(100).get(),
  ]);
  await Promise.all([
    deleteMatchingDocuments(auditSnapshot),
    deleteMatchingDocuments(mailSnapshot),
    db.collection('users').doc(uid).delete(),
    db.collection('staffAccess').doc(uid).delete(),
    db.collection('hrProfiles').doc(uid).delete(),
    db.collection('private_hr_profiles').doc(uid).delete(),
    db.collection('technicians').doc(uid).delete(),
    db.collection('staff').doc(uid).delete().catch(() => undefined),
  ]);
  await auth.deleteUser(uid);
  console.log(`[prepare-application-evidence] CLEANUP gate=adminStaffClaims staffHash=${sha256(uid).slice(0, 12)}…`);
}

async function prepareStaffClaimsEvidence({ db, auth, apiKey, appId, debugToken }) {
  await cleanupStaffClaimsEvidence({ db, auth });
  try {
    const session = await founderCallableSession({ apiKey, appId, debugToken });
  const email = staffEvidenceEmail();
  const displayName = `Operational Application Technician ${text(process.env.GITHUB_RUN_ID)}`;

  const created = await invokeProtectedCallable(
    ADMIN_CREATE_USER_URL,
    session,
    { email, displayName, role: 'technician', modules: [] },
    'deployed adminCreateUser',
  );
  const uid = text(created.uid);
  if (!/^[A-Za-z0-9_-]{3,180}$/.test(uid) || lower(created.role) !== 'technician') {
    fail('deployed adminCreateUser returned an invalid Technician identity');
  }

  await auth.updateUser(uid, { emailVerified: true, disabled: false });
  const marker = {
    e2eLaunchSeed: true,
    e2eEvidenceType: STAFF_EVIDENCE_TYPE,
    e2eRunId: text(process.env.GITHUB_RUN_ID),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await Promise.all([
    db.collection('users').doc(uid).set(marker, { merge: true }),
    db.collection('staffAccess').doc(uid).set(marker, { merge: true }),
    db.collection('hrProfiles').doc(uid).set(marker, { merge: true }),
    db.collection('technicians').doc(uid).set(marker, { merge: true }),
  ]);

  const invitations = await db.collection('mail').where('targetUid', '==', uid).limit(20).get();
  await deleteMatchingDocuments(invitations);

  const activated = await invokeProtectedCallable(
    ADMIN_UPDATE_STAFF_ONBOARDING_URL,
    session,
    {
      uid,
      profileComplete: true,
      documentsComplete: true,
      contractComplete: true,
      deviceReady: true,
      activationApproved: true,
    },
    'deployed adminUpdateStaffOnboarding',
  );
  if (activated.active !== true || text(activated.stage).toUpperCase() !== 'ACTIVE') {
    fail('deployed staff onboarding did not activate the evidence Technician');
  }

  const [authRecord, userSnapshot, accessSnapshot, hrSnapshot, technicianSnapshot, auditSnapshot] = await Promise.all([
    auth.getUser(uid),
    db.collection('users').doc(uid).get(),
    db.collection('staffAccess').doc(uid).get(),
    db.collection('hrProfiles').doc(uid).get(),
    db.collection('technicians').doc(uid).get(),
    db.collection('audit_logs').where('targetId', '==', uid).limit(100).get(),
  ]);
  const user = userSnapshot.data() || {};
  const access = accessSnapshot.data() || {};
  const hr = hrSnapshot.data() || {};
  const technician = technicianSnapshot.data() || {};
  const claims = authRecord.customClaims || {};
  const createAudits = auditSnapshot.docs.filter((document) => (document.data() || {}).action === 'ADMIN_CREATE_STAFF_USER');
  if (
    authRecord.disabled ||
    authRecord.emailVerified !== true ||
    lower(claims.role || claims.userRole) !== 'technician' ||
    claims.staff !== true ||
    claims.technician !== true ||
    lower(user.role || user.userRole) !== 'technician' ||
    lower(access.role) !== 'technician' ||
    access.active !== true ||
    lower(hr.role || hr.employeeType) !== 'technician' ||
    lower(technician.role || technician.userRole) !== 'technician' ||
    createAudits.length !== 1
  ) {
    fail('prepared staff evidence does not match the deployed Technician provisioning contract');
  }

    console.log(`[prepare-application-evidence] PASS gate=adminStaffClaims staffHash=${sha256(uid).slice(0, 12)}…`);
  } catch (error) {
    await cleanupStaffClaimsEvidence({ db, auth }).catch(() => undefined);
    throw error;
  }
}

function renewalEvidenceContractId() {
  return `operational_application_renewal_${text(process.env.GITHUB_RUN_ID)}`;
}

async function cleanupRenewalSchedulerEvidence({ db }) {
  const contractId = renewalEvidenceContractId();
  const contractRef = db.collection('contracts').doc(contractId);
  const contractSnapshot = await contractRef.get();
  if (contractSnapshot.exists) {
    const marker = contractSnapshot.data() || {};
    if (
      marker.e2eLaunchSeed !== true
      || text(marker.e2eEvidenceType) !== RENEWAL_EVIDENCE_TYPE
      || text(marker.e2eRunId) !== text(process.env.GITHUB_RUN_ID)
    ) {
      fail('refusing to clean a non-evidence renewal source');
    }
  }

  const [watchSnapshot, notificationSnapshot, mailSnapshot, auditSnapshot] = await Promise.all([
    db.collection('contract_renewal_watch').where('sourceId', '==', contractId).limit(100).get(),
    db.collection('notifications').where('sourceId', '==', contractId).limit(250).get(),
    db.collection('mail').where('contractId', '==', contractId).limit(100).get(),
    db.collection('audit_logs').where('targetId', '==', contractId).limit(100).get(),
  ]);

  await Promise.all([
    deleteMatchingDocuments(watchSnapshot),
    deleteMatchingDocuments(notificationSnapshot),
    deleteMatchingDocuments(mailSnapshot),
    deleteMatchingDocuments(auditSnapshot),
    db.collection('document_generation_requests').doc(`renewal_contracts_${contractId}`).delete().catch(() => undefined),
    contractRef.delete().catch(() => undefined),
    admin.storage().bucket(EXPECTED_STORAGE_BUCKET).deleteFiles({ prefix: `contracts/${contractId}/` }).catch(() => undefined),
  ]);

  console.log(`[prepare-application-evidence] CLEANUP gate=renewalScheduler contractHash=${sha256(contractId).slice(0, 12)}…`);
}

async function prepareRenewalSchedulerEvidence({ db, auth, apiKey, appId, debugToken }) {
  await cleanupRenewalSchedulerEvidence({ db });
  try {
    const session = await founderCallableSession({ apiKey, appId, debugToken });
    const tenantEmail = lower(process.env.E2E_TENANT_EMAIL);
    if (!/^\S+@\S+\.\S+$/.test(tenantEmail)) fail('canonical protected Tenant email is required for renewal scheduler evidence');
    const tenant = await auth.getUserByEmail(tenantEmail);
    if (tenant.disabled || tenant.emailVerified !== true || tenant.customClaims?.testAccount !== true) {
      fail('protected Tenant identity is not an active verified test account for renewal scheduler evidence');
    }

    const contractId = renewalEvidenceContractId();
    const expiryAt = admin.firestore.Timestamp.fromMillis(Date.now() + (30 * 24 * 60 * 60 * 1000));
    await db.collection('contracts').doc(contractId).set({
      id: contractId,
      contractId,
      propertyId: `${contractId}_property`,
      propertyName: 'Protected Renewal Evidence Property',
      unitId: `${contractId}_unit`,
      unitNumber: 'E2E-RENEWAL',
      ownerId: session.uid,
      ownerUid: session.uid,
      tenantId: tenant.uid,
      tenantUid: tenant.uid,
      status: 'ACTIVE',
      contractStatus: 'ACTIVE',
      renewalStatus: 'PENDING',
      contractEndDate: expiryAt,
      e2eLaunchSeed: true,
      e2eEvidenceType: RENEWAL_EVIDENCE_TYPE,
      e2eRunId: text(process.env.GITHUB_RUN_ID),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const startedAt = Date.now();

    const response = await fetch(REBUILD_CONTRACT_RENEWAL_WATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.idToken}`,
        'X-Firebase-AppCheck': session.appCheckToken,
        'content-type': 'application/json',
        Origin: 'https://admin.bin-groups.com',
        Referer: 'https://admin.bin-groups.com/',
      },
      body: JSON.stringify({ data: {} }),
    });
    const payload = await responseJson(response);
    const result = payload?.result || payload?.data || payload;
    if (!response.ok || result?.status !== 'SUCCESS' || Number(result?.scanned || 0) < 1) {
      fail('deployed rebuildContractRenewalWatch failed with HTTP ' + response.status);
    }

    const responseIds = Array.isArray(result?.results)
      ? result.results
          .filter((item) => item && item.skipped !== true)
          .map((item) => text(item.id))
          .filter(Boolean)
      : [];

    const deadline = Date.now() + 90_000;
    let snapshot = null;
    while (Date.now() < deadline) {
      const currentSnapshot = await db.collection('contract_renewal_watch')
        .where('sourceId', '==', contractId)
        .limit(20)
        .get();
      const freshMatches = currentSnapshot.docs.filter((document) => {
        const data = document.data() || {};
        const observedMs = Math.max(
          millis(data.generatedAt),
          millis(data.updatedAt),
          millis(data.createdAt),
          millis(data.processedAt),
        );
        return text(data.sourceCollection) === 'contracts'
          && text(data.sourceId) === contractId
          && text(data.contractId) === contractId
          && text(data.tenantId) === tenant.uid
          && /^(https:\/\/|gs:\/\/)/i.test(text(data.pdfUrl))
          && data.completed === true
          && observedMs >= startedAt - 5_000;
      });
      if (freshMatches.length === 1) {
        snapshot = freshMatches[0];
        break;
      }
      if (freshMatches.length > 1) {
        fail('deployed renewal scheduler produced multiple fresh watch records for the run-scoped contract');
      }
      await sleep(1_000);
    }
    if (!snapshot) fail('deployed renewal scheduler did not produce a fresh PDF-backed watch record');
    if (!responseIds.includes(snapshot.id)) {
      fail('deployed renewal scheduler response did not include the fresh run-scoped watch record');
    }

    const watchId = snapshot.id;
    const auditSnapshot = await db.collection('audit_logs').where('targetId', '==', contractId).limit(100).get();
    const matchingAudit = auditSnapshot.docs.filter((document) => {
      const data = document.data() || {};
      return data.action === 'CONTRACT_RENEWAL_MILESTONE_PROCESSED'
        && text(data.actorId) === 'CONTRACT_RENEWAL_PDF_SYSTEM';
    });
    if (matchingAudit.length !== 1) {
      fail('deployed renewal scheduler did not write exactly one matching audit record');
    }

    console.log(
      `[prepare-application-evidence] PASS gate=renewalScheduler watchHash=${sha256(watchId).slice(0, 12)}… contractHash=${sha256(contractId).slice(0, 12)}…`,
    );
  } catch (error) {
    await cleanupRenewalSchedulerEvidence({ db }).catch(() => undefined);
    throw error;
  }
}

function brokerActivationFixtureIds() {
  const runId = text(process.env.GITHUB_RUN_ID);
  if (!/^\d+$/.test(runId)) fail('workflow run ID is required for Broker activation fixture');
  const paymentId = 'operational_application_activation_' + runId;
  const ownerUid = 'operational_application_owner_' + runId;
  return {
    runId, paymentId, contractId: paymentId, intakeId: paymentId, ownerUid,
    propertyId: 'operational_application_property_' + runId,
    otpId: 'operational_application_otp_' + runId,
    receiptPath: 'payment-references/owners/' + ownerUid + '/' + paymentId + '/cash-receipt.pdf',
  };
}

async function invokeProtectedStatusCallable(url, session, data, label) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + session.idToken,
      'X-Firebase-AppCheck': session.appCheckToken,
      'content-type': 'application/json',
      Origin: 'https://admin.bin-groups.com',
      Referer: 'https://admin.bin-groups.com/',
    },
    body: JSON.stringify({ data }),
  });
  const payload = await responseJson(response);
  const result = payload?.result || payload?.data || payload;
  if (!response.ok || upper(result?.status) !== 'SUCCESS') fail(label + ' failed with HTTP ' + response.status);
  return result;
}

async function cleanupBrokerActivationEvidence({ db }) {
  const ids = brokerActivationFixtureIds();
  const paymentSnap = await db.collection('payment_transactions').doc(ids.paymentId).get();
  if (paymentSnap.exists) {
    const payment = paymentSnap.data() || {};
    if (text(payment.e2eEvidenceType) !== BROKER_ACTIVATION_EVIDENCE_TYPE || text(payment.e2eRunId) !== ids.runId) {
      fail('refusing to clean a non-evidence Broker activation payment');
    }
  }
  const leadId = 'operational_application_broker_' + sha256(ids.contractId).slice(0, 24);
  const commissionId = 'commission_' + ids.contractId;
  const invoiceId = 'MOB-' + sha256(ids.paymentId).slice(0, 20).toUpperCase();
  const quoteHash = sha256('operational-application-broker-quote:' + ids.runId);
  const invoiceHash = sha256(JSON.stringify({
    invoiceId, paymentId: ids.paymentId, contractId: ids.contractId, intakeId: ids.intakeId,
    amount: 6000, currency: 'AED', feeType: 'MOBILIZATION_DEPOSIT', quoteHash,
  }));
  const directRefs = [
    ['brokerLeads', leadId], ['broker_commissions', commissionId],
    ['payment_transactions', ids.paymentId], ['contracts', ids.contractId],
    ['intake_submissions', ids.intakeId], ['contract_signature_otps', ids.otpId],
    ['properties', ids.propertyId], ['propertyPassports', ids.propertyId],
    ['users', ids.ownerUid], ['owners', ids.ownerUid], ['invoices', invoiceId],
    ['invoice_registry', invoiceHash], ['mail', 'owner_payment_approved_' + ids.paymentId],
  ];
  await Promise.all(directRefs.map(([collection, id]) => db.collection(collection).doc(id).delete().catch(() => undefined)));
  await admin.storage().bucket(EXPECTED_STORAGE_BUCKET).file(ids.receiptPath).delete({ ignoreNotFound: true }).catch(() => undefined);
  console.log('[prepare-application-evidence] CLEANUP gate=brokerCommissionLockExactlyOnce activationHash=' + sha256(ids.paymentId).slice(0, 12) + '…');
}

async function createApprovedBrokerActivationFixture({ db, apiKey, appId, debugToken }) {
  const ids = brokerActivationFixtureIds();
  await cleanupBrokerActivationEvidence({ db });
  const configSnap = await db.collection('system_payment_config').doc('current').get();
  if (!configSnap.exists) fail('active Phase 1 payment configuration is missing');
  const raw = configSnap.data() || {};
  const approvedMethods = Array.isArray(raw.approvedMethods) ? Array.from(new Set(raw.approvedMethods.map(upper).filter(Boolean))).sort() : [];
  const effectiveAt = raw.effectiveAt || raw.updatedAt;
  const effectiveAtMs = typeof effectiveAt?.toMillis === 'function' ? Number(effectiveAt.toMillis()) : Date.parse(text(effectiveAt));
  const legalBeneficiary = text(raw.legalBeneficiary || raw.beneficiaryName);
  const officeLocation = text(raw.officeLocation || raw.cashOfficeLocation);
  if (upper(raw.status) !== 'ACTIVE' || legalBeneficiary !== 'BIN GROUP L.L.C - S.P.C' || !text(raw.version)
    || !Number.isFinite(effectiveAtMs) || upper(raw.currency) !== 'AED'
    || JSON.stringify(approvedMethods) !== JSON.stringify(['CASH', 'CHEQUE']) || !officeLocation
    || raw.bankTransferEnabled === true || raw.stripeEnabled === true) {
    fail('active Phase 1 payment configuration is not the locked Cash/Cheque policy');
  }
  const configuration = {
    version: text(raw.version), effectiveAtMs, legalBeneficiary, bankName: '', accountNumber: '', iban: '', swiftBic: '',
    currency: 'AED', officeLocation, approvedMethods,
  };
  const configHash = sha256(JSON.stringify(configuration));
  const annualContractValue = 40000;
  const activationDeposit = 6000;
  const quoteHash = sha256('operational-application-broker-quote:' + ids.runId);
  const signature = 'Operational Broker Owner ' + ids.runId;
  const paymentReferenceId = 'CASH-OPERATIONAL-' + ids.runId;
  const receiptPayload = Buffer.from('%PDF-1.4\n% BIN GROUP operational Broker CASH activation receipt\n%%EOF\n');
  const receiptHash = crypto.createHash('sha256').update(receiptPayload).digest('hex');
  const bucket = admin.storage().bucket(EXPECTED_STORAGE_BUCKET);
  await bucket.file(ids.receiptPath).save(receiptPayload, {
    resumable: false, contentType: 'application/pdf',
    metadata: { metadata: {
      ownerUid: ids.ownerUid, paymentId: ids.paymentId, intakeId: ids.intakeId,
      evidenceType: 'owner_payment_receipt', receiptHash, uploadedByAdmin: 'operational-application-evidence',
      uploadedAt: new Date().toISOString(),
    } },
  });
  const [receiptMetadata] = await bucket.file(ids.receiptPath).getMetadata();
  const receiptGeneration = text(receiptMetadata.generation);
  if (!receiptGeneration) fail('run-scoped Broker activation receipt has no immutable Storage generation');
  const receiptUrl = 'gs://' + bucket.name + '/' + ids.receiptPath;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const marker = { testAccount: true, e2eLaunchSeed: true, e2eEvidenceType: BROKER_ACTIVATION_EVIDENCE_TYPE, e2eRunId: ids.runId };
  await Promise.all([
    db.collection('users').doc(ids.ownerUid).set({ ...marker, role: 'owner', status: 'pending', email: 'operational-broker-owner-' + ids.runId + '@example.invalid', createdAt: now, updatedAt: now }),
    db.collection('owners').doc(ids.ownerUid).set({ ...marker, role: 'owner', status: 'PENDING', email: 'operational-broker-owner-' + ids.runId + '@example.invalid', createdAt: now, updatedAt: now }),
    db.collection('intake_submissions').doc(ids.intakeId).set({ ...marker, ownerUid: ids.ownerUid, status: 'PENDING_APPROVAL', quoteHash, createdAt: now, updatedAt: now }),
    db.collection('contracts').doc(ids.contractId).set({ ...marker, contractId: ids.contractId, intakeId: ids.intakeId, ownerUid: ids.ownerUid, ownerId: ids.ownerUid, propertyId: ids.propertyId, status: 'pending_approval', quoteHash, annualContractValue, quoteSnapshot: { annualContractValue, activationDeposit }, ownerSigned: true, otpVerificationId: ids.otpId, signatureState: { ownerSignatureName: signature }, createdAt: now, updatedAt: now }),
    db.collection('contract_signature_otps').doc(ids.otpId).set({ ...marker, status: 'VERIFIED', uid: ids.ownerUid, contractId: ids.contractId, contractHash: quoteHash, consumedFor: ids.contractId, signature, verifiedAt: now, consumedAt: now }),
    db.collection('properties').doc(ids.propertyId).set({ ...marker, name: 'Operational Broker Activation ' + ids.runId, ownerUid: ids.ownerUid, ownerId: ids.ownerUid, intakeId: ids.intakeId, quoteHash, status: 'pending_approval', geo: { verified: true, dispatchReady: true, requiresGeoReview: false, lat: 24.4539, lng: 54.3773 }, createdAt: now, updatedAt: now }),
    db.collection('payment_transactions').doc(ids.paymentId).set({
      ...marker, paymentId: ids.paymentId, contractId: ids.contractId, intakeId: ids.intakeId, ownerUid: ids.ownerUid, ownerId: ids.ownerUid,
      ownerName: signature, ownerEmail: 'operational-broker-owner-' + ids.runId + '@example.invalid', propertyId: ids.propertyId,
      amount: activationDeposit, activationDeposit, currency: 'AED', paymentMethod: 'CASH', method: 'CASH',
      paymentReferenceId, paymentReference: paymentReferenceId, verified: false, paymentVerified: false, unlocksDashboard: false,
      status: 'PENDING', paymentStatus: 'PENDING_ADMIN_APPROVAL', verificationState: 'PENDING_ADMIN', adminApprovalRequired: true,
      paymentConfigVersion: configuration.version, paymentConfigurationVersion: configuration.version,
      paymentConfigHash: configHash, paymentConfigurationHash: configHash,
      paymentManifest: { configVersion: configuration.version, configHash, legalBeneficiary, currency: 'AED', officeLocation, approvedMethods, selectedMethod: 'CASH', capturedAt: new Date().toISOString() },
      paymentProofUrl: receiptUrl, paymentProofPath: ids.receiptPath, paymentProofHash: receiptHash, paymentProofGeneration: receiptGeneration,
      paymentProofEvidence: { receiptUrl, storagePath: ids.receiptPath, receiptHash, generation: receiptGeneration, recordedBy: 'operational-application-evidence' },
      receiptUrl, receiptPath: ids.receiptPath, receiptHash, receiptGeneration, quoteHash, quoteSnapshot: { annualContractValue, activationDeposit },
      otpVerificationId: ids.otpId, signatureName: signature, workflowVersion: 5, inspectionVerified: true, createdAt: now, updatedAt: now,
    }),
  ]);
  const session = await founderCallableSession({ apiKey, appId, debugToken });
  await invokeProtectedStatusCallable(ADMIN_APPROVE_PAYMENT_URL, session, { paymentId: ids.paymentId, paymentReferenceId, amountReceived: activationDeposit, method: 'CASH', notes: 'Protected run-scoped Broker attribution activation evidence.' }, 'deployed adminApprovePayment');
  const invoiceId = 'MOB-' + sha256(ids.paymentId).slice(0, 20).toUpperCase();
  const [paymentSnap, contractSnap, invoiceSnap] = await Promise.all([
    db.collection('payment_transactions').doc(ids.paymentId).get(), db.collection('contracts').doc(ids.contractId).get(), db.collection('invoices').doc(invoiceId).get(),
  ]);
  const payment = paymentSnap.data() || {};
  const contract = contractSnap.data() || {};
  const invoice = invoiceSnap.data() || {};
  if (upper(payment.status) !== 'APPROVED' || payment.paymentVerified !== true || payment.unlocksDashboard !== true
    || upper(contract.status) !== 'ACTIVE' || upper(invoice.status) !== 'PAID' || upper(invoice.feeType) !== 'MOBILIZATION_DEPOSIT'
    || text(invoice.paymentId) !== ids.paymentId || text(invoice.contractId) !== ids.contractId) {
    fail('deployed adminApprovePayment did not produce the required test-only approved activation');
  }
  console.log('[prepare-application-evidence] created approved test-only Broker activation paymentHash=' + sha256(ids.paymentId).slice(0, 12) + '…');
  return { payment: { id: ids.paymentId, data: payment }, contractId: ids.contractId, contract, ownerUid: ids.ownerUid, intakeId: ids.intakeId, propertyId: ids.propertyId, invoice: { id: invoiceId, data: invoice } };
}
async function prepareBrokerCommissionEvidence({ db, auth, apiKey, appId, debugToken }) {
  const brokerMailboxEmail = lower(process.env.E2E_BROKER_MAILBOX_EMAIL);
  if (!/^\S+@\S+\.\S+$/.test(brokerMailboxEmail)) fail('canonical protected Broker mailbox email is missing or invalid');
  const brokerRecord = await auth.getUserByEmail(brokerMailboxEmail).catch(() => null);
  if (!brokerRecord?.uid || brokerRecord.disabled === true || brokerRecord.emailVerified !== true) {
    fail('canonical protected Broker Auth account is missing, disabled, or unverified');
  }
  const brokerProfileSnapshot = await db.collection('users').doc(brokerRecord.uid).get();
  if (!brokerProfileSnapshot.exists) fail('canonical protected Broker profile is missing');
  const brokerProfile = brokerProfileSnapshot.data() || {};
  if (
    brokerProfile.e2eLaunchSeed !== true
    || lower(brokerProfile.role || brokerProfile.userRole || brokerProfile.primaryRole) !== 'broker'
    || lower(brokerProfile.email) !== brokerMailboxEmail
    || brokerProfile.suspended === true
  ) fail('canonical protected Broker profile does not match the production evidence identity');
  const broker = { id: brokerRecord.uid, data: brokerProfile };

  const paymentSnapshot = await db.collection('payment_transactions').where('status', '==', 'APPROVED').limit(250).get();
  const payments = paymentSnapshot.docs
    .map((document) => ({ id: document.id, data: document.data() || {} }))
    .filter(({ data }) => data.paymentVerified === true && data.unlocksDashboard === true)
    .sort((left, right) => Math.max(millis(right.data.approvedAt), millis(right.data.updatedAt), millis(right.data.createdAt))
      - Math.max(millis(left.data.approvedAt), millis(left.data.updatedAt), millis(left.data.createdAt)));

  let target = null;
  for (const payment of payments) {
    const contractId = text(payment.data.contractId || payment.data.intakeId || payment.id);
    const ownerUid = text(payment.data.ownerUid || payment.data.ownerId);
    if (!/^[A-Za-z0-9_-]{3,180}$/.test(contractId) || !/^[A-Za-z0-9_-]{3,180}$/.test(ownerUid)) continue;
    const [contractSnapshot, ownerProfileSnapshot, invoiceSnapshot] = await Promise.all([
      db.collection('contracts').doc(contractId).get(),
      db.collection('users').doc(ownerUid).get(),
      db.collection('invoices').where('contractId', '==', contractId).limit(20).get(),
    ]);
    if (!contractSnapshot.exists || !ownerProfileSnapshot.exists) continue;
    const contract = contractSnapshot.data() || {};
    const ownerProfile = ownerProfileSnapshot.data() || {};
    const ownerRecord = await auth.getUser(ownerUid).catch(() => null);
    if (!(ownerProfile.testAccount === true || ownerProfile.e2eLaunchSeed === true || ownerRecord?.customClaims?.testAccount === true)) continue;
    if (ownerRecord?.disabled === true || upper(contract.status || contract.contractStatus) !== 'ACTIVE') continue;
    const existingBrokerUid = text(contract.brokerUid || contract.brokerId);
    if (existingBrokerUid && existingBrokerUid !== broker.id) continue;
    const invoice = invoiceSnapshot.docs.map((document) => ({ id: document.id, data: document.data() || {} })).find(({ data }) =>
      upper(data.status) === 'PAID'
      && upper(data.feeType) === 'MOBILIZATION_DEPOSIT'
      && text(data.contractId) === contractId
      && text(data.paymentId) === payment.id
    );
    if (!invoice) continue;
    target = { payment, contractId, contract, ownerUid, intakeId: text(payment.data.intakeId || contract.intakeId), propertyId: text(contract.propertyId), invoice };
    break;
  }
  if (!target) {
    target = await createApprovedBrokerActivationFixture({ db, apiKey, appId, debugToken });
  }

  const leadId = `operational_application_broker_${sha256(target.contractId).slice(0, 24)}`;
  const leadRef = db.collection('brokerLeads').doc(leadId);
  const existingLeadSnapshot = await leadRef.get();
  const existingLead = existingLeadSnapshot.data() || {};
  if (text(existingLead.brokerId || existingLead.brokerUid) && text(existingLead.brokerId || existingLead.brokerUid) !== broker.id) {
    fail('deterministic Broker evidence lead is bound to another Broker');
  }
  if (lower(existingLead.status) === 'converted' && text(existingLead.matchedContractId) && text(existingLead.matchedContractId) !== target.contractId) {
    fail('deterministic Broker evidence lead is already converted to another contract');
  }
  if (lower(existingLead.status) !== 'converted') {
    const now = admin.firestore.FieldValue.serverTimestamp();
    await leadRef.set({
      brokerId: broker.id, brokerUid: broker.id, brokerName: text(broker.data.displayName || broker.data.name || 'E2E Broker'),
      brokerEmail: lower(broker.data.email), brokerCode: text(broker.data.brokerCode || broker.data.affiliateCode),
      leadName: 'Protected operational application evidence', ownerId: target.ownerUid, ownerUid: target.ownerUid,
      intakeId: target.intakeId || null, contractId: target.contractId, propertyId: target.propertyId || null, status: 'negotiation',
      lifecycleStatus: 'OWNER_ACTIVATION_APPROVED', attributionId: `operational_application_${sha256(`${broker.id}:${target.contractId}`).slice(0, 32)}`,
      e2eEvidenceType: BROKER_EVIDENCE_TYPE, e2eLaunchSeed: true, createdAt: existingLead.createdAt || now, updatedAt: now,
    }, { merge: true });
  }

  const founderEmail = lower(process.env.E2E_FOUNDER_EMAIL);
  const founderPassword = text(process.env.E2E_FOUNDER_PASSWORD);
  const founderTotpSecret = text(process.env.E2E_FOUNDER_TOTP_SECRET);
  if (founderEmail !== 'ceo@bin-groups.com' || !founderPassword || !founderTotpSecret) fail('canonical Founder MFA bindings are incomplete for Broker commission preparation');
  const founder = await signInWithRequiredTotpMfa({ apiKey, email: founderEmail, password: founderPassword, totpSecret: founderTotpSecret, referer: 'https://admin.bin-groups.com/' });
  if (!founder?.idToken || !founder?.uid || founder.secondFactorType !== 'totp' || !founder.secondFactorIdentifier) fail('Founder TOTP verification did not return a protected second-factor session');

  const exchangeEndpoint = new URL(`https://content-firebaseappcheck.googleapis.com/v1/projects/${PROJECT_ID}/apps/${encodeURIComponent(appId)}:exchangeDebugToken`);
  exchangeEndpoint.searchParams.set('key', apiKey);
  const exchangeResponse = await fetch(exchangeEndpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', Referer: 'https://admin.bin-groups.com/' }, body: JSON.stringify({ debugToken }),
  });
  const exchangePayload = await responseJson(exchangeResponse);
  if (!exchangeResponse.ok || !text(exchangePayload?.token)) fail(`Founder App Check exchange failed with HTTP ${exchangeResponse.status}`);

  const response = await fetch(ADMIN_MATCH_BROKER_ATTRIBUTION_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${founder.idToken}`, 'X-Firebase-AppCheck': text(exchangePayload.token), 'content-type': 'application/json', Origin: 'https://admin.bin-groups.com', Referer: 'https://admin.bin-groups.com/' },
    body: JSON.stringify({ data: { leadId, contractId: target.contractId, intakeId: target.intakeId || '', ownerId: target.ownerUid, propertyId: target.propertyId || '' } }),
  });
  const payload = await responseJson(response);
  const result = payload?.result || payload?.data || payload;
  const expectedCommissionId = `commission_${target.contractId}`;
  if (!response.ok || result?.status !== 'SUCCESS' || text(result?.commissionId) !== expectedCommissionId || text(result?.brokerId) !== broker.id) {
    fail(`deployed adminMatchBrokerAttribution did not create the exact payment-bound commission (HTTP ${response.status})`);
  }

  const [commissionSnapshot, convertedLeadSnapshot, contractAfterSnapshot, attributionAuditSnapshot, commissionQuery] = await Promise.all([
    db.collection('broker_commissions').doc(expectedCommissionId).get(), leadRef.get(), db.collection('contracts').doc(target.contractId).get(),
    db.collection('auditLogs').doc(`broker_attribution_${leadId}_${target.contractId}`).get(), db.collection('broker_commissions').where('contractId', '==', target.contractId).limit(20).get(),
  ]);
  const commission = commissionSnapshot.data() || {};
  const convertedLead = convertedLeadSnapshot.data() || {};
  const contractAfter = contractAfterSnapshot.data() || {};
  const attributionAudit = attributionAuditSnapshot.data() || {};
  if (!commissionSnapshot.exists || commissionQuery.size !== 1 || commissionQuery.docs[0].id !== expectedCommissionId || text(commission.contractId) !== target.contractId || text(commission.brokerId || commission.brokerUid) !== broker.id) fail('production Broker commission was not deterministically locked exactly once');
  if (lower(convertedLead.status) !== 'converted' || text(convertedLead.matchedContractId) !== target.contractId || text(convertedLead.commissionId) !== expectedCommissionId || text(convertedLead.commissionCreationStatus) !== 'COMMISSION_CREATED_SERVER_SIDE') fail('production Broker lead was not converted through the deployed attribution path');
  if (!attributionAuditSnapshot.exists || attributionAudit.action !== 'ADMIN_MATCH_BROKER_ATTRIBUTION' || text(attributionAudit.commissionId) !== expectedCommissionId || text(attributionAudit.brokerId) !== broker.id) fail('production Broker attribution audit is missing or mismatched');
  if (contractAfter.commissionGenerated !== true || text(contractAfter.commissionId) !== expectedCommissionId || text(contractAfter.brokerId || contractAfter.brokerUid) !== broker.id) fail('production contract did not retain the deterministic Broker commission binding');
  if (upper(target.payment.data.status) !== 'APPROVED' || target.payment.data.paymentVerified !== true || target.payment.data.unlocksDashboard !== true || upper(target.invoice.data.status) !== 'PAID' || upper(target.invoice.data.feeType) !== 'MOBILIZATION_DEPOSIT' || text(target.invoice.data.paymentId) !== target.payment.id || text(target.invoice.data.contractId) !== target.contractId) fail('Broker preparation lost the approved payment or paid mobilization invoice binding');
  console.log(`[prepare-application-evidence] PASS gate=brokerCommissionLockExactlyOnce contractHash=${sha256(target.contractId).slice(0, 12)}… commissionHash=${sha256(expectedCommissionId).slice(0, 12)}… leadHash=${sha256(leadId).slice(0, 12)}…`);
}

async function main() {
  assertProtectedContext();
  const selectedGate = text(process.env.OPERATIONAL_GATE);
  const projectId = resolveFirebaseAdminProjectId();
  if (projectId !== PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
  initializeFirebaseAdmin(admin, projectId);
  const db = admin.firestore();
  const auth = admin.auth();

  if (text(process.env.APPLICATION_PREPARATION_MODE) === 'cleanup-staff') {
    if (!['all', 'adminStaffClaims'].includes(selectedGate)) fail('staff evidence cleanup is not selected for this gate');
    await cleanupStaffClaimsEvidence({ db, auth });
    return;
  }

  if (text(process.env.APPLICATION_PREPARATION_MODE) === 'cleanup-renewal') {
    if (!['all', 'renewalScheduler'].includes(selectedGate)) fail('renewal evidence cleanup is not selected for this gate');
    await cleanupRenewalSchedulerEvidence({ db });
    return;
  }

  if (text(process.env.APPLICATION_PREPARATION_MODE) === 'cleanup-broker') {
    if (!['all', 'brokerCommissionLockExactlyOnce'].includes(selectedGate)) fail('Broker evidence cleanup is not selected for this gate');
    await cleanupBrokerActivationEvidence({ db });
    return;
  }

  const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
  const appId = text(process.env.VITE_FIREBASE_APP_ID);
  const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
  if (!apiKey || !appId || !/^[0-9a-f-]{36}$/i.test(debugToken)) fail('protected Firebase API key, App Check app ID, and debug token are incomplete');

  if (['all', 'adminStaffClaims'].includes(selectedGate)) {
    await prepareStaffClaimsEvidence({ db, auth, apiKey, appId, debugToken });
    if (selectedGate === 'adminStaffClaims') return;
  }

  if (['all', 'renewalScheduler'].includes(selectedGate)) {
    await prepareRenewalSchedulerEvidence({ db, auth, apiKey, appId, debugToken });
    if (selectedGate === 'renewalScheduler') return;
  }

  if (['all', 'brokerCommissionLockExactlyOnce'].includes(selectedGate)) {
    await prepareBrokerCommissionEvidence({ db, auth, apiKey, appId, debugToken });
    if (selectedGate === 'brokerCommissionLockExactlyOnce') return;
  }

  const tenantEmail = lower(process.env.E2E_TENANT_EMAIL);
  const tenantPassword = text(process.env.E2E_TENANT_PASSWORD);
  if (!/^\S+@\S+\.\S+$/.test(tenantEmail) || !tenantPassword) fail('protected Tenant Auth bindings are incomplete');
  const tenant = await admin.auth().getUserByEmail(tenantEmail);
  const profile = (await db.collection('users').doc(tenant.uid).get()).data() || {};
  const role = lower(tenant.customClaims?.role || tenant.customClaims?.userRole || profile.role || profile.userRole);
  if (tenant.disabled || !tenant.emailVerified || tenant.customClaims?.testAccount !== true || profile.testAccount !== true || role !== 'tenant') {
    fail('protected Tenant identity is not an active, verified, test-only Tenant');
  }

  const startedAt = Date.now();
  const profileDir = await mkdtemp(path.join(os.tmpdir(), 'bin-application-fcm-'));
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    channel: 'chromium',
  });
  try {
    await context.grantPermissions(['notifications'], { origin: PRODUCTION_URL });
    const page = await context.newPage();
    const pushDiagnostics = new Set();
    page.on('console', (message) => {
      const raw = message.text();
      if (raw.includes('[Push]')) pushDiagnostics.add(classifyPushDiagnostic(raw));
    });
    page.on('pageerror', (error) => {
      const raw = text(error?.message);
      if (/push|messaging|firebase|service.?worker|app.?check/i.test(raw)) {
        pushDiagnostics.add(classifyPushDiagnostic(raw));
      }
    });
    await page.addInitScript((token) => {
      window.FIREBASE_APPCHECK_DEBUG_TOKEN = token;
    }, debugToken);
    await page.goto(`${PRODUCTION_URL}/login?intendedRole=tenant&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((email) => {
      localStorage.clear();
      sessionStorage.clear();
      const now = new Date().toISOString();
      localStorage.setItem('bin_legal_terms_accepted_v7_1', now);
      localStorage.setItem(`bin_legal_terms_accepted_v7_1_${email}`, now);
      localStorage.setItem('bin_pdpl_consent', 'true');
      localStorage.setItem('bin_gps_consent', 'true');
    }, tenantEmail);
    await page.goto(`${PRODUCTION_URL}/login?intendedRole=tenant&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.locator('input[type="email"], input[name*="email" i]').first().fill(tenantEmail);
    await page.locator('input[type="password"]').first().fill(tenantPassword);
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL('**/tenant/dashboard', { timeout: 30_000 });
    await ensureFreshPushRegistration({
      db,
      tenantUid: tenant.uid,
      startedAt,
      page,
      diagnostics: pushDiagnostics,
    });

    let ticket = await matchingTestTicket(db, tenant.uid, { required: false });
    if (!ticket) {
      ticket = await createTicketThroughDeployedTenantUi(page, startedAt);
      console.log(`[prepare-application-evidence] created fresh deployed Tenant request ticketHash=${sha256(ticket.id).slice(0, 12)}…`);
    }

    const auth = await signInAndExchangeAppCheck({
      apiKey,
      appId,
      debugToken,
      email: tenantEmail,
      password: tenantPassword,
      tenantUid: tenant.uid,
    });
    const notificationId = await createAndVerifyNotification({ db, auth, tenantUid: tenant.uid, ticket });
    console.log(
      `[prepare-application-evidence] PASS gate=tenantNotificationDelivery notificationHash=${sha256(notificationId).slice(0, 12)}… ticketHash=${sha256(ticket.id).slice(0, 12)}…`,
    );
  } finally {
    await context.close();
    await rm(profileDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '[prepare-application-evidence] unknown failure');
  process.exitCode = 1;
});
