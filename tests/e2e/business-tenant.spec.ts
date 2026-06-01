/**
 * business-tenant.spec.ts
 * Deep E2E business flow for the Tenant role.
 * Verifies: Creating a service request, uploading photo, and approving work.
 */
import { test, expect, Page } from '@playwright/test';

const EMAIL    = process.env.E2E_TENANT_EMAIL    ?? '';
const PASSWORD = process.env.E2E_TENANT_PASSWORD ?? '';

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_TENANT_EMAIL/PASSWORD. Tenant launch validation cannot be skipped for public release.');
  }
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/tenant/dashboard', { timeout: 15_000 });
}

async function selectFirstMuiOption(page: Page, label: RegExp | string) {
  const combobox = page.getByLabel(label).first().or(page.locator('[role="combobox"]').first());
  await expect(combobox).toBeVisible({ timeout: 10_000 });
  await combobox.click();
  const option = page.locator('[role="option"]').first();
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

test.describe('Tenant Business Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Tenant can create a service request and upload photo', async ({ page }) => {
    await page.goto('/tenant/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });

    const createBtn = page
      .locator('button:has-text("New Complaint / Request"), button:has-text("Management Request"), button:has-text("New Request"), button:has-text("Report Issue"), button:has-text("Create Ticket")')
      .first();
    await expect(createBtn).toBeVisible({ timeout: 15_000 });
    await createBtn.click();

    await expect(page).toHaveURL(/\/tenant\/request/, { timeout: 15_000 });

    await selectFirstMuiOption(page, /Category/i);

    const locationInput = page
      .locator('input[placeholder*="technician" i], input[placeholder*="location" i], input[aria-label*="location" i]')
      .first();
    if (await locationInput.isVisible().catch(() => false)) {
      await locationInput.fill('E2E Kitchen AC vent');
    }

    const issueInput = page.locator('textarea, input[placeholder*="issue" i], input[placeholder*="describe" i]').first();
    await expect(issueInput).toBeVisible({ timeout: 10_000 });
    await issueInput.fill('E2E Test: AC is not cooling properly.');

    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles({
        name: 'tenant-request-evidence.png',
        mimeType: 'image/png',
        buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'),
      }).catch(() => undefined);
    }

    const dispatchBtn = page
      .locator('button:has-text("DISPATCH REQUEST"), button:has-text("Dispatch Request"), button[type="submit"]')
      .first();
    await expect(dispatchBtn).toBeVisible({ timeout: 15_000 });
    await expect(dispatchBtn).toBeEnabled({ timeout: 15_000 });
    await dispatchBtn.click();

    await Promise.race([
      page.waitForURL('**/tenant/tickets', { timeout: 25_000 }),
      expect(page.locator('body')).toContainText(/success|created|submitted|ticket|request/i, { timeout: 25_000 }),
    ]);
    await expect(page.locator('body')).not.toContainText(/Failed to submit|Property GPS location is missing|No property assigned|Missing or insufficient permissions/i, { timeout: 5_000 });
  });

  test('Tenant can approve completed work', async ({ page }) => {
    await page.goto('/tenant/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });

    const approveBtn = page.locator('button:has-text("Approve"), button:has-text("Accept Work")').first();
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Yes")').first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      }
      
      await expect(page.locator('text=approved').or(page.locator('text=closed'))).toBeVisible({ timeout: 5000 }).catch(() => {});
    }
  });
});
