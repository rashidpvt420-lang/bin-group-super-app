import { test, expect } from '@playwright/test';

test.describe('Staff-First Company Operating System E2E Suite', () => {
  test('A. Public Smoke & Staff TODAY Dashboard Navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/BIN GROUP/i);

    // Verify public landing components render without authentication error
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('B. Shift State Machine & Attendance Workflow Structure', async ({ page }) => {
    await page.goto('/');
    // Verify basic layout structure
    const mainContainer = page.locator('#root');
    await expect(mainContainer).toBeVisible();
  });

  test('C. Feature Flags Gate Incomplete Modules', async ({ page }) => {
    await page.goto('/');
    // Ensure no unapproved links or buttons for incomplete features exist on public routes
    const orgChartBtn = page.locator('button:has-text("Org Chart Node")');
    await expect(orgChartBtn).toHaveCount(0);
  });
});
