/**
 * business-admin.spec.ts
 * Deep E2E business flow for the Admin role.
 * Verifies: property, tenant import, ticket assignment, and contract approval controls are present and executable.
 */
import { test, expect, Page } from '@playwright/test';

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
  await page.waitForTimeout(2000);
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error|system interruption/i, { timeout: 10000 });
}

async function requireVisible(page: Page, selectors: string[], label: string) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 1500 }).catch(() => false)) return target;
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
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Admin property and tenant import controls are launch-ready', async ({ page }) => {
    await page.goto('/admin/properties', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="admin-add-property"]',
      '[data-testid*="add-property" i]',
      'button:has-text("Add Property")',
      'button:has-text("Create Property")',
    ], 'add property');

    await expect(page.locator('input, textarea').first(), 'property form must expose editable fields').toBeVisible({ timeout: 10000 });

    await page.goto('/admin/tenants', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="admin-bulk-upload-tenants"]',
      '[data-testid*="bulk" i]',
      'button:has-text("Bulk Upload")',
      'button:has-text("Import CSV")',
      'button:has-text("Upload CSV")',
    ], 'tenant bulk import');

    await expect(page.locator('input[type="file"], button:has-text("Choose File"), button:has-text("Select CSV")').first(), 'tenant import must expose a file picker').toBeVisible({ timeout: 10000 });
  });

  test('Admin ticket assignment and contract approval controls are launch-ready', async ({ page }) => {
    await page.goto('/admin/tickets', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="admin-ticket-view"]',
      '[data-testid*="ticket-view" i]',
      'button:has-text("View")',
      'a:has-text("View")',
    ], 'open ticket');

    await clickRequired(page, [
      '[data-testid="admin-assign-technician"]',
      '[data-testid*="assign" i]',
      'button:has-text("Assign Technician")',
      'button:has-text("Assign")',
    ], 'assign technician');

    await expect(page.locator('select, [role="combobox"]').first(), 'assignment must expose technician selector').toBeVisible({ timeout: 10000 });

    await page.goto('/admin/contracts', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="admin-approve-contract"]',
      '[data-testid*="approve" i]',
      'button:has-text("Approve Contract")',
      'button:has-text("Approve")',
    ], 'approve contract');
  });
});
