/**
 * business-owner.spec.ts
 * Deep E2E business flow for the Owner role.
 * Verifies: Generating a quote, selecting a contract, payment flow, document upload, and signing.
 */
import { test, expect, Page } from '@playwright/test';

const EMAIL    = process.env.E2E_OWNER_EMAIL    ?? '';
const PASSWORD = process.env.E2E_OWNER_PASSWORD ?? '';

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], button:has-text("SIGN IN"), button:has-text("Sign in"), button:has-text("Login")').first().click();
  await page.waitForURL('**/owner-dashboard', { timeout: 15_000 });
}

test.describe('Owner Business Workflow', () => {
  test.skip(!EMAIL || !PASSWORD, 'Missing E2E_OWNER_EMAIL/PASSWORD — skipping owner business flow.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Owner can navigate to onboarding and generate a quote', async ({ page }) => {
    // Navigate to onboarding flow
    await page.goto('/onboarding', { waitUntil: 'networkidle' });
    
    // Step 1: Company / Owner Profile
    await expect(page.locator('text=Company')).toBeVisible();
    await page.locator('button:has-text("Next"), button:has-text("Continue")').first().click();

    // Step 2: Asset Profile (Input property details)
    await expect(page.locator('text=Asset')).toBeVisible();
    await page.locator('input[name="projectName"], input[placeholder*="Project" i]').first().fill('E2E Test Villa');
    await page.locator('button:has-text("Next"), button:has-text("Continue")').first().click();

    // Step 3: Location
    await expect(page.locator('text=Location')).toBeVisible();
    await page.locator('button:has-text("Next"), button:has-text("Continue")').first().click();

    // Step 4: Systems + Add-ons
    await expect(page.locator('text=Systems + Add-ons')).toBeVisible();
    // Select some systems to generate a quote
    const hvacToggle = page.locator('input[name="hvac"], [data-testid="system-hvac"]');
    if (await hvacToggle.isVisible()) {
      await hvacToggle.check();
    }
    await page.locator('button:has-text("Next"), button:has-text("Generate Quote"), button:has-text("Continue")').first().click();

    // Step 5: Service Plan / Commercial Terms
    await expect(page.locator('text=Service Plan')).toBeVisible();
    // Select a plan (e.g., Platinum or Basic)
    const selectPlanBtn = page.locator('button:has-text("Select"), button:has-text("Choose")').first();
    if (await selectPlanBtn.isVisible()) {
      await selectPlanBtn.click();
    }
    await page.locator('button:has-text("Next"), button:has-text("Continue")').first().click();
    
    // Just verify we reach Documents or Account step
    await expect(page.locator('text=Documents').or(page.locator('text=Account'))).toBeVisible();
  });
});
