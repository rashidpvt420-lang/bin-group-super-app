/**
 * business-admin.spec.ts
 * Deep E2E business flow for the dedicated Admin application.
 * Verifies: property onboarding, tenant import, ticket assignment, and payment approval controls.
 */
import { test, expect, Page } from '@playwright/test';
import { installAppCheckDebugToken, assertAppCheckDebugTokenInPage, collectAppCheckFailures } from './helpers/appCheckDebug';
import admin from 'firebase-admin';

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || '').trim().replace(/\/+$/, '');

function requireLaunchCredentials() {
  const missing = [
    !ADMIN_BASE_URL ? 'E2E_ADMIN_BASE_URL' : '',
    !EMAIL ? 'E2E_ADMIN_EMAIL' : '',
    !PASSWORD ? 'E2E_ADMIN_PASSWORD' : '',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')}. Dedicated admin launch validation cannot be skipped.`);
  }
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
  const projectId = process.env.GCP_PROJECT_ID
    || process.env.GCLOUD_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || serviceAccount?.project_id
    || 'bin-group-57c60';

  if (serviceAccount) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId });
  } else {
    admin.initializeApp({ projectId });
  }
}

const adminUrl = (pathname: string) => `${ADMIN_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;

async function waitForLoader(page: Page) {
  await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.goto(adminUrl('/login'), { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(`${ADMIN_BASE_URL}/dashboard`, { timeout: 25_000 });
  await waitForLoader(page);
  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|system interruption/i,
    { timeout: 10_000 },
  );
}

async function requireVisible(page: Page, selectors: string[], label: string) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 2500 }).catch(() => false)) return target;
  }
  const bodyPreview = await page.locator('body').innerText({ timeout: 5000 }).catch(() => 'body unavailable');
  throw new Error(`Missing required admin launch control: ${label}. Selectors: ${selectors.join(' | ')}. Body: ${bodyPreview.slice(0, 1400)}`);
}

async function clickRequired(page: Page, selectors: string[], label: string) {
  const target = await requireVisible(page, selectors, label);
  await expect(target, `${label} must be enabled`).toBeEnabled({ timeout: 10_000 });
  await target.click();
}

test.describe('Admin Business Workflow', () => {
  test.beforeAll(async () => {
    requireLaunchCredentials();
    initializeAdminSdk();
    const db = admin.firestore();

    await db.collection('properties').doc('e2e-test-property').set({
      propertyId: 'e2e-test-property',
      name: 'E2E Test Property',
      propertyName: 'E2E Test Property',
      zone: 'Dubai Marina',
      emirate: 'Dubai',
      status: 'active',
      e2eLaunchSeed: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection('maintenanceTickets').doc('e2e-test-ticket-id').set({
      tenantId: 'e2e-tenant-uid',
      unitNumber: '101',
      category: 'HVAC / AC systems',
      description: 'AC is not cooling, E2E Test Ticket.',
      status: 'OPEN',
      priority: 'HIGH',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      propertyName: 'E2E Test Property',
      propertyId: 'e2e-test-property',
      floorNumber: '1',
      e2eLaunchSeed: true,
    }, { merge: true });

    await db.collection('contracts').doc('e2e-test-contract-id').set({
      paymentId: 'E2E_PAYMENT_ID_TEST',
      amount: 5000,
      currency: 'AED',
      ownerId: 'e2e-owner-uid',
      propertyId: 'e2e-test-property',
      provider: 'Bank Transfer',
      status: 'pending_approval',
      paymentVerified: false,
      e2eLaunchSeed: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  test.afterAll(async () => {
    if (!admin.apps.length) return;
    const db = admin.firestore();
    await db.collection('maintenanceTickets').doc('e2e-test-ticket-id').delete().catch(() => undefined);
    await db.collection('contracts').doc('e2e-test-contract-id').delete().catch(() => undefined);
    await db.collection('properties').doc('e2e-test-property').delete().catch(() => undefined);
  });

  test.beforeEach(async ({ page }) => {
    await installAppCheckDebugToken(page);
    await login(page);
  });

  test('Admin property and tenant import controls are launch-ready', async ({ page }) => {
    await page.goto(adminUrl('/onboard-property'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });
    await expect(page.locator('input, textarea').first(), 'property onboarding must expose editable fields').toBeVisible({ timeout: 15_000 });

    await page.goto(adminUrl('/bulk-import'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });
    await expect(page.locator('input[type="file"]').first(), 'tenant import must expose a file picker').toBeAttached({ timeout: 15_000 });
  });

  test('Admin ticket assignment and contract approval controls are launch-ready', async ({ page }) => {
    await page.goto(adminUrl('/tickets'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });

    await clickRequired(page, [
      '[data-testid="admin-ticket-view"]',
      '[data-testid*="ticket-view" i]',
      'button:has-text("DETAILS")',
      'button:has-text("View")',
      'a:has-text("View")',
    ], 'open ticket');

    const cancelDetails = page.locator('button:has-text("CANCEL"), button:has-text("Close")').first();
    if (await cancelDetails.isVisible({ timeout: 3000 }).catch(() => false)) await cancelDetails.click();

    await clickRequired(page, [
      '[data-testid="admin-assign-technician"]',
      '[data-testid*="assign" i]',
      'button:has-text("ASSIGN")',
      'button:has-text("Assign Technician")',
      'button:has-text("Assign")',
    ], 'assign technician');

    await expect(page.locator('body'), 'assignment must expose assignment controls').toContainText(/MANUAL SPECIALIST ASSIGNMENT|Assign Technician|Technician/i, { timeout: 10_000 });

    const cancelAssignment = page.locator('button:has-text("CANCEL"), button:has-text("Close")').first();
    if (await cancelAssignment.isVisible({ timeout: 3000 }).catch(() => false)) await cancelAssignment.click();

    await page.goto(adminUrl('/manual-approvals'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });

    await clickRequired(page, [
      '[data-testid="admin-approve-contract"]',
      '[data-testid*="approve" i]',
      'button:has-text("Verify Settlement")',
      'button:has-text("Approve Contract")',
      'button:has-text("Approve")',
    ], 'approve contract');
  });
});
