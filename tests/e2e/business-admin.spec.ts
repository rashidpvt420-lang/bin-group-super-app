/**
 * Authenticated production business proof for the dedicated Admin application.
 * The settlement test must execute the callable and verify Firestore state.
 */
import { test, expect, Page } from '@playwright/test';
import admin from 'firebase-admin';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || '').trim().replace(/\/+$/, '');
const PROPERTY_ID = 'e2e-test-property';
const TICKET_ID = 'e2e-test-ticket-id';
const CONTRACT_ID = 'e2e-test-contract-id';
const PAYMENT_ID = 'E2E_PAYMENT_ID_TEST';
const OWNER_UID = 'e2e-owner-uid';

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
  if (serviceAccount) admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId });
  else admin.initializeApp({ projectId });
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
    const now = admin.firestore.FieldValue.serverTimestamp();

    await db.collection('properties').doc(PROPERTY_ID).set({
      propertyId: PROPERTY_ID,
      name: 'E2E Test Property',
      propertyName: 'E2E Test Property',
      zone: 'Dubai Marina',
      emirate: 'Dubai',
      status: 'active',
      e2eLaunchSeed: true,
      updatedAt: now,
    }, { merge: true });

    await db.collection('maintenanceTickets').doc(TICKET_ID).set({
      tenantId: 'e2e-tenant-uid',
      unitNumber: '101',
      category: 'HVAC / AC systems',
      description: 'AC is not cooling, E2E Test Ticket.',
      status: 'OPEN',
      priority: 'HIGH',
      createdAt: now,
      propertyName: 'E2E Test Property',
      propertyId: PROPERTY_ID,
      floorNumber: '1',
      e2eLaunchSeed: true,
    }, { merge: false });

    await db.collection('contracts').doc(CONTRACT_ID).set({
      paymentId: PAYMENT_ID,
      amount: 5000,
      currency: 'AED',
      ownerId: OWNER_UID,
      propertyId: PROPERTY_ID,
      provider: 'Bank Transfer',
      status: 'pending_approval',
      paymentVerified: false,
      dashboardUnlockApproved: false,
      e2eLaunchSeed: true,
      createdAt: now,
      updatedAt: now,
    }, { merge: false });

    await db.collection('payment_transactions').doc(PAYMENT_ID).set({
      paymentId: PAYMENT_ID,
      contractId: CONTRACT_ID,
      ownerUid: OWNER_UID,
      propertyId: PROPERTY_ID,
      amount: 5000,
      activationDeposit: 5000,
      currency: 'AED',
      paymentMethod: 'Bank Transfer',
      status: 'PENDING_APPROVAL',
      verificationState: 'PENDING_ADMIN',
      e2eLaunchSeed: true,
      createdAt: now,
      updatedAt: now,
    }, { merge: false });
  });

  test.afterAll(async () => {
    if (!admin.apps.length) return;
    const db = admin.firestore();
    await Promise.all([
      db.collection('maintenanceTickets').doc(TICKET_ID).delete().catch(() => undefined),
      db.collection('payment_transactions').doc(PAYMENT_ID).delete().catch(() => undefined),
      db.collection('contracts').doc(CONTRACT_ID).delete().catch(() => undefined),
      db.collection('properties').doc(PROPERTY_ID).delete().catch(() => undefined),
      db.collection('users').doc(OWNER_UID).delete().catch(() => undefined),
      db.collection('owners').doc(OWNER_UID).delete().catch(() => undefined),
    ]);
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

  test('Admin executes settlement approval and Firestore activation', async ({ page }) => {
    test.setTimeout(120_000);
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

    await page.goto(adminUrl('/manual-approvals'), { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    const paymentRow = page.getByRole('row').filter({ hasText: PAYMENT_ID }).first();
    await expect(paymentRow, 'seeded payment must appear in the admin settlement queue').toBeVisible({ timeout: 25_000 });
    const verifyButton = paymentRow.getByRole('button', { name: /Verify Settlement|Approve Contract|Approve/i }).first();
    await expect(verifyButton).toBeEnabled({ timeout: 10_000 });
    await verifyButton.click();

    const referenceInput = page.getByPlaceholder(/UTN-|reference/i).first();
    await expect(referenceInput).toBeVisible({ timeout: 10_000 });
    await referenceInput.fill(`E2E-UTN-${Date.now()}`);

    let alertMessage = '';
    page.once('dialog', async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    const confirm = page.getByRole('button', { name: /Confirm.*Activate|Confirm Settlement|Activate/i }).last();
    await expect(confirm).toBeEnabled({ timeout: 10_000 });
    await confirm.click();

    const db = admin.firestore();
    await expect.poll(async () => {
      const [contractSnap, paymentSnap] = await Promise.all([
        db.collection('contracts').doc(CONTRACT_ID).get(),
        db.collection('payment_transactions').doc(PAYMENT_ID).get(),
      ]);
      const contract = contractSnap.data() || {};
      const payment = paymentSnap.data() || {};
      return `${contract.status}|${contract.paymentVerified}|${contract.dashboardUnlockApproved}|${payment.status}|${payment.verificationState}`;
    }, { timeout: 45_000 }).toMatch(/ACTIVE\|true\|true\|APPROVED\|ADMIN_VERIFIED/i);

    expect(alertMessage).not.toMatch(/failed|error|not found|permission/i);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 5_000 });
  });
});
