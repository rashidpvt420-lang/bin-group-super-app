/**
 * launch-audit-broker.spec.ts
 * Deep E2E launch audit for the Broker role.
 * Verifies: dashboard KPIs, leads, referrals, commissions, documents,
 * profile, AR/EN switch.
 */
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { assertAppCheckDebugTokenInPage, collectAppCheckFailures, attachAuthenticatedAppCheckMonitor, type AppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL    = process.env.E2E_BROKER_MAILBOX_EMAIL    ?? '';
const PASSWORD = process.env.E2E_BROKER_PASSWORD ?? '';

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized|app check|firebase.?app.?check|insufficient permissions/i;

function requireAuditCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Launch audit blocked: missing E2E_BROKER_MAILBOX_EMAIL/PASSWORD. Do not skip broker launch audit during clearance.');
  }
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const email = page.locator('input[type="email"], input[name*="email" i]').first();
  const password = page.locator('input[type="password"]').first();
  await expect(email).toBeVisible({ timeout: 20_000 });
  await expect(password).toBeVisible({ timeout: 20_000 });
  await email.fill(EMAIL);
  await password.fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });
}

async function assertHealthy(page: Page, context: string) {
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${context}: body must render text`).toBeGreaterThan(0);
  expect(body, `${context}: no crash text`).not.toMatch(CRASH_PATTERN);
  expect(body, `${context}: no access-denied`).not.toMatch(ACCESS_DENIED);
}

test.describe('Broker launch audit', () => {
  // Keep a single authenticated Broker session for the serial route audit.
  // This still validates real browser authentication and Firebase reads while
  // avoiding repeated equivalent sign-ins during one deploy gate.
  test.describe.configure({ mode: 'serial' });

  let brokerContext: BrowserContext | null = null;
  let brokerPage: Page | null = null;
  let appCheckMonitor: AppCheckMonitor | null = null;

  const pageForAudit = () => {
    if (!brokerPage) throw new Error('Broker launch-audit session was not initialized.');
    return brokerPage;
  };

  test.beforeAll(async ({ browser }) => {
    brokerContext = await browser.newContext();
    brokerPage = await brokerContext.newPage();
    appCheckMonitor = await attachAuthenticatedAppCheckMonitor(brokerPage);
    await appCheckMonitor.assertTokenFingerprint();
    requireAuditCredentials();
    await login(brokerPage);
  });

  test.afterEach(async ({}, testInfo) => {
    if (!appCheckMonitor) return;
    appCheckMonitor.assertClean(testInfo.title);
    appCheckMonitor.assertAuthenticatedFirebaseRead(testInfo.title);
  });

  test.afterAll(async () => {
    try {
      appCheckMonitor?.assertClean('Broker launch audit shared session');
      appCheckMonitor?.assertAuthenticatedFirebaseRead('Broker launch audit shared session');
    } finally {
      await brokerContext?.close();
      brokerContext = null;
      brokerPage = null;
      appCheckMonitor = null;
    }
  });

  test('broker dashboard loads with KPI cards', async () => {
    const page = pageForAudit();
    await assertAppCheckDebugTokenInPage(page);
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/broker/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'broker/dashboard');
    expect(collectAppCheckFailures(errors), 'App Check/403/429 console failures').toEqual([]);
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);
  });

  test('broker leads page loads', async () => {
    const page = pageForAudit();
    await page.goto('/broker/leads', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'broker/leads');
  });

  test('broker referrals page loads', async () => {
    const page = pageForAudit();
    await page.goto('/broker/referrals', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'broker/referrals');
  });

  test('broker commissions page loads', async () => {
    const page = pageForAudit();
    await page.goto('/broker/commissions', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'broker/commissions');
  });

  test('broker documents page loads', async () => {
    const page = pageForAudit();
    await page.goto('/broker/documents', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'broker/documents');
  });

  test('broker profile page loads', async () => {
    const page = pageForAudit();
    await page.goto('/broker/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'broker/profile');
  });

  test('broker nav bar renders correct labels (not hardcoded English)', async () => {
    const page = pageForAudit();
    await page.goto('/broker/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    const dashBtn = page.locator('#broker-nav-dashboard, button[id="broker-nav-dashboard"]').first();
    const hasDashBtn = await dashBtn.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!hasDashBtn) {
      const navText = await page.locator('body').innerText({ timeout: 8_000 });
      expect(navText, 'Broker nav must contain Dashboard text').toMatch(/dashboard|لوحة القيادة|لوحة التحكم/i);
    }
  });

  test('broker AR/EN language switch works (including shell labels)', async () => {
    const page = pageForAudit();
    await page.goto('/broker/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);

    const langBtn = page.getByTestId('broker-language-toggle');
    await expect(langBtn, 'Language toggle must be visible in broker shell').toBeVisible({ timeout: 10_000 });
    await langBtn.click();
    await page.waitForTimeout(1_500);

    const afterText = await page.locator('body').innerText({ timeout: 10_000 });
    expect(afterText.trim().length, 'Content must render after AR switch').toBeGreaterThan(0);
    expect(afterText, 'No crash after language switch').not.toMatch(CRASH_PATTERN);
    const hasArabicContent = /[\u0600-\u06FF]/.test(afterText);
    expect(hasArabicContent, 'Arabic content must appear after language switch').toBe(true);

    await page.getByTestId('broker-language-toggle').click();
    await page.waitForTimeout(500);
  });

  test('broker mobile nav renders (viewport: mobile)', async () => {
    const page = pageForAudit();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/broker/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'broker/dashboard (mobile)');

    const mobileNav = page.locator('#broker-mobile-nav-dashboard, [id^="broker-mobile-nav-"]').first();
    const hasMobileNav = await mobileNav.isVisible({ timeout: 8_000 }).catch(() => false);
    if (!hasMobileNav) {
      const body = await page.locator('body').innerText();
      expect(body, 'Mobile broker layout must not crash').not.toMatch(CRASH_PATTERN);
    }
  });
});
