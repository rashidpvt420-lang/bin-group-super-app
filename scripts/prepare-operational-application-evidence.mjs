#!/usr/bin/env node

import crypto from 'node:crypto';
import admin from 'firebase-admin';
import { chromium } from '@playwright/test';
import { initializeFirebaseAdmin, resolveFirebaseAdminProjectId } from './firebase-admin-bootstrap.mjs';

const PROJECT_ID = 'bin-group-57c60';
const REPOSITORY = 'rashidpvt420-lang/bin-group-super-app';
const WORKFLOW = 'Operational Application Evidence';
const JOB = 'verify-and-publish';
const CANONICAL_FOUNDER_LOGIN = 'rashidpvt420-lang';
const PRODUCTION_URL = 'https://bin-group-57c60.web.app';
const CREATE_NOTIFICATION_URL = 'https://europe-west3-bin-group-57c60.cloudfunctions.net/createNotification';
const TERMINAL_DELIVERY_STATES = new Set(['SUCCESS', 'PARTIAL', 'FAILED', 'NO_REGISTERED_TOKEN']);
const PARTICIPANT_FIELDS = ['tenantId', 'tenantUid', 'userId', 'createdBy', 'requesterId'];
const text = (value) => String(value ?? '').trim();
const lower = (value) => text(value).toLowerCase();
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

function assertProtectedContext() {
  if (process.env.GITHUB_ACTIONS !== 'true') fail('GitHub Actions is required');
  if (process.env.GITHUB_REPOSITORY !== REPOSITORY || process.env.GITHUB_REF !== 'refs/heads/main') fail('protected main is required');
  if (process.env.GITHUB_WORKFLOW !== WORKFLOW || process.env.GITHUB_JOB !== JOB) fail('unexpected protected workflow context');
  if (process.env.GITHUB_ACTOR !== CANONICAL_FOUNDER_LOGIN) fail('exact repository-owner command provenance is required');
  if (!['all', 'tenantNotificationDelivery'].includes(text(process.env.OPERATIONAL_GATE))) fail('tenant notification preparation was not selected');
  if (!/^[0-9a-f]{40}$/.test(text(process.env.GITHUB_SHA))) fail('frozen release SHA is invalid');
  if (!/^[0-9a-f]{40}$/.test(text(process.env.CLEARANCE_CONTROL_PLANE_SHA))) fail('control-plane SHA is invalid');
  if (!/^\d+$/.test(text(process.env.GITHUB_RUN_ID))) fail('workflow run ID is invalid');
  if (text(process.env.E2E_BASE_URL).replace(/\/+$/, '') !== PRODUCTION_URL) fail('E2E_BASE_URL must be the canonical production site');
}

async function matchingTestTicket(db, tenantUid) {
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
      && Boolean(photoEvidence(data)))
    .sort((left, right) => Math.max(millis(right.data.updatedAt), millis(right.data.createdAt))
      - Math.max(millis(left.data.updatedAt), millis(left.data.createdAt)));
  if (!candidates.length) fail('protected E2E Tenant has no existing production ticket with photo, property, and unit evidence');
  return candidates[0];
}

async function waitForFreshPushRegistration(db, tenantUid, startedAt) {
  const deadline = Date.now() + 90_000;
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
    if (fresh) return;
    await sleep(1_000);
  }
  fail('deployed Tenant client did not register a fresh production FCM token');
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

async function main() {
  assertProtectedContext();
  const apiKey = text(process.env.VITE_FIREBASE_API_KEY);
  const appId = text(process.env.VITE_FIREBASE_APP_ID);
  const debugToken = text(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN);
  const tenantEmail = lower(process.env.E2E_TENANT_EMAIL);
  const tenantPassword = text(process.env.E2E_TENANT_PASSWORD);
  if (!apiKey || !appId || !/^[0-9a-f-]{36}$/i.test(debugToken) || !/^\S+@\S+\.\S+$/.test(tenantEmail) || !tenantPassword) {
    fail('protected Tenant Auth and App Check bindings are incomplete');
  }

  const projectId = resolveFirebaseAdminProjectId();
  if (projectId !== PROJECT_ID) fail(`unexpected Firebase project: ${projectId}`);
  initializeFirebaseAdmin(admin, projectId);
  const db = admin.firestore();
  const tenant = await admin.auth().getUserByEmail(tenantEmail);
  const profile = (await db.collection('users').doc(tenant.uid).get()).data() || {};
  const role = lower(tenant.customClaims?.role || tenant.customClaims?.userRole || profile.role || profile.userRole);
  if (tenant.disabled || !tenant.emailVerified || tenant.customClaims?.testAccount !== true || profile.testAccount !== true || role !== 'tenant') {
    fail('protected Tenant identity is not an active, verified, test-only Tenant');
  }
  const ticket = await matchingTestTicket(db, tenant.uid);

  const startedAt = Date.now();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.grantPermissions(['notifications'], { origin: PRODUCTION_URL });
    const page = await context.newPage();
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
    await waitForFreshPushRegistration(db, tenant.uid, startedAt);

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
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : '[prepare-application-evidence] unknown failure');
  process.exitCode = 1;
});
