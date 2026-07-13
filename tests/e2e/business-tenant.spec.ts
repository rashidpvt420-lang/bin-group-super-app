/**
 * Authenticated production business proof for the Tenant role.
 * Verifies a real Storage-backed request and mandatory tenant closure approval.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, Page } from '@playwright/test';
import admin from 'firebase-admin';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env.e2e');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const EMAIL = process.env.E2E_TENANT_EMAIL ?? '';
const PASSWORD = process.env.E2E_TENANT_PASSWORD ?? '';
const APPROVAL_TICKET_ID = 'e2e-tenant-approval-ticket';
const REQUEST_DESCRIPTION = 'E2E water leakage production request with photo evidence.';
const proofImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZrC8AAAAASUVORK5CYII=';

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_TENANT_EMAIL/PASSWORD. Tenant launch validation cannot be skipped for public release.');
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

async function login(page: Page) {
  requireLaunchCredentials();
  await page.context().clearCookies();
  await page.goto(`/login?intendedRole=tenant&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`/login?intendedRole=tenant&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).not.toContainText(/CONTINUE AS ADMIN|SOVEREIGN_FAILURE|System Interruption/i, { timeout: 10_000 });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/tenant/dashboard', { timeout: 25_000 });
  await expect(page.locator('body')).not.toContainText(
    /Network|SOVEREIGN_FAILURE|System Interruption|Minified React error|permission-denied/i,
    { timeout: 10_000 },
  );
}

test.describe('Tenant Business Workflow', () => {
  test.beforeAll(async () => {
    requireLaunchCredentials();
    initializeAdminSdk();
    const tenant = await admin.auth().getUserByEmail(EMAIL);
    const db = admin.firestore();
    await db.collection('maintenanceTickets').doc(APPROVAL_TICKET_ID).set({
      id: APPROVAL_TICKET_ID,
      ticketId: APPROVAL_TICKET_ID,
      propertyId: 'e2e-live-role-property',
      propertyName: 'E2E Live Role Tower',
      unitId: `e2e-live-role-unit-${tenant.uid.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80)}`,
      unitNumber: 'E2E-101',
      tenantId: tenant.uid,
      tenantUid: tenant.uid,
      tenantEmail: EMAIL.toLowerCase(),
      category: 'HVAC / AC systems',
      description: 'E2E completed work requiring mandatory tenant approval.',
      status: 'COMPLETED_PENDING_TENANT_APPROVAL',
      tenantApproved: false,
      tenantApprovalStatus: 'PENDING',
      beforePhotoUrl: proofImage,
      afterPhotoUrl: proofImage,
      beforePhotos: [proofImage],
      afterPhotos: [proofImage],
      technicianNotes: 'Production E2E repair completed and verified.',
      e2eLaunchSeed: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: false });
  });

  test.afterAll(async () => {
    if (!admin.apps.length) return;
    const db = admin.firestore();
    await db.collection('maintenanceTickets').doc(APPROVAL_TICKET_ID).delete().catch(() => undefined);
    const created = await db.collection('maintenanceTickets').where('description', '==', REQUEST_DESCRIPTION).get().catch(() => null);
    if (created) {
      const batch = db.batch();
      created.docs.forEach((docSnap) => batch.delete(docSnap.ref));
      await batch.commit().catch(() => undefined);
    }
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

  test('Tenant creates a real service request with uploaded photo evidence', async ({ page }) => {
    test.setTimeout(120_000);
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
    await page.getByTestId('tenant-request-description').locator('input, textarea').first().fill(REQUEST_DESCRIPTION);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'tenant-request-evidence.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581e20000000049454e44ae426082',
        'hex',
      ),
    });

    await page.getByTestId('tenant-request-submit').click();
    await Promise.race([
      page.waitForURL('**/tenant/tickets', { timeout: 30_000 }),
      expect(page.locator('body')).toContainText(/success|created|submitted|ticket|request/i, { timeout: 30_000 }),
    ]);
    await expect(page.locator('body')).not.toContainText(
      /Failed to submit|Property GPS location is missing|No property assigned|Missing or insufficient permissions/i,
      { timeout: 5_000 },
    );

    const db = admin.firestore();
    await expect.poll(async () => {
      const result = await db.collection('maintenanceTickets').where('description', '==', REQUEST_DESCRIPTION).get();
      return result.size;
    }, { timeout: 30_000 }).toBeGreaterThan(0);
  });

  test('Tenant approves completed work and the backend closes the ticket', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/tenant/ticket/${APPROVAL_TICKET_ID}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(new RegExp(`/tenant/ticket/${APPROVAL_TICKET_ID}`), { timeout: 15_000 });
    await expect(page.getByText(/WORK COMPLETED — REVIEW REQUIRED/i)).toBeVisible({ timeout: 25_000 });

    const feedback = page.getByLabel(/Feedback/i);
    await expect(feedback).toBeVisible({ timeout: 10_000 });
    await feedback.fill('E2E tenant verified the completed maintenance service.');

    const approve = page.getByRole('button', { name: /APPROVE, RATE & CLOSE/i });
    await expect(approve).toBeVisible({ timeout: 10_000 });
    await expect(approve).toBeEnabled({ timeout: 10_000 });
    await approve.click();

    await expect(page.getByText(/SERVICE FINALIZED/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('body')).not.toContainText(/Could not submit approval|permission-denied/i, { timeout: 5_000 });

    const db = admin.firestore();
    await expect.poll(async () => {
      const snap = await db.collection('maintenanceTickets').doc(APPROVAL_TICKET_ID).get();
      const data = snap.data() || {};
      return `${data.status}|${data.tenantApproved}|${data.tenantApprovalStatus}`;
    }, { timeout: 30_000 }).toMatch(/CLOSED\|true\|APPROVED/i);
  });
});
