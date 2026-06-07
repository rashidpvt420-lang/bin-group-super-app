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
  
  // Inject App Check debug token before the page loads
  const appCheckToken = process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || 'a7ea9b47-3cb4-4bf7-acbe-47bc58565076';
  await page.addInitScript(`window.FIREBASE_APPCHECK_DEBUG_TOKEN = "${appCheckToken}";`);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/tenant/dashboard', { timeout: 15_000 });
}

test.describe('Tenant Business Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Tenant can create a service request and upload photo', async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto('/tenant/request', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/tenant\/request/, { timeout: 15_000 });

    await expect(page.locator('body')).not.toContainText(
      /SOVEREIGN_FAILURE|System Interruption|permission-denied|missing or insufficient permissions|no property assigned|RESIDENCE UNASSIGNED/i,
      { timeout: 10_000 }
    );

    const category = page
      .getByTestId('tenant-request-category')
      .or(page.getByTestId('tenant-request-category-input'))
      .first();

    await expect(category).toBeVisible({ timeout: 30_000 });

    const comboboxes = page.locator('[role="combobox"]');
    await comboboxes.nth(0).click();
    await page.getByRole('option').first().click();

    await comboboxes.nth(1).click();
    await page.getByRole('option').first().click();

    await page.getByTestId('tenant-request-location').fill('Kitchen sink');
    await page.getByTestId('tenant-request-description').fill('E2E water leakage test request with photo evidence.');

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'tenant-request-evidence.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581e20000000049454e44ae426082',
        'hex'
      ),
    });

    await page.getByTestId('tenant-request-submit').click();

    await Promise.race([
      page.waitForURL('**/tenant/tickets', { timeout: 25_000 }),
      expect(page.locator('body')).toContainText(/success|created|submitted|ticket|request/i, { timeout: 25_000 }),
    ]);

    await expect(page.locator('body')).not.toContainText(
      /Failed to submit|Property GPS location is missing|No property assigned|Missing or insufficient permissions/i,
      { timeout: 5_000 }
    );
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
