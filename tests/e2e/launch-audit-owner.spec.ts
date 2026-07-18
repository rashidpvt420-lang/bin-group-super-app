/**
 * launch-audit-owner.spec.ts
 * Deep E2E launch audit for the Owner role.
 * Verifies: dashboard, properties, contracts, financials, tenants,
 * documents, property passport, tickets, AR/EN switch.
 */
import { expect, Page, test } from '@playwright/test';
import { assertAppCheckDebugTokenInPage, collectAppCheckFailures, attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL    = process.env.E2E_OWNER_EMAIL    ?? '';
const PASSWORD = process.env.E2E_OWNER_PASSWORD ?? '';

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized|app check|firebase.?app.?check|insufficient permissions/i;

function requireAuditCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Launch audit blocked: missing E2E_OWNER_EMAIL/PASSWORD. Do not skip owner launch audit during clearance.');
  }
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_500);
}

async function assertHealthy(page: Page, expectedPath: string) {
  await expect.poll(() => new URL(page.url()).pathname, { message: `${expectedPath}: route must not silently redirect` }).toBe(expectedPath);
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${expectedPath}: body must render text`).toBeGreaterThan(0);
  expect(body, `${expectedPath}: no crash text`).not.toMatch(CRASH_PATTERN);
  expect(body, `${expectedPath}: no access-denied`).not.toMatch(ACCESS_DENIED);
}

test.describe('Owner launch audit', () => {
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

  test('owner dashboard loads with portfolio content', async ({ page }) => {
    await assertAppCheckDebugTokenInPage(page);
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, '/owner/dashboard');
    expect(collectAppCheckFailures(errors), 'App Check/403/429 console failures').toEqual([]);
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);
  });

  for (const [title, route] of [
    ['owner properties page loads', '/owner/properties'],
    ['owner contracts page loads', '/owner/contracts'],
    ['owner financials page loads', '/owner/financials'],
    ['owner tenants page loads', '/owner/tenants'],
    ['owner documents page loads', '/owner/documents'],
    ['owner property passport page loads', '/owner/property-passport'],
    ['owner tickets page loads', '/owner/tickets'],
    ['owner units page loads', '/owner/units'],
    ['owner ROI page loads', '/owner/roi'],
    ['owner activation/onboarding-status page loads', '/owner/activation'],
  ] as const) {
    test(title, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1_500);
      await assertHealthy(page, route);
    });
  }

  test('owner AR/EN switch works in shell', async ({ page }) => {
    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, '/owner/dashboard');
    const langBtn = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await expect(langBtn, 'Language toggle must be visible in owner shell').toBeVisible({ timeout: 10_000 });
    await langBtn.click();
    await page.waitForTimeout(1_200);
    const afterText = await page.locator('body').innerText({ timeout: 10_000 });
    expect(afterText.trim().length, 'Content must render after AR switch').toBeGreaterThan(0);
    expect(afterText, 'No crash after language switch').not.toMatch(/application error|unhandled runtime error/i);
    await expect.poll(() => new URL(page.url()).pathname).toBe('/owner/dashboard');
    const langBtnAfter = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await langBtnAfter.click();
    await page.waitForTimeout(500);
  });
});
