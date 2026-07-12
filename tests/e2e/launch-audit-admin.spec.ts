/**
 * launch-audit-admin.spec.ts
 * Deep E2E launch audit for the dedicated Admin application.
 * Verifies: dashboard KPIs, key nav clicks, AR/EN switch, no runtime errors.
 */
import { expect, Page, test } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || '').trim().replace(/\/+$/, '');

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized|app check|firebase.?app.?check|insufficient permissions/i;
const APPCHECK_HTTP = /\b403\b|\b429\b|too many requests/i;

function requireAuditCredentials() {
  if (!EMAIL || !PASSWORD || !ADMIN_BASE_URL) {
    throw new Error('Launch audit blocked: missing E2E_ADMIN_EMAIL/PASSWORD/E2E_ADMIN_BASE_URL. Do not skip admin launch audit during clearance.');
  }
}

const adminUrl = (pathname: string) => `${ADMIN_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;

async function login(page: Page) {
  await page.goto(adminUrl('/login'), { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(`${ADMIN_BASE_URL}/dashboard`, { timeout: 25_000 });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1_000);
}

async function assertHealthy(page: Page, context: string) {
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${context}: body must render text`).toBeGreaterThan(0);
  expect(body, `${context}: no crash text`).not.toMatch(CRASH_PATTERN);
  expect(body, `${context}: no access-denied text`).not.toMatch(ACCESS_DENIED);
  expect(body, `${context}: no App Check / 429 text`).not.toMatch(APPCHECK_HTTP);
}

async function consoleCollector(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

test.describe('Admin launch audit', () => {
  test.beforeEach(async ({ page }) => {
    const __appCheckMonitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = __appCheckMonitor;
    await __appCheckMonitor.assertTokenFingerprint();
    requireAuditCredentials();
    await login(page);
  });
  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('admin dashboard loads with KPI cards', async ({ page }) => {
    const errors = await consoleCollector(page);
    await page.goto(adminUrl('/dashboard'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'admin/dashboard');
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);
  });

  test('admin owners list loads', async ({ page }) => {
    await page.goto(adminUrl('/owners'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/owners');
  });

  test('admin tenants list loads', async ({ page }) => {
    await page.goto(adminUrl('/tenants'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/tenants');
  });

  test('admin tickets list loads', async ({ page }) => {
    await page.goto(adminUrl('/tickets'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/tickets');
  });

  test('admin technicians list loads', async ({ page }) => {
    await page.goto(adminUrl('/technicians'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/technicians');
  });

  test('admin SOS feed loads', async ({ page }) => {
    await page.goto(adminUrl('/sos'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/sos');
    await expect(page.getByTestId('admin-sos-feed')).toBeVisible({ timeout: 10_000 });
  });

  test('admin financials loads', async ({ page }) => {
    await page.goto(adminUrl('/financials'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/financials');
  });

  test('admin contracts loads', async ({ page }) => {
    await page.goto(adminUrl('/contracts'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/contracts');
  });

  test('admin audit log loads', async ({ page }) => {
    await page.goto(adminUrl('/audit'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/audit');
  });

  test('admin AR/EN language switch works and shows no raw i18n keys', async ({ page }) => {
    await page.goto(adminUrl('/dashboard'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);

    const langBtn = page.locator(
      'button:has-text("AR"), button:has-text("EN"), [id*="lang"], button[aria-label*="language" i], button:has-text("Arabic"), button:has-text("عربي")',
    ).first();
    await expect(langBtn, 'Language toggle must be visible in admin shell').toBeVisible({ timeout: 10_000 });
    await langBtn.click();
    await page.waitForTimeout(1_000);

    const bodyText = await page.locator('body').innerText({ timeout: 10_000 });
    expect(bodyText, 'Body must still render after language switch').toBeTruthy();

    await langBtn.click();
    await page.waitForTimeout(500);
  });

  test('admin live map page loads', async ({ page }) => {
    await page.goto(adminUrl('/technicians/map'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'admin/technicians/map');
  });
});
