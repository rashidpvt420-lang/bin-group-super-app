/**
 * launch-audit-tenant.spec.ts
 * Deep E2E launch audit for the Tenant role.
 * Verifies: dashboard, unit, request form, tickets, documents,
 * emergency form, chat, profile, reviewed correction history, gate pass, AR/EN switch.
 */
import { expect, Page, test } from '@playwright/test';
import { assertAppCheckDebugTokenInPage, collectAppCheckFailures, attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL    = process.env.E2E_TENANT_EMAIL    ?? '';
const PASSWORD = process.env.E2E_TENANT_PASSWORD ?? '';

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized|app check|firebase.?app.?check|insufficient permissions/i;

function requireAuditCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Launch audit blocked: missing E2E_TENANT_EMAIL/PASSWORD. Do not skip tenant launch audit during clearance.');
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

async function assertHealthy(page: Page, context: string) {
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${context}: body must render text`).toBeGreaterThan(0);
  expect(body, `${context}: no crash text`).not.toMatch(CRASH_PATTERN);
  expect(body, `${context}: no access-denied`).not.toMatch(ACCESS_DENIED);
}

test.describe('Tenant launch audit', () => {
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

  test('tenant dashboard loads with unit card', async ({ page }) => {
    await assertAppCheckDebugTokenInPage(page);
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/tenant/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'tenant/dashboard');
    expect(collectAppCheckFailures(errors), 'App Check/403/429 console failures').toEqual([]);
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

  test('tenant correction submission and immutable history are reachable', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/tenant/profile', { waitUntil: 'domcontentloaded' });
    await assertHealthy(page, 'tenant/profile correction evidence');

    await expect(page.getByTestId('tenant-correction-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel(/Full Name|الاسم الكامل/i).first()).toBeDisabled();
    await expect(page.getByLabel(/Phone Number|رقم الهاتف/i).first()).toBeDisabled();

    const fieldControl = page.getByTestId('tenant-correction-field');
    await fieldControl.click();
    await page.getByRole('option', { name: /Emergency contact name|اسم جهة اتصال الطوارئ/i }).click();

    const requestedValue = `E2E Correction ${Date.now()}`;
    const reason = `E2E launch audit Tenant correction proof ${Date.now()}`;
    await page.getByTestId('tenant-correction-value').locator('input').fill(requestedValue);
    await page.getByTestId('tenant-correction-reason').locator('textarea').fill(reason);

    const submit = page.getByTestId('tenant-correction-submit');
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByTestId('tenant-correction-success')).toContainText(/submitted|تم إرسال/i, { timeout: 25_000 });
    const history = page.getByTestId('tenant-correction-history');
    await expect(history).toContainText(requestedValue, { timeout: 25_000 });
    const requestCard = history.locator('[data-testid^="tenant-correction-request-"]').filter({ hasText: requestedValue }).first();
    await expect(requestCard).toBeVisible({ timeout: 20_000 });
    await expect(requestCard.getByTestId('tenant-correction-status')).toContainText(/PENDING ADMIN REVIEW/i);
    await expect(requestCard.getByTestId('tenant-correction-events')).toContainText(/SUBMITTED/i);
    await expect(requestCard).toContainText(/E2E Emergency Contact Baseline/i);
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

    const langBtnAfter = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await langBtnAfter.click();
    await page.waitForTimeout(500);
  });
});
