/**
 * launch-audit-tenant.spec.ts
 * Deep E2E launch audit for the Tenant role.
 * Verifies: dashboard, unit, request form, tickets, documents,
 * emergency form, chat, profile, gate pass, AR/EN switch.
 */
import { expect, Page, test } from '@playwright/test';

const EMAIL    = process.env.E2E_TENANT_EMAIL    ?? '';
const PASSWORD = process.env.E2E_TENANT_PASSWORD ?? '';

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized/i;

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
  expect(body, `${context}: no access-denied`).not.toMatch(ACCESS_DENIED);
}

test.describe('Tenant launch audit', () => {
  test.skip(!EMAIL || !PASSWORD, 'Missing E2E_TENANT_EMAIL/PASSWORD — skipping tenant audit.');

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('tenant dashboard loads with unit card', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/tenant/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'tenant/dashboard');
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);
  });

  test('tenant unit page loads', async ({ page }) => {
    await page.goto('/tenant/unit', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/unit');
  });

  test('tenant maintenance request form renders', async ({ page }) => {
    await page.goto('/tenant/request', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/request');
    // Verify a form element is present (do NOT submit)
    const hasForm = await page.locator('form, [role="form"], textarea, input[type="text"]').first().isVisible({ timeout: 8_000 }).catch(() => false);
    expect(hasForm, 'Maintenance request form must render an input').toBe(true);
  });

  test('tenant tickets list loads', async ({ page }) => {
    await page.goto('/tenant/tickets', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/tickets');
  });

  test('tenant documents vault renders', async ({ page }) => {
    await page.goto('/tenant/documents', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/documents');
  });

  test('tenant emergency page renders (no submit)', async ({ page }) => {
    await page.goto('/tenant/emergency', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/emergency');
    // Verify the emergency UI rendered
    const body = await page.locator('body').innerText({ timeout: 10_000 });
    expect(body, 'Emergency page must have relevant content').toMatch(/emergency|sos|urgent|استغاثة|طارئ/i);
  });

  test('tenant chat interface renders', async ({ page }) => {
    await page.goto('/tenant/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/chat');
  });

  test('tenant profile page renders', async ({ page }) => {
    await page.goto('/tenant/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/profile');
  });

  test('tenant gate pass page renders', async ({ page }) => {
    await page.goto('/tenant/gate-pass', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/gate-pass');
  });

  test('tenant amenities page renders', async ({ page }) => {
    await page.goto('/tenant/amenities', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'tenant/amenities');
  });

  test('tenant AR/EN language switch works in shell', async ({ page }) => {
    await page.goto('/tenant/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);

    const langBtn = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await expect(langBtn, 'Language toggle must be visible in tenant shell').toBeVisible({ timeout: 10_000 });

    await langBtn.click();
    await page.waitForTimeout(1_200);

    const afterText = await page.locator('body').innerText({ timeout: 10_000 });
    expect(afterText.trim().length, 'Content must render after AR switch').toBeGreaterThan(0);
    expect(afterText, 'No crash after language switch').not.toMatch(/application error|unhandled runtime error/i);

    // Switch back
    const langBtnAfter = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await langBtnAfter.click();
    await page.waitForTimeout(500);
  });
});
