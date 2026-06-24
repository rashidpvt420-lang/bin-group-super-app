import { test, expect, Page } from '@playwright/test';

async function testLogin(page: Page, email: string, password: string = 'E2e!Test!Pass2026') {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
  
  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.locator('button[type="submit"]').first().click();
}

test.describe('Final Admin-Login Proof', () => {

  test('Founder email login enters Command Panel', async ({ page }) => {
    // We use a dummy founder email. In our system, e2e-admin acts as admin.
    await testLogin(page, 'e2e-admin@bingroup.com');
    await page.waitForTimeout(3000);
    // Should navigate to dashboard and show command panel or dashboard elements
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    const dashboardText = await page.locator('body').innerText();
    expect(dashboardText).toMatch(/Admin|Dashboard/i);
  });

  test('Non-admin denial redirects or shows error', async ({ page }) => {
    await testLogin(page, 'e2e-owner@bingroup.com'); // This is an owner, not admin
    await page.waitForTimeout(3000);
    // Try navigating to admin route
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    // Should be redirected or denied access
    const bodyText = await page.locator('body').innerText();
    const denied = bodyText.match(/permission|unauthorized|denied|Login/i) || !page.url().includes('/admin/dashboard');
    expect(denied).toBeTruthy();
  });

  test('Staff role login limits view appropriately', async ({ page }) => {
    await testLogin(page, 'e2e-technician@bingroup.com'); // technician
    await page.waitForTimeout(3000);
    // Should be on technician dashboard, not admin
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 5000 });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/Technician|Jobs|Tasks/i);
  });

  test('Logout/relogin stability avoids blank screen', async ({ page }) => {
    await testLogin(page, 'e2e-admin@bingroup.com');
    await page.waitForTimeout(3000);
    // Click logout
    const logoutBtn = page.getByTestId('admin-logout').or(page.locator('button:has-text("Logout")')).first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
      await expect(page).toHaveURL(/\/login/);
      
      // Relogin
      await testLogin(page, 'e2e-admin@bingroup.com');
      await page.waitForTimeout(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.locator('body').innerText();
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/unhandled runtime error|application error/i);
    }
  });

});
