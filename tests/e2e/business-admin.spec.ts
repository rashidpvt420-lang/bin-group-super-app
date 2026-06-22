/**
 * business-admin.spec.ts
 * Deep E2E business flow for the Admin role.
 * Verifies: property, tenant import, ticket assignment, and contract approval controls are present and executable.
 */
import { test, expect, Page } from '@playwright/test';
import admin from 'firebase-admin';

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_ADMIN_EMAIL/PASSWORD. Admin launch validation cannot be skipped for public release.');
  }
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await waitForLoader(page);
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error|system interruption/i, { timeout: 10000 });
}

async function waitForLoader(page: Page) {
  await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

async function requireVisible(page: Page, selectors: string[], label: string) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 2000 }).catch(() => false)) return target;
  }
  const bodyPreview = await page.locator('body').innerText({ timeout: 5000 }).catch(() => 'body unavailable');
  throw new Error(`Missing required admin launch control: ${label}. Selectors: ${selectors.join(' | ')}. Body: ${bodyPreview.slice(0, 1200)}`);
}

async function clickRequired(page: Page, selectors: string[], label: string) {
  const target = await requireVisible(page, selectors, label);
  await expect(target, `${label} must be enabled`).toBeEnabled({ timeout: 10000 });
  await target.click();
}

test.describe('Admin Business Workflow', () => {
  test.beforeAll(async () => {
    if (!admin.apps.length) {
      admin.initializeApp();
    }
    const db = admin.firestore();
    
    // Seed E2E property & unit first if not exists
    await db.collection('properties').doc('e2e-test-property').set({
      propertyId: 'e2e-test-property',
      name: 'E2E Test Property',
      propertyName: 'E2E Test Property',
      zone: 'Dubai Marina',
      emirate: 'Dubai',
      status: 'active'
    });

    // Seed E2E Ticket
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
      floorNumber: '1'
    });

    // Seed E2E Contract awaiting approval
    await db.collection('contracts').doc('e2e-test-contract-id').set({
      paymentId: 'E2E_PAYMENT_ID_TEST',
      amount: 5000,
      currency: 'AED',
      ownerId: 'e2e-owner-uid',
      propertyId: 'e2e-test-property',
      provider: 'Bank Transfer',
      status: 'pending_approval',
      paymentVerified: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  });

  test.afterAll(async () => {
    const db = admin.firestore();
    await db.collection('maintenanceTickets').doc('e2e-test-ticket-id').delete().catch(() => {});
    await db.collection('contracts').doc('e2e-test-contract-id').delete().catch(() => {});
    await db.collection('properties').doc('e2e-test-property').delete().catch(() => {});
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Admin property and tenant import controls are launch-ready', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="admin-add-property"]',
      '[data-testid*="add-property" i]',
      'button:has-text("Add Property")',
      'button:has-text("Create Property")',
    ], 'add property');

    await waitForLoader(page);
    await expect(page.locator('input, textarea').first(), 'property form must expose editable fields').toBeVisible({ timeout: 10000 });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="admin-bulk-upload-tenants"]',
      '[data-testid*="bulk" i]',
      'button:has-text("Import Tenants")',
      'button:has-text("Bulk Upload")',
      'button:has-text("Import CSV")',
      'button:has-text("Upload CSV")',
    ], 'tenant bulk import');

    await waitForLoader(page);
    await expect(page.locator('input[type="file"]').first(), 'tenant import must expose a file picker').toBeAttached({ timeout: 10000 });
  });

  test('Admin ticket assignment and contract approval controls are launch-ready', async ({ page }) => {
    await page.goto('/tickets', { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="admin-ticket-view"]',
      '[data-testid*="ticket-view" i]',
      'button:has-text("DETAILS")',
      'button:has-text("View")',
      'a:has-text("View")',
    ], 'open ticket');

    // Click cancel to close the details dialog before assignment check
    await page.locator('button:has-text("CANCEL")').first().click();
    await page.waitForTimeout(500);

    await clickRequired(page, [
      '[data-testid="admin-assign-technician"]',
      '[data-testid*="assign" i]',
      'button:has-text("ASSIGN")',
      'button:has-text("Assign Technician")',
      'button:has-text("Assign")',
    ], 'assign technician');

    await expect(page.locator('body'), 'assignment must expose assignment list').toContainText('MANUAL SPECIALIST ASSIGNMENT', { timeout: 10000 });
    
    // Close the assignment dialog
    await page.locator('button:has-text("CANCEL")').first().click();
    await page.waitForTimeout(500);

    await page.goto('/manual-approvals', { waitUntil: 'domcontentloaded' });
    await waitForLoader(page);
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="admin-approve-contract"]',
      '[data-testid*="approve" i]',
      'button:has-text("Verify Settlement")',
      'button:has-text("Approve Contract")',
      'button:has-text("Approve")',
    ], 'approve contract');
  });
});
