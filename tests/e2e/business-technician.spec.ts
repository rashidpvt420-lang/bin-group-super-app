/**
 * Authenticated production business proof for the Technician role.
 * Proves a dispatch-bound assignment, push delivery receipt, GPS controls,
 * technician-owned before-work evidence, real network recovery during proof
 * upload, completion, and automatic offline lifecycle replay.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, Page, Locator } from '@playwright/test';
import admin from 'firebase-admin';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env.e2e');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const EMAIL = process.env.E2E_TECHNICIAN_EMAIL ?? '';
const PASSWORD = process.env.E2E_TECHNICIAN_PASSWORD ?? '';
const proofImage = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581e20000000049454e44ae426082',
  'hex',
);

let technicianUid = '';
let dispatchTicketId = '';
let gpsDeniedTicketId = '';
let gpsPoorTicketId = '';
let offlineTicketId = '';
const CURRENT_PUSH_TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const EVIDENCE_RUN_KEY = `${process.env.GITHUB_RUN_ID || Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || '1'}`
  .toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 40);

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_TECHNICIAN_EMAIL/PASSWORD. Technician launch validation cannot be skipped for public release.');
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

function fixtureTicket(id: string, status: string, assigned: boolean) {
  const now = admin.firestore.Timestamp.now();
  return {
    id,
    ticketId: id,
    propertyId: 'e2e-live-role-property',
    propertyName: 'E2E Live Role Tower',
    unitId: `e2e-live-role-unit-${technicianUid.slice(0, 40)}`,
    unitNumber: 'TECH-201',
    tenantId: 'e2e-live-tenant-fixture',
    tenantName: 'E2E Resident',
    category: 'HVAC / AC systems',
    description: `Protected Technician evidence fixture ${id}`,
    priority: 'normal',
    source: 'PROTECTED_TECHNICIAN_E2E',
    status,
    dispatchStatus: assigned ? 'ASSIGNED' : 'PENDING_ASSIGNMENT',
    assignedTechnicianId: assigned ? technicianUid : null,
    technicianId: assigned ? technicianUid : null,
    assignedAt: assigned ? now : null,
    assignmentSource: assigned ? 'PROTECTED_E2E_PREP' : null,
    beforePhotoUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrC8AAAAASUVORK5CYII=',
    beforePhotos: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrC8AAAAASUVORK5CYII='],
    tenantPhotos: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrC8AAAAASUVORK5CYII='],
    evidenceStatus: 'TENANT_EVIDENCE_UPLOADED',
    propertyLocation: { latitude: 25.2048, longitude: 55.2708, address: 'Dubai, UAE' },
    serviceLocationDetail: 'Utility room beside unit entrance',
    accessNotes: 'Call resident before entry.',
    createdAt: now,
    updatedAt: now,
  };
}

async function clearAssignmentNotifications(ticketId: string) {
  const db = admin.firestore();
  const snap = await db.collection('notifications').where('ticketId', '==', ticketId).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((docSnap) => batch.delete(docSnap.ref));
  await batch.commit();
}

function timestampMillis(value: any) {
  if (value && typeof value.toMillis === 'function') return value.toMillis();
  if (Number.isFinite(value?.seconds)) return Number(value.seconds) * 1000;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function hasCurrentProductionPushToken(userId: string, notOlderThanMs: number) {
  const db = admin.firestore();
  const [userSnap, tokenSnap] = await Promise.all([
    db.collection('users').doc(userId).get(),
    db.collection('users').doc(userId).collection('fcmTokens').get(),
  ]);
  const user = userSnap.data() || {};
  const latestTokenMs = tokenSnap.docs.reduce((latest, docSnap) => {
    const data = docSnap.data() || {};
    return Math.max(latest, timestampMillis(data.lastRegisteredAt || data.updatedAt || data.createdAt));
  }, 0);
  const summaryMs = timestampMillis(user.pushUpdatedAt);
  return {
    ready: Number(user.pushTokenCount || 0) > 0 && tokenSnap.size > 0 && Math.max(latestTokenMs, summaryMs) >= notOlderThanMs,
    summaryCount: Number(user.pushTokenCount || 0),
    tokenDocumentCount: tokenSnap.size,
    latestTokenMs,
    summaryMs,
  };
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.context().clearCookies();
  await page.goto(`/login?intendedRole=technician&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`/login?intendedRole=technician&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/technician/dashboard', { timeout: 25_000 });
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error|identity fault/i, { timeout: 10_000 });
}

async function clickRequired(page: Page, selectors: string[], label: string, enabledTimeout = 10_000): Promise<Locator> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const target = page.locator(selector).first();
      if (await target.isVisible({ timeout: 500 }).catch(() => false)) {
        await expect(target, `${label} must be enabled`).toBeEnabled({ timeout: enabledTimeout });
        await target.click();
        return target;
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error(`${label} was not visible. Selectors: ${selectors.join(' | ')}`);
}

async function setImage(input: Locator, name: string) {
  await input.setInputFiles({ name, mimeType: 'image/png', buffer: proofImage });
}

async function firestoreStatus(ticketId: string) {
  const snap = await admin.firestore().collection('maintenanceTickets').doc(ticketId).get();
  return String(snap.data()?.status || '').toUpperCase();
}

test.describe('Technician Business Workflow', () => {
  test.describe.configure({ mode: 'serial' });
  test.use({
    geolocation: { longitude: 55.2708, latitude: 25.2048, accuracy: 15 },
    permissions: ['geolocation', 'notifications'],
  });

  test.beforeAll(async () => {
    requireLaunchCredentials();
    initializeAdminSdk();
    const technician = await admin.auth().getUserByEmail(EMAIL);
    technicianUid = technician.uid;
    const suffix = technicianUid.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 48);
    dispatchTicketId = `e2e-tech-dispatch-${EVIDENCE_RUN_KEY}-${suffix}`;
    gpsDeniedTicketId = `e2e-tech-gps-denied-${EVIDENCE_RUN_KEY}-${suffix}`;
    gpsPoorTicketId = `e2e-tech-gps-poor-${EVIDENCE_RUN_KEY}-${suffix}`;
    offlineTicketId = `e2e-tech-offline-${EVIDENCE_RUN_KEY}-${suffix}`;

    const db = admin.firestore();
    const readiness = {
      role: 'technician',
      status: 'active',
      approvalStatus: 'approved',
      suspended: false,
      onDuty: true,
      dutyStatus: 'on_duty',
      isAvailable: true,
      available: true,
      currentShiftId: 'protected-e2e-shift',
      shiftStatus: 'active',
      deviceRegistered: true,
      deviceVerified: true,
      registeredDeviceId: 'protected-e2e-browser',
      medicalCardStatus: 'valid',
      drivingLicenseStatus: 'valid',
      certificationsStatus: 'valid',
      lastGpsAt: admin.firestore.Timestamp.now(),
      gpsMaxAgeMs: 60 * 60 * 1000,
      activeJobCount: 0,
      maxConcurrentJobs: 10,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await Promise.all([
      admin.auth().updateUser(technicianUid, { emailVerified: true, disabled: false }),
      db.collection('users').doc(technicianUid).set(readiness, { merge: true }),
      db.collection('technicians').doc(technicianUid).set(readiness, { merge: true }),
      db.collection('maintenanceTickets').doc(dispatchTicketId).set(fixtureTicket(dispatchTicketId, 'PENDING_ASSIGNMENT', false)),
      db.collection('maintenanceTickets').doc(gpsDeniedTicketId).set(fixtureTicket(gpsDeniedTicketId, 'ON_THE_WAY', true)),
      db.collection('maintenanceTickets').doc(gpsPoorTicketId).set(fixtureTicket(gpsPoorTicketId, 'ON_THE_WAY', true)),
      db.collection('maintenanceTickets').doc(offlineTicketId).set(fixtureTicket(offlineTicketId, 'ACCEPTED', true)),
    ]);
    await clearAssignmentNotifications(dispatchTicketId);
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

  test('dispatch assigns the job, records an explicit push state, and technician completes through network recovery', async ({ page, context }) => {
    test.setTimeout(240_000);
    const db = admin.firestore();
    const pushRegistrationStartedAt = Date.now();

    await page.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('technician-jobs-load-error')).not.toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('technician-dispatch-boundary')).toBeVisible();
    await expect(page.locator(`[data-testid="technician-open-job-card"][data-ticket-id="${dispatchTicketId}"]`)).toHaveCount(0);
    await expect(page.getByText(/OPEN JOB POOL|CLAIM MISSION|ACCEPT JOB/i)).toHaveCount(0);

    const tokenFreshnessFloor = Math.min(pushRegistrationStartedAt - 5_000, Date.now() - CURRENT_PUSH_TOKEN_MAX_AGE_MS);
    const pushDeadline = Date.now() + 20_000;
    let pushReadiness = await hasCurrentProductionPushToken(technicianUid, tokenFreshnessFloor);
    while (!pushReadiness.ready && Date.now() < pushDeadline) {
      await page.waitForTimeout(1_000);
      pushReadiness = await hasCurrentProductionPushToken(technicianUid, tokenFreshnessFloor);
    }
    const registeredPushReady = pushReadiness.ready;
    console.log('[business-technician] production push readiness', { registeredPushReady, ...pushReadiness });

    await db.collection('maintenanceTickets').doc(dispatchTicketId).set({
      assignedTechnicianId: technicianUid,
      technicianId: technicianUid,
      status: 'ASSIGNED',
      dispatchStatus: 'ASSIGNED',
      assignedAt: admin.firestore.FieldValue.serverTimestamp(),
      assignmentSource: 'PROTECTED_E2E_DISPATCH',
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const openCard = page.locator(`[data-testid="technician-open-job-card"][data-ticket-id="${dispatchTicketId}"]`);
    await expect(openCard).toBeVisible({ timeout: 35_000 });
    const receipt = page.locator(`[data-testid="technician-job-notification-receipt"][data-ticket-id="${dispatchTicketId}"]`);
    await expect(receipt).toHaveAttribute(
      'data-delivery-state',
      registeredPushReady ? /SUCCESS|PARTIAL/ : /NO_REGISTERED_TOKEN/,
      { timeout: 60_000 },
    );
    const notificationSnapshot = await db.collection('notifications').where('recipientId', '==', technicianUid).get();
    const deliveryReceipt = notificationSnapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() } as Record<string, any>))
      .find((value) => value.ticketId === dispatchTicketId && value.type === 'TECHNICIAN_JOB_ASSIGNED');
    expect(deliveryReceipt, 'Server assignment receipt must exist for the exact Technician ticket.').toBeTruthy();
    if (registeredPushReady) {
      expect(String(deliveryReceipt?.pushDeliveryState || '')).toMatch(/SUCCESS|PARTIAL/);
      expect(Number(deliveryReceipt?.pushSuccessCount || 0)).toBeGreaterThan(0);
    } else {
      expect(deliveryReceipt).toMatchObject({
        pushDeliveryState: 'NO_REGISTERED_TOKEN',
        pushTokenCount: 0,
        pushSuccessCount: 0,
        pushFailureCount: 0,
      });
    }
    await openCard.click();
    await page.waitForURL(`**/technician/job/${dispatchTicketId}`, { timeout: 20_000 });

    let lifecycleStatus = await firestoreStatus(dispatchTicketId);
    if (['ASSIGNED', 'AUTO_ASSIGNED'].includes(lifecycleStatus)) {
      const acceptMission = page.getByRole('button', { name: /Accept Mission/i }).first();
      await expect(acceptMission).toBeEnabled({ timeout: 15_000 });
      await acceptMission.click();
      await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 30_000 }).toBe('ACCEPTED');
      lifecycleStatus = 'ACCEPTED';
    } else if (lifecycleStatus === 'ACCEPTED') {
      const acceptedSnap = await db.collection('maintenanceTickets').doc(dispatchTicketId).get();
      const accepted = acceptedSnap.data() || {};
      expect(String(accepted.assignedTechnicianId || accepted.technicianId || '')).toBe(technicianUid);
      expect(accepted.acceptedAt, 'An already-accepted mission must retain server acceptance evidence.').toBeTruthy();
    }

    if (lifecycleStatus === 'ACCEPTED') {
      await clickRequired(page, ['button:has-text("On The Way")'], 'Start trip action');
      await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 35_000 }).toBe('ON_THE_WAY');
      lifecycleStatus = 'ON_THE_WAY';
    }
    if (lifecycleStatus === 'ON_THE_WAY') {
      await clickRequired(page, ['button:has-text("Arrived")'], 'Arrival action', 35_000);
      await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 35_000 }).toBe('ARRIVED');
      lifecycleStatus = 'ARRIVED';
    }
    expect(lifecycleStatus).toBe('ARRIVED');

    const beforeInput = page.getByTestId('technician-before-work-file');
    await expect(beforeInput).toHaveCount(1);
    await setImage(beforeInput, 'technician-before-work.png');
    await expect(page.getByTestId('technician-before-work-success')).toBeVisible({ timeout: 45_000 });

    await page.locator('#ppe').check();
    await page.locator('#safety').check();
    await clickRequired(page, ['button:has-text("Start Work")'], 'Start work action');
    await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 35_000 }).toBe('IN_PROGRESS');

    await page.getByLabel(/Resolution notes/i).first().fill('E2E completion proof: issue inspected, repaired, tested, and verified operational.');
    await page.getByLabel(/Materials used|No parts required/i).first().fill('No parts required');

    const afterInput = page.locator('input[type="file"][accept*="image"]').last();
    await context.setOffline(true);
    await expect(page.locator('body')).toContainText(/Offline mode/i, { timeout: 15_000 });
    await setImage(afterInput, 'network-recovery-after-work-proof.png');
    await page.waitForTimeout(1_000);
    await context.setOffline(false);

    const complete = page.getByRole('button', { name: /Complete Mission & Request Tenant Feedback/i }).first();
    await expect(complete).toBeEnabled({ timeout: 60_000 });
    await complete.click();

    await page.waitForURL('**/technician/jobs', { timeout: 60_000 });
    await expect.poll(() => firestoreStatus(dispatchTicketId), { timeout: 35_000 }).toMatch(/COMPLETED/);
  });

  test('location permission denial keeps arrival fail-closed', async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.clearPermissions();
    await page.goto(`/technician/job/${gpsDeniedTicketId}`, { waitUntil: 'domcontentloaded' });
    await clickRequired(page, ['button:has-text("Arrived")'], 'Denied GPS arrival action', 20_000);
    await expect(page.locator('body')).toContainText(/GPS permission is required|Arrival was not recorded/i, { timeout: 25_000 });
    await expect.poll(() => firestoreStatus(gpsDeniedTicketId), { timeout: 15_000 }).toBe('ON_THE_WAY');
  });

  test('poor GPS accuracy keeps arrival fail-closed', async ({ page, context }) => {
    test.setTimeout(90_000);
    await context.setGeolocation({ longitude: 55.2708, latitude: 25.2048, accuracy: 250 });
    await page.goto(`/technician/job/${gpsPoorTicketId}`, { waitUntil: 'domcontentloaded' });
    await clickRequired(page, ['button:has-text("Arrived")'], 'Poor accuracy arrival action', 20_000);
    await expect(page.locator('body')).toContainText(/GPS signal is too weak|Move to an open area/i, { timeout: 25_000 });
    await expect.poll(() => firestoreStatus(gpsPoorTicketId), { timeout: 15_000 }).toBe('ON_THE_WAY');
  });

  test('offline EN_ROUTE action automatically replays after connectivity returns', async ({ page, context }) => {
    test.setTimeout(120_000);
    await page.goto(`/technician/job/${offlineTicketId}`, { waitUntil: 'domcontentloaded' });
    await context.setOffline(true);
    await expect(page.locator('body')).toContainText(/Offline mode/i, { timeout: 15_000 });
    await clickRequired(page, ['button:has-text("On The Way")'], 'Offline start trip action');
    await expect.poll(async () => page.evaluate(() => {
      const queue = JSON.parse(localStorage.getItem('bin_offline_queue') || '[]');
      return queue.some((item: any) => String(item.payload || '').includes('EN_ROUTE'));
    }), { timeout: 15_000 }).toBe(true);

    await context.setOffline(false);
    await expect.poll(() => firestoreStatus(offlineTicketId), { timeout: 45_000 }).toBe('ON_THE_WAY');
    await expect.poll(async () => page.evaluate(() => {
      const queue = JSON.parse(localStorage.getItem('bin_offline_queue') || '[]');
      return queue.some((item: any) => String(item.payload || '').includes('EN_ROUTE'));
    }), { timeout: 20_000 }).toBe(false);
  });
});
