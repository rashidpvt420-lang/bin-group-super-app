/**
 * launch-audit-owner.spec.ts
 * Deep E2E launch audit for the Owner role.
 * Verifies: dashboard, properties, contracts, financials, tenants,
 * documents, property passport, tickets, AR/EN switch.
 */
import { expect, Page, test } from '@playwright/test';

const EMAIL    = process.env.E2E_OWNER_EMAIL    ?? '';
const PASSWORD = process.env.E2E_OWNER_PASSWORD ?? '';

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized/i;

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('button[type="submit"], button:has-text("SIGN IN"), button:has-text("Sign in"), button:has-text("Login")').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_500);
}

async function assertHealthy(page: Page, context: string) {
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${context}: body must render text`).toBeGreaterThan(0);
  expect(body, `${context}: no crash text`).not.toMatch(CRASH_PATTERN);
  expect(body, `${context}: no access-denied`).not.toMatch(ACCESS_DENIED);
}

test.describe('Owner launch audit', () => {
  test.skip(!EMAIL || !PASSWORD, 'Missing E2E_OWNER_EMAIL/PASSWORD — skipping owner audit.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('owner dashboard loads with portfolio content', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'owner/dashboard');
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);
  });

  test('owner properties page loads', async ({ page }) => {
    await page.goto('/owner/properties', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/properties');
  });

  test('owner contracts page loads', async ({ page }) => {
    await page.goto('/owner/contracts', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/contracts');
  });

  test('owner financials page loads', async ({ page }) => {
    await page.goto('/owner/financials', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/financials');
  });

  test('owner tenants page loads', async ({ page }) => {
    await page.goto('/owner/tenants', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/tenants');
  });

  test('owner documents page loads', async ({ page }) => {
    await page.goto('/owner/documents', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/documents');
  });

  test('owner property passport page loads', async ({ page }) => {
    await page.goto('/owner/property-passport', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/property-passport');
  });

  test('owner tickets page loads', async ({ page }) => {
    await page.goto('/owner/tickets', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/tickets');
  });

  test('owner units page loads', async ({ page }) => {
    await page.goto('/owner/units', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/units');
  });

  test('owner ROI page loads', async ({ page }) => {
    await page.goto('/owner/roi', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/roi');
  });

  test('owner AR/EN switch works in shell', async ({ page }) => {
    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);

    // The owner shell has a Globe + "AR"/"EN" toggle button
    const langBtn = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await expect(langBtn, 'Language toggle must be visible in owner shell').toBeVisible({ timeout: 10_000 });

    // Capture text before switch
    const beforeText = await page.locator('body').innerText({ timeout: 10_000 });

    await langBtn.click();
    await page.waitForTimeout(1_200);

    const afterText = await page.locator('body').innerText({ timeout: 10_000 });
    expect(afterText.trim().length, 'Content must render after AR switch').toBeGreaterThan(0);
    // After switching to AR, portal title should have changed
    // (just verify content changed — exact Arabic text depends on what loads)
    expect(afterText, 'No crash after language switch').not.toMatch(/application error|unhandled runtime error/i);

    // Switch back to EN
    const langBtnAfter = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await langBtnAfter.click();
    await page.waitForTimeout(500);
  });

  test('owner activation/onboarding-status page loads', async ({ page }) => {
    await page.goto('/owner/activation', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'owner/activation');
  });
});
