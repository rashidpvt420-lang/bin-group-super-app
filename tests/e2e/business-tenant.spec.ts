/**
 * Authenticated production business proof for the Tenant role.
 *
 * This suite deliberately does not seed a completed ticket. Every reviewable
 * ticket is created by the real Tenant UI, assigned to the protected E2E
 * Technician, completed through the real Technician UI, and then approved or
 * disputed through the real Tenant UI.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { randomBytes } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, Browser, BrowserContext, Locator, Page } from '@playwright/test';
import admin from 'firebase-admin';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env.e2e');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const BASE_URL = (process.env.E2E_BASE_URL || 'https://bin-group-57c60.web.app').replace(/\/+$/, '');
const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL ?? '';
const TENANT_PASSWORD = process.env.E2E_TENANT_PASSWORD ?? '';
const TECHNICIAN_EMAIL = process.env.E2E_TECHNICIAN_EMAIL ?? '';
const TECHNICIAN_PASSWORD = process.env.E2E_TECHNICIAN_PASSWORD ?? '';
const RUN_MARKER = `tenant-cross-role-${Date.now()}-${randomBytes(6).toString('hex')}`;
const RECOVERY_NONCE = randomBytes(12).toString('hex');
const RECOVERY_EMAIL = `e2e.tenant.recovery.${Date.now()}.${RECOVERY_NONCE}@bin-groups.com`;
const RECOVERY_PASSWORD = `${randomBytes(24).toString('base64url')}Aa9!`;
const IMAGE_BUFFER = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581e20000000049454e44ae426082',
  'hex',
);

const createdTicketIds = new Set<string>();
const createdCorrectionValues = new Set<string>();
const createdUnitLinkRequestIds = new Set<string>();
let tenantUid = '';
let technicianUid = '';
let technicianName = 'E2E Technician';
let technicianEmail = '';
let recoveryTenantUid = '';
let recoveryTarget: { propertyId: string; propertyName: string; unitNumber: string } | null = null;

function requireLaunchCredentials() {
  if (!TENANT_EMAIL || !TENANT_PASSWORD || !TECHNICIAN_EMAIL || !TECHNICIAN_PASSWORD) {
    throw new Error(
      'Missing E2E_TENANT_EMAIL/PASSWORD or E2E_TECHNICIAN_EMAIL/PASSWORD. '
      + 'Tenant cross-role launch validation cannot be skipped for public release.',
    );
  }
}

function initializeAdminSdk() {
  if (admin.apps.length) return;
  const projectId = process.env.GCP_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || 'bin-group-57c60';
  admin.initializeApp({ projectId });
}

async function login(page: Page, role: 'tenant' | 'technician', email: string, password: string) {
  await page.context().clearCookies();
  await page.goto(`/login?intendedRole=${role}&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`/login?intendedRole=${role}&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).not.toContainText(
    /CONTINUE AS ADMIN|SOVEREIGN_FAILURE|System Interruption|Minified React error/i,
    { timeout: 10_000 },
  );
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(`**/${role}/dashboard`, { timeout: 30_000 });
  await expect(page.locator('body')).not.toContainText(
    /Network|SOVEREIGN_FAILURE|System Interruption|Minified React error|permission-denied/i,
    { timeout: 10_000 },
  );
}

async function firstVisible(page: Page, selectors: string[], timeout = 20_000): Promise<Locator> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const target = page.locator(selector).first();
      if (await target.isVisible({ timeout: 500 }).catch(() => false)) return target;
    }
    await page.waitForTimeout(300);
  }
  throw new Error(`No visible target found for: ${selectors.join(' | ')}`);
}

async function clickRequired(page: Page, selectors: string[], label: string, enabledTimeout = 15_000) {
  const target = await firstVisible(page, selectors);
  await expect(target, `${label} must be enabled`).toBeEnabled({ timeout: enabledTimeout });
  await target.click();
}

function ticketCoordinates(data: FirebaseFirestore.DocumentData) {
  const source = data.jobLocation || data.propertyLocation || data.geo || data.location || {};
  const latitude = Number(source.lat ?? source.latitude ?? source._latitude);
  const longitude = Number(source.lng ?? source.longitude ?? source._longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`Ticket ${data.ticketId || data.id || 'unknown'} has no valid production property coordinates.`);
  }
  return { latitude, longitude };
}

async function submitRealTenantRequest(page: Page, suffix: string) {
  const description = `${RUN_MARKER} ${suffix}: water leakage with Tenant photo evidence.`;
  await page.goto('/tenant/request', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/tenant\/request/, { timeout: 15_000 });
  await expect(page.locator('body')).not.toContainText(
    /SOVEREIGN_FAILURE|System Interruption|permission-denied|missing or insufficient permissions|no property assigned|RESIDENCE UNASSIGNED/i,
    { timeout: 10_000 },
  );

  const category = page.getByTestId('tenant-request-category').or(page.getByTestId('tenant-request-category-input')).first();
  await expect(category).toBeVisible({ timeout: 30_000 });
  await category.click();
  await page.getByRole('option').first().click();

  const priority = page.getByTestId('tenant-request-priority').or(page.getByTestId('tenant-request-priority-input')).first();
  await expect(priority).toBeVisible({ timeout: 10_000 });
  await priority.click();
  await page.getByRole('option').first().click();
  await page.getByTestId('tenant-request-location').locator('input, textarea').first().fill('Kitchen sink');
  await page.getByTestId('tenant-request-description').locator('input, textarea').first().fill(description);

  const cameraInput = page.locator('input[type="file"][accept*="image"]').first();
  await expect(cameraInput, 'Tenant request must expose an image-capable mobile camera/file input.').toBeAttached();
  await expect(cameraInput).toHaveAttribute('accept', /image\/\*/i);
  await cameraInput.setInputFiles({
    name: `tenant-camera-${suffix}.png`,
    mimeType: 'image/png',
    buffer: IMAGE_BUFFER,
  });

  const submitButton = page.getByTestId('tenant-request-submit');
  await expect(submitButton, 'Tenant request submission must be fully ready before evidence capture.').toBeEnabled({ timeout: 30_000 });
  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  const callableResponsePromise = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().includes('createTenantServiceTicket'),
    { timeout: 60_000 },
  );
  await submitButton.click();
  const callableResponse = await callableResponsePromise;
  const callablePayload = await callableResponse.json().catch(() => ({})) as any;
  if (!callableResponse.ok() || callablePayload?.error) {
    throw new Error(`createTenantServiceTicket failed HTTP ${callableResponse.status()}: ${JSON.stringify(callablePayload)}`);
  }
  const ticketId = String(callablePayload?.result?.ticketId || callablePayload?.data?.ticketId || '').trim();
  expect(ticketId, 'createTenantServiceTicket must return the exact production ticket ID.').toMatch(/^tenant_/);
  await page.waitForURL('**/tenant/tickets', { timeout: 60_000 });
  await page.waitForTimeout(250);
  if (dialogMessage) throw new Error(`Tenant request UI reported an error: ${dialogMessage}`);
  await expect(page.locator('body')).not.toContainText(
    /Failed to submit|Property GPS location is missing|No property assigned|Missing or insufficient permissions/i,
    { timeout: 5_000 },
  );

  const db = admin.firestore();
  await expect.poll(async () => (await db.collection('maintenanceTickets').doc(ticketId).get()).exists, {
    timeout: 40_000,
    message: `Exact callable-created ticket ${ticketId} must exist in production Firestore.`,
  }).toBe(true);

  createdTicketIds.add(ticketId);
  const ticketSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
  const data = ticketSnap.data() || {};
  const tenantPhotos = data.photos || data.beforePhotos || data.tenantPhotos || [];
  expect(Array.isArray(tenantPhotos) && tenantPhotos.length > 0, 'Firestore ticket must retain uploaded Tenant photo URLs.').toBe(true);
  expect(String(tenantPhotos[0] || '')).toMatch(/^https:\/\//);
  expect(String(data.status || '').toUpperCase()).toMatch(/OPEN|PENDING_ASSIGNMENT/);
  return { ticketId, description, data };
}

async function assignToProtectedTechnician(ticketId: string) {
  const db = admin.firestore();
  await db.collection('maintenanceTickets').doc(ticketId).set({
    assignedTechnicianId: technicianUid,
    technicianId: technicianUid,
    technicianName,
    technicianEmail,
    status: 'ASSIGNED',
    dispatchStatus: 'ASSIGNED',
    assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'PROTECTED_E2E_DISPATCH_FIXTURE',
    updatedByRole: 'system',
    e2eRunMarker: RUN_MARKER,
  }, { merge: true });

  await expect.poll(async () => {
    const snap = await db.collection('maintenanceTickets').doc(ticketId).get();
    const data = snap.data() || {};
    return `${data.status}|${data.assignedTechnicianId}`;
  }, { timeout: 30_000 }).toBe(`ASSIGNED|${technicianUid}`);
}

async function completeThroughTechnicianUi(browser: Browser, ticketId: string) {
  const db = admin.firestore();
  const ticketSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
  if (!ticketSnap.exists) throw new Error(`Ticket ${ticketId} disappeared before Technician handoff.`);
  const coordinates = ticketCoordinates({ id: ticketId, ...ticketSnap.data() });
  const context: BrowserContext = await browser.newContext({
    baseURL: BASE_URL,
    geolocation: { longitude: coordinates.longitude, latitude: coordinates.latitude },
    permissions: ['geolocation', 'notifications'],
  });
  const page = await context.newPage();
  const monitor = await attachAuthenticatedAppCheckMonitor(page);
  await monitor.assertTokenFingerprint();

  try {
    await login(page, 'technician', TECHNICIAN_EMAIL, TECHNICIAN_PASSWORD);
    await page.goto(`/technician/job/${ticketId}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/technician/job/${ticketId}`), { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/MISSION REF|Mission Lifecycle/i, { timeout: 25_000 });

    let lifecycleStatus = String((await db.collection('maintenanceTickets').doc(ticketId).get()).data()?.status || '').toUpperCase();
    const acceptMission = page.getByRole('button', { name: /Accept Mission/i }).first();
    if (['ASSIGNED', 'AUTO_ASSIGNED'].includes(lifecycleStatus) && await acceptMission.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(acceptMission).toBeEnabled({ timeout: 15_000 });
      await acceptMission.click();
      await expect.poll(async () => {
        const lifecycleSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
        return String(lifecycleSnap.data()?.status || '').toUpperCase();
      }, { timeout: 40_000, message: 'Technician acceptance must reach production Firestore before the next UI action.' }).toBe('ACCEPTED');
      lifecycleStatus = 'ACCEPTED';
    }

    if (lifecycleStatus === 'ACCEPTED') {
      await clickRequired(page, [
        'button:has-text("On The Way")',
        'button:has-text("Start Trip")',
        'button:has-text("En Route")',
      ], 'Start trip action');
      await expect.poll(async () => {
        const lifecycleSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
        return String(lifecycleSnap.data()?.status || '').toUpperCase();
      }, { timeout: 40_000, message: 'Technician Start Trip must persist canonical ON_THE_WAY in production Firestore.' }).toBe('ON_THE_WAY');
      lifecycleStatus = 'ON_THE_WAY';
    }
    expect(['ON_THE_WAY', 'ARRIVED']).toContain(lifecycleStatus);
    await expect(page.locator('body')).toContainText(/ON THE WAY|EN ROUTE|Status updated/i, { timeout: 20_000 });

    if (lifecycleStatus === 'ON_THE_WAY') {
      await clickRequired(page, [
        'button:has-text("Arrived")',
        'button:has-text("I have arrived")',
        'button:has-text("On Site")',
      ], 'Arrival action', 40_000);
      await expect.poll(async () => {
        const lifecycleSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
        return String(lifecycleSnap.data()?.status || '').toUpperCase();
      }, { timeout: 40_000, message: 'Technician arrival must reach production Firestore before safety evidence is entered.' }).toBe('ARRIVED');
      lifecycleStatus = 'ARRIVED';
    }
    expect(lifecycleStatus).toBe('ARRIVED');
    await expect(page.locator('body')).toContainText(/ARRIVED|PRE-WORK SAFETY PROTOCOL|Status updated/i, { timeout: 25_000 });

    const ppe = page.locator('#ppe');
    const safety = page.locator('#safety');
    await expect(ppe).toBeVisible({ timeout: 10_000 });
    await expect(safety).toBeVisible({ timeout: 10_000 });
    await ppe.check();
    await safety.check();

    await clickRequired(page, ['button:has-text("Start Work")'], 'Start work action');
    await expect(page.locator('body')).toContainText(/IN PROGRESS|Proof readiness|Status updated/i, { timeout: 25_000 });

    const notes = page.getByLabel(/Resolution notes/i).first();
    await expect(notes).toBeVisible({ timeout: 10_000 });
    await notes.fill(`Cross-role completion ${RUN_MARKER}: inspected, repaired, tested, and left operational.`);

    const materials = page.getByLabel(/Materials used|No parts required/i).first();
    await expect(materials).toBeVisible({ timeout: 10_000 });
    await materials.fill('No parts required');

    const completionInput = await firstVisible(page, [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ], 20_000);
    await completionInput.setInputFiles({
      name: `technician-after-${ticketId}.png`,
      mimeType: 'image/png',
      buffer: IMAGE_BUFFER,
    });

    const complete = page.getByRole('button', { name: /Complete Mission & Request Tenant Feedback/i }).first();
    await expect(complete).toBeEnabled({ timeout: 25_000 });
    await complete.click();
    await page.waitForURL('**/technician/jobs', { timeout: 40_000 });
    await expect(page.locator('body')).not.toContainText(/failed|permission-denied|missing or insufficient permissions/i, { timeout: 5_000 });

    await expect.poll(async () => {
      const snap = await db.collection('maintenanceTickets').doc(ticketId).get();
      const data = snap.data() || {};
      return `${String(data.status || '').toUpperCase()}|${data.tenantApprovalStatus}`;
    }, { timeout: 45_000 }).toMatch(/COMPLETED_PENDING_(APPROVAL|TENANT_APPROVAL)\|PENDING_TENANT_REVIEW/i);

    monitor.assertClean(`Technician completion for ${ticketId}`);
    monitor.assertAuthenticatedFirebaseRead(`Technician completion for ${ticketId}`);
  } finally {
    await context.close();
  }
}

async function assertTenantDeliveryReceipt(ticketId: string) {
  const db = admin.firestore();
  let receipt: Record<string, unknown> = {};
  await expect.poll(async () => {
    const ticketSnap = await db.collection('maintenanceTickets').doc(ticketId).get();
    const ticket = ticketSnap.data() || {};
    const notificationId = String(ticket.tenantCompletionNotificationId || '');
    const mailId = String(ticket.tenantCompletionMailId || '');
    if (!notificationId) return false;

    const [notificationSnap, mailSnap] = await Promise.all([
      db.collection('notifications').doc(notificationId).get(),
      mailId ? db.collection('mail').doc(mailId).get() : Promise.resolve(null),
    ]);
    const notification = notificationSnap.data() || {};
    const mail = mailSnap?.data?.() || {};
    const pushDelivered = notification.pushDeliveryState === 'SUCCESS'
      && Number(notification.pushSuccessCount || 0) > 0
      && Number(notification.pushFailureCount || 0) === 0;
    const emailDelivered = mail?.delivery?.state === 'SUCCESS' && Boolean(mail?.delivery?.messageId);
    receipt = {
      ticketId,
      notificationId,
      mailId: mailId || null,
      pushDeliveryState: notification.pushDeliveryState || null,
      pushSuccessCount: notification.pushSuccessCount || 0,
      pushFailureCount: notification.pushFailureCount || 0,
      emailDeliveryState: mail?.delivery?.state || null,
      emailMessageIdPresent: Boolean(mail?.delivery?.messageId),
      emailRecipientSource: mail?.metadata?.recipientSource || null,
    };
    return pushDelivered || emailDelivered;
  }, {
    timeout: 120_000,
    intervals: [1_000, 2_000, 5_000, 10_000],
    message: `Ticket ${ticketId} must produce a successful push or SMTP provider receipt for the Tenant.`,
  }).toBe(true);

  await test.info().attach(`tenant-delivery-receipt-${ticketId}`, {
    body: Buffer.from(JSON.stringify(receipt, null, 2)),
    contentType: 'application/json',
  });
}

async function createAndComplete(browser: Browser, page: Page, suffix: string) {
  const created = await submitRealTenantRequest(page, suffix);
  await assignToProtectedTechnician(created.ticketId);
  await completeThroughTechnicianUi(browser, created.ticketId);
  await assertTenantDeliveryReceipt(created.ticketId);
  return created.ticketId;
}

async function deleteRecoveryTenant(uid: string) {
  if (!uid || !admin.apps.length) return;
  const db = admin.firestore();
  const requests = await db.collection('tenant_unit_link_requests').where('tenantUid', '==', uid).get().catch(() => null);
  if (requests && !requests.empty) {
    const batch = db.batch();
    requests.docs.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit().catch(() => undefined);
  }
  await Promise.all([
    db.collection('users').doc(uid).delete().catch(() => undefined),
    db.collection('tenants').doc(uid).delete().catch(() => undefined),
    admin.auth().deleteUser(uid).catch(() => undefined),
  ]);
}

async function cleanupExpiredRecoveryTenants() {
  const db = admin.firestore();
  const now = Date.now();
  const snapshot = await db.collection('users').where('e2eTenantRecovery', '==', true).limit(25).get();
  for (const docSnap of snapshot.docs) {
    const expiresAtMs = Number(docSnap.data()?.expiresAtMs || 0);
    if (expiresAtMs > 0 && expiresAtMs <= now) {
      await deleteRecoveryTenant(docSnap.id);
    }
  }
}

async function createRecoveryTenant() {
  const account = await admin.auth().createUser({
    email: RECOVERY_EMAIL,
    password: RECOVERY_PASSWORD,
    displayName: 'E2E Unassigned Tenant',
    emailVerified: true,
    disabled: false,
  });
  recoveryTenantUid = account.uid;
  await admin.auth().setCustomUserClaims(account.uid, {
    role: 'tenant',
    userRole: 'tenant',
    primaryRole: 'tenant',
    active: true,
    e2eTenantRecovery: true,
  });

  const profile = {
    uid: account.uid,
    email: RECOVERY_EMAIL.toLowerCase(),
    displayName: 'E2E Unassigned Tenant',
    role: 'tenant',
    userRole: 'tenant',
    primaryRole: 'tenant',
    status: 'active',
    approvalStatus: 'approved',
    emailVerified: true,
    e2eTenantRecovery: true,
    e2eRunMarker: RUN_MARKER,
    expiresAtMs: Date.now() + (30 * 60 * 1000),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  const db = admin.firestore();
  await Promise.all([
    db.collection('users').doc(account.uid).set(profile, { merge: false }),
    db.collection('tenants').doc(account.uid).set(profile, { merge: false }),
  ]);
}

async function cleanupRunData() {
  if (!admin.apps.length) return;
  const db = admin.firestore();

  for (const ticketId of createdTicketIds) {
    const ticketSnap = await db.collection('maintenanceTickets').doc(ticketId).get().catch(() => null);
    const ticket = ticketSnap?.data?.() || {};
    const notificationId = String(ticket.tenantCompletionNotificationId || '');
    const mailId = String(ticket.tenantCompletionMailId || '');
    if (notificationId) await db.collection('notifications').doc(notificationId).delete().catch(() => undefined);
    if (mailId) await db.collection('mail').doc(mailId).delete().catch(() => undefined);
    await db.collection('maintenanceTickets').doc(ticketId).delete().catch(() => undefined);
  }

  for (const value of createdCorrectionValues) {
    const snapshot = await db.collection('tenant_correction_requests').where('requestedValue', '==', value).get().catch(() => null);
    if (snapshot && !snapshot.empty) {
      const batch = db.batch();
      snapshot.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit().catch(() => undefined);
    }
  }

  for (const requestId of createdUnitLinkRequestIds) {
    await db.collection('tenant_unit_link_requests').doc(requestId).delete().catch(() => undefined);
  }
  await deleteRecoveryTenant(recoveryTenantUid);
}

test.describe('Tenant Business Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    requireLaunchCredentials();
    initializeAdminSdk();
    await cleanupExpiredRecoveryTenants();
    const [tenant, technician] = await Promise.all([
      admin.auth().getUserByEmail(TENANT_EMAIL),
      admin.auth().getUserByEmail(TECHNICIAN_EMAIL),
    ]);
    tenantUid = tenant.uid;
    technicianUid = technician.uid;
    technicianName = technician.displayName || 'E2E Technician';
    technicianEmail = technician.email || TECHNICIAN_EMAIL;

    const db = admin.firestore();
    const tenantProfile = await db.collection('users').doc(tenantUid).get();
    const profileUnitId = String(tenantProfile.data()?.unitId || '');
    let unitSnap = profileUnitId ? await db.collection('units').doc(profileUnitId).get() : null;
    if (!unitSnap?.exists) {
      const byUid = await db.collection('units').where('tenantId', '==', tenantUid).limit(1).get();
      unitSnap = byUid.docs[0] || null;
    }
    if (!unitSnap?.exists) {
      const byTenantUid = await db.collection('units').where('tenantUid', '==', tenantUid).limit(1).get();
      unitSnap = byTenantUid.docs[0] || null;
    }
    if (!unitSnap?.exists) {
      const byCurrentTenant = await db.collection('units').where('currentTenantId', '==', tenantUid).limit(1).get();
      unitSnap = byCurrentTenant.docs[0] || null;
    }
    if (!unitSnap?.exists) {
      const byEmail = await db.collection('units').where('tenantEmail', '==', TENANT_EMAIL.toLowerCase()).limit(1).get();
      unitSnap = byEmail.docs[0] || null;
    }
    if (!unitSnap?.exists) throw new Error('Protected Tenant fixture has no linked unit for the recovery request target.');
    const unit = unitSnap.data() || {};
    const linkedTenantId = String(unit.tenantUid || unit.tenantId || unit.currentTenantId || '');
    if (linkedTenantId && linkedTenantId !== tenantUid) {
      throw new Error('Protected Tenant fixture points to a unit assigned to a different Tenant.');
    }
    const propertyId = String(unit.propertyId || '');
    const propertySnap = propertyId ? await db.collection('properties').doc(propertyId).get() : null;
    if (!propertyId || !propertySnap?.exists) throw new Error('Protected Tenant fixture has no linked property for the recovery request target.');
    const normalizedTenantEmail = TENANT_EMAIL.toLowerCase();
    await Promise.all([
      db.collection('users').doc(tenantUid).set({
        unitId: unitSnap.id,
        assignedUnitId: unitSnap.id,
        propertyId,
        tenantEmail: normalizedTenantEmail,
        email: normalizedTenantEmail,
        role: 'tenant',
        userRole: 'tenant',
        primaryRole: 'tenant',
        status: 'active',
        approvalStatus: 'approved',
        suspended: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      db.collection('tenants').doc(tenantUid).set({
        unitId: unitSnap.id,
        assignedUnitId: unitSnap.id,
        propertyId,
        tenantEmail: normalizedTenantEmail,
        email: normalizedTenantEmail,
        role: 'tenant',
        status: 'active',
        approvalStatus: 'approved',
        suspended: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
      db.collection('units').doc(unitSnap.id).set({
        tenantId: tenantUid,
        tenantUid,
        currentTenantId: tenantUid,
        userId: tenantUid,
        authUid: tenantUid,
        tenantEmail: normalizedTenantEmail,
        propertyId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true }),
    ]);
    recoveryTarget = {
      propertyId,
      propertyName: String(propertySnap?.data()?.name || unit.propertyName || 'E2E Live Role Tower'),
      unitNumber: String(unit.unitNumber || unit.number || 'E2E-101'),
    };
    await createRecoveryTenant();
  });

  test.afterAll(async () => {
    await cleanupRunData();
  });

  test.beforeEach(async ({ page }) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = monitor;
    await monitor.assertTokenFingerprint();
    await login(page, 'tenant', TENANT_EMAIL, TENANT_PASSWORD);
  });

  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('Tenant → Technician → Tenant approval closes one uninterrupted real ticket', async ({ browser, page }) => {
    test.setTimeout(360_000);
    const ticketId = await createAndComplete(browser, page, 'approval');

    await page.goto(`/tenant/ticket/${ticketId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/WORK COMPLETED — REVIEW REQUIRED/i)).toBeVisible({ timeout: 30_000 });
    const feedback = page.getByLabel(/Feedback/i);
    await expect(feedback).toBeVisible({ timeout: 10_000 });
    await feedback.fill(`Tenant approved cross-role production proof ${RUN_MARKER}.`);
    const approve = page.getByRole('button', { name: /APPROVE, RATE & CLOSE/i });
    await expect(approve).toBeEnabled({ timeout: 15_000 });
    await approve.click();
    await expect(page.getByText(/SERVICE FINALIZED/i)).toBeVisible({ timeout: 40_000 });

    const db = admin.firestore();
    await expect.poll(async () => {
      const snap = await db.collection('maintenanceTickets').doc(ticketId).get();
      const data = snap.data() || {};
      return `${data.status}|${data.tenantApproved}|${data.tenantApprovalStatus}|${data.finalApproval}`;
    }, { timeout: 40_000 }).toMatch(/CLOSED\|true\|APPROVED\|true/i);
  });

  test('Tenant dispute opens Admin review after real Technician completion', async ({ browser, page }) => {
    test.setTimeout(360_000);
    const ticketId = await createAndComplete(browser, page, 'dispute');

    await page.goto(`/tenant/ticket/${ticketId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/WORK COMPLETED — REVIEW REQUIRED/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /DISPUTE SERVICE/i }).click();
    const reason = page.getByLabel(/Reason for disputing resolution/i);
    await expect(reason).toBeVisible({ timeout: 10_000 });
    const disputeReason = `Leak remains visible after Technician completion ${RUN_MARKER}.`;
    await reason.fill(disputeReason);
    const confirm = page.getByRole('button', { name: /CONFIRM DISPUTE/i });
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await confirm.click();

    const db = admin.firestore();
    await expect.poll(async () => {
      const snap = await db.collection('maintenanceTickets').doc(ticketId).get();
      const data = snap.data() || {};
      return `${data.status}|${data.tenantApprovalStatus}|${data.requiresAdminReview}|${data.adminReviewStatus}|${data.disputeReason}`;
    }, { timeout: 40_000 }).toContain(`DISPUTED|DISPUTED|true|pending|${disputeReason}`);

    await expect.poll(async () => {
      const audit = await db.collection('audit_logs')
        .where('targetId', '==', ticketId)
        .where('action', '==', 'TENANT_DISPUTED_TICKET')
        .limit(1)
        .get();
      return audit.size;
    }, { timeout: 30_000 }).toBe(1);
  });

  test('Tenant correction submission and immutable history are part of the main business suite', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/tenant/profile', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('tenant-correction-panel')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByLabel(/Full Name|الاسم الكامل/i).first()).toBeDisabled();
    await expect(page.getByLabel(/Phone Number|رقم الهاتف/i).first()).toBeDisabled();

    const fieldControl = page.getByTestId('tenant-correction-field');
    await fieldControl.getByRole('combobox').click();
    await page.getByRole('option', { name: /Emergency contact name|اسم جهة اتصال الطوارئ/i }).click();
    const requestedValue = `E2E Correction ${RUN_MARKER}`;
    const reason = `Main Tenant business correction evidence ${RUN_MARKER}`;
    createdCorrectionValues.add(requestedValue);
    await page.getByTestId('tenant-correction-value').getByRole('textbox').fill(requestedValue);
    await page.getByTestId('tenant-correction-reason').getByRole('textbox').fill(reason);
    await page.getByTestId('tenant-correction-submit').click();
    await expect(page.getByTestId('tenant-correction-success')).toContainText(/submitted|تم إرسال/i, { timeout: 30_000 });
    const history = page.getByTestId('tenant-correction-history');
    const requestCard = history.locator('[data-testid^="tenant-correction-request-"]').filter({ hasText: requestedValue }).first();
    await expect(requestCard).toBeVisible({ timeout: 25_000 });
    await expect(requestCard.getByTestId('tenant-correction-status')).toContainText(/PENDING ADMIN REVIEW/i);
    await expect(requestCard.getByTestId('tenant-correction-events')).toContainText(/SUBMITTED/i);
  });

  test('Unassigned-residence fallback creates a secured unit-link recovery request without mutating an occupied unit', async ({ page }) => {
    test.setTimeout(150_000);
    if (!recoveryTarget || !recoveryTenantUid) throw new Error('Temporary unassigned Tenant fixture was not prepared.');
    const db = admin.firestore();
    const notes = `Unassigned residence recovery ${RUN_MARKER}`;

    await login(page, 'tenant', RECOVERY_EMAIL, RECOVERY_PASSWORD);
    await page.goto(`/tenant/request?recovery=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    const fallback = page.getByTestId('tenant-unit-link-fallback');
    await expect(fallback).toBeVisible({ timeout: 35_000 });
    await page.getByTestId('tenant-unit-link-property').fill(recoveryTarget.propertyName);
    await page.getByTestId('tenant-unit-link-unit').fill(recoveryTarget.unitNumber);
    await page.getByTestId('tenant-unit-link-lease').fill(`LEASE-${RUN_MARKER}`);
    await page.getByTestId('tenant-unit-link-code').fill(`VERIFY-${RUN_MARKER}`);
    await page.getByTestId('tenant-unit-link-notes').fill(notes);
    await page.getByTestId('tenant-unit-link-submit').click();
    await expect(page.getByTestId('tenant-unit-link-notice')).toContainText(/submitted for admin verification/i, { timeout: 35_000 });

    let requestId = '';
    await expect.poll(async () => {
      const snapshot = await db.collection('tenant_unit_link_requests').where('tenantUid', '==', recoveryTenantUid).get();
      const requestDoc = snapshot.docs.find((docSnap) => docSnap.data()?.notes === notes);
      requestId = requestDoc?.id || '';
      return requestId;
    }, { timeout: 35_000 }).not.toBe('');
    createdUnitLinkRequestIds.add(requestId);

    const requestSnap = await db.collection('tenant_unit_link_requests').doc(requestId).get();
    const requestData = requestSnap.data() || {};
    expect(requestData.status).toBe('PENDING_ADMIN_REVIEW');
    expect(requestData.verificationState).toBe('ADMIN_OR_OWNER_VERIFICATION_REQUIRED');
    expect(requestData.verificationCodeHash).toMatch(/^[a-f0-9]{64}$/i);
    expect(requestData.verificationCode).toBeUndefined();

    const occupiedUnit = await db.collection('units')
      .where('propertyId', '==', recoveryTarget.propertyId)
      .where('unitNumber', '==', recoveryTarget.unitNumber)
      .limit(1)
      .get();
    expect(occupiedUnit.size).toBe(1);
    const occupiedData = occupiedUnit.docs[0].data() || {};
    expect(String(occupiedData.tenantUid || occupiedData.tenantId || occupiedData.currentTenantId)).toBe(tenantUid);
  });
});
