import { test, expect, Page } from '@playwright/test';
import { installAppCheckDebugToken, assertAppCheckDebugTokenInPage, collectAppCheckFailures, attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

function requireEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Credentialed tests fail closed without secrets.`);
  }
  return value;
}

async function testLogin(page: Page, email: string, password: string) {
  if (!email || !password) {
    throw new Error('testLogin requires email and password from environment variables.');
  }
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('input[type="email"], input[name*="email" i]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i]').first();
  
  await expect(emailInput).toBeVisible({ timeout: 15000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.locator('button[type="submit"]').first().click();
}

test.describe('Final Admin-Login Proof', () => {
  test.beforeEach(async ({ page }) => {
    const __appCheckMonitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = __appCheckMonitor;
    await __appCheckMonitor.assertTokenFingerprint();
  });
  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('Founder email login enters Command Panel', async ({ page }) => {
    const email = requireEnv('E2E_ADMIN_EMAIL');
    const password = requireEnv('E2E_ADMIN_PASSWORD');
    await testLogin(page, email, password);
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15000 });
    const dashboardText = await page.locator('body').innerText();
    expect(dashboardText).toMatch(/Admin|Dashboard/i);
  });

  test('Non-admin denial redirects or shows error', async ({ page }) => {
    const email = requireEnv('E2E_OWNER_EMAIL');
    const password = requireEnv('E2E_OWNER_PASSWORD');
    await testLogin(page, email, password);
    await page.waitForTimeout(3000);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    const denied = bodyText.match(/permission|unauthorized|denied|Login/i) || !page.url().includes('/admin/dashboard');
    expect(denied).toBeTruthy();
  });

  test('Staff role login limits view appropriately', async ({ page }) => {
    const email = requireEnv('E2E_TECHNICIAN_EMAIL');
    const password = requireEnv('E2E_TECHNICIAN_PASSWORD');
    await testLogin(page, email, password);
    await page.waitForTimeout(3000);
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 5000 });
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/Technician|Jobs|Tasks/i);
  });

  test('Logout/relogin stability avoids blank screen', async ({ page }) => {
    const email = requireEnv('E2E_ADMIN_EMAIL');
    const password = requireEnv('E2E_ADMIN_PASSWORD');
    await testLogin(page, email, password);
    await page.waitForTimeout(3000);
    const logoutBtn = page.getByTestId('admin-logout').or(page.locator('button:has-text("Logout")')).first();
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await page.waitForTimeout(2000);
      await expect(page).toHaveURL(/\/login/);
      
      await testLogin(page, email, password);
      await page.waitForTimeout(3000);
      await expect(page).not.toHaveURL(/\/login/);
      const text = await page.locator('body').innerText();
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/unhandled runtime error|application error/i);
    }
  });

});
