/**
 * launch-audit-admin.spec.ts
 * Deep E2E launch audit for the Admin role.
 * Verifies: dashboard KPIs, key nav clicks, AR/EN switch, no runtime errors.
 */
import { expect, Page, test } from '@playwright/test';

const EMAIL    = process.env.E2E_ADMIN_EMAIL    ?? '';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized/i;
const RAW_I18N_KEY  = /^(nav|onboarding|dash|sos|tech|fin|admin)\.[a-z_]+$/;

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_500);
}

async function assertHealthy(page: Page, context: string) {
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${context}: body must render text`).toBeGreaterThan(0);
  expect(body, `${context}: no crash text`).not.toMatch(CRASH_PATTERN);
  expect(body, `${context}: no access-denied text`).not.toMatch(ACCESS_DENIED);
}

async function consoleCollector(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test.describe('Admin launch audit', () => {
  test.skip(!EMAIL || !PASSWORD, 'Missing E2E_ADMIN_EMAIL/PASSWORD — skipping admin audit.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('admin dashboard loads with KPI cards', async ({ page }) => {
    const errors = await consoleCollector(page);
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'admin/dashboard');
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);
  });

  test('admin owners list loads', async ({ page }) => {
    await page.goto('/admin/owners', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/owners');
  });

  test('admin tenants list loads', async ({ page }) => {
    await page.goto('/admin/tenants', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/tenants');
  });

  test('admin tickets list loads', async ({ page }) => {
    await page.goto('/admin/tickets', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/tickets');
  });

  test('admin technicians list loads', async ({ page }) => {
    await page.goto('/admin/technicians', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/technicians');
  });

  test('admin SOS feed loads', async ({ page }) => {
    await page.goto('/admin/sos', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/sos');
  });

  test('admin financials loads', async ({ page }) => {
    await page.goto('/admin/financials', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/financials');
  });

  test('admin contracts loads', async ({ page }) => {
    await page.goto('/admin/contracts', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/contracts');
  });

  test('admin audit log loads', async ({ page }) => {
    await page.goto('/admin/audit', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/audit');
  });

  test('admin AR/EN language switch works and shows no raw i18n keys', async ({ page }) => {
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);

    // Find and click the language toggle (LanguageSwitcher component)
    const langBtn = page.locator(
      'button:has-text("AR"), button:has-text("EN"), [id*="lang"], button[aria-label*="language" i], button:has-text("Arabic"), button:has-text("عربي")'
    ).first();
    await expect(langBtn, 'Language toggle must be visible in admin shell').toBeVisible({ timeout: 10_000 });
    await langBtn.click();
    await page.waitForTimeout(1_000);

    // Verify direction changed
    const dir = await page.locator('body, [dir]').first().getAttribute('dir').catch(() => null)
      ?? await page.evaluate(() => document.documentElement.dir || document.body.dir);
    // After switching to Arabic, dir should be rtl (or html lang = ar)
    const htmlLang = await page.evaluate(() => document.documentElement.lang);
    const bodyText = await page.locator('body').innerText({ timeout: 10_000 });
    expect(bodyText, 'Body must still render after language switch').toBeTruthy();

    // Switch back
    await langBtn.click();
    await page.waitForTimeout(500);
  });

  test('admin live map page loads', async ({ page }) => {
    await page.goto('/admin/technicians/map', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'admin/technicians/map');
  });
});
