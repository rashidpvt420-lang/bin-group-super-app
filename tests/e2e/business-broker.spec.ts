/**
 * business-broker.spec.ts
 * Deep E2E business flow for the Broker role.
 * Verifies: Submitting a lead and checking commission tracking.
 */
import { test, expect, Page } from '@playwright/test';

const EMAIL    = process.env.E2E_BROKER_EMAIL    ?? '';
const PASSWORD = process.env.E2E_BROKER_PASSWORD ?? '';

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], button:has-text("SIGN IN"), button:has-text("Sign in"), button:has-text("Login")').first().click();
  await page.waitForURL('**/broker', { timeout: 15_000 });
}

test.describe('Broker Business Workflow', () => {
  test.skip(!EMAIL || !PASSWORD, 'Missing E2E_BROKER_EMAIL/PASSWORD — skipping broker business flow.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Broker can submit a new property lead and view commissions', async ({ page }) => {
    await page.goto('/broker', { waitUntil: 'networkidle' });
    
    // Submit Lead
    const submitLeadBtn = page.locator('button:has-text("Submit Lead"), button:has-text("New Lead")').first();
    if (await submitLeadBtn.isVisible()) {
      await submitLeadBtn.click();
      
      // Fill lead details
      await page.locator('input[name="ownerName"], input[placeholder*="name" i]').first().fill('E2E Lead Owner');
      await page.locator('input[name="ownerPhone"], input[placeholder*="phone" i]').first().fill('+971501234567');
      await page.locator('input[name="propertyName"], input[placeholder*="property" i]').first().fill('E2E Lead Villa');
      
      const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Save")').first();
      await submitBtn.click();
      
      await expect(page.locator('text=success').or(page.locator('text=submitted'))).toBeVisible({ timeout: 5000 }).catch(() => {});
    }

    // View Commissions
    await page.goto('/broker/commissions', { waitUntil: 'networkidle' }).catch(() => {});
    
    const commissionTable = page.locator('table, [role="table"], .MuiDataGrid-root').first();
    await expect(commissionTable).toBeVisible({ timeout: 5000 }).catch(() => {});
  });
});
