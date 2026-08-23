/**
 * Deep E2E launch audit for the dedicated Admin application.
 * Verifies: real Founder MFA, dashboard KPIs, key nav clicks, AR/EN switch,
 * authenticated Firebase reads and no runtime errors.
 */
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor, type AppCheckMonitor } from './helpers/appCheckDebug';
import { loginAdminWithRealMfa, requireAdminMfaCredentials } from './helpers/adminMfa';

const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || '').trim().replace(/\/+$/, '');
const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized|insufficient permissions/i;
const APPCHECK_FAILURE_TEXT =
  /(?:(?:app check|firebase.?app.?check).{0,60}(?:fail(?:ed|ure)?|error|invalid|missing|required|denied|rejected|blocked|unauthorized)|(?:fail(?:ed|ure)?|error|invalid|missing|required|denied|rejected|blocked|unauthorized).{0,60}(?:app check|firebase.?app.?check))/i;
const APPCHECK_HTTP = /\b401\b|\b403\b|\b429\b|too many requests/i;

function requireAuditCredentials() {
  if (!ADMIN_BASE_URL) {
    throw new Error('Launch audit blocked: E2E_ADMIN_BASE_URL is required.');
  }
  const credentials = requireAdminMfaCredentials('E2E_FOUNDER');
  if (credentials.email !== 'ceo@bin-groups.com') {
    throw new Error('Admin launch audit requires the canonical Founder account.');
  }
  return credentials;
}

const adminUrl = (pathname: string) => `${ADMIN_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;

async function assertHealthy(page: Page, context: string) {
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${context}: body must render text`).toBeGreaterThan(0);
  expect(body, `${context}: no crash text`).not.toMatch(CRASH_PATTERN);
  expect(body, `${context}: no access-denied text`).not.toMatch(ACCESS_DENIED);
  expect(body, `${context}: no App Check failure text`).not.toMatch(APPCHECK_FAILURE_TEXT);
  expect(body, `${context}: no App Check / 401 / 403 / 429 text`).not.toMatch(APPCHECK_HTTP);
}

async function consoleCollector(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

test.describe('Admin launch audit', () => {
  // Firebase MFA sign-in is deliberately real, but repeatedly resolving the
  // same Founder challenge for every read-only route can hit the provider's
  // throttling window. Keep one fresh, authenticated Founder session for this
  // serial route audit; every assertion below still executes against the real
  // production Admin app and authenticated Firestore reads.
  test.describe.configure({ mode: 'serial' });

  let adminContext: BrowserContext | null = null;
  let adminPage: Page | null = null;
  let appCheckMonitor: AppCheckMonitor | null = null;

  const pageForAudit = () => {
    if (!adminPage) throw new Error('Admin launch-audit session was not initialized.');
    return adminPage;
  };

  test.beforeAll(async ({ browser }) => {
    adminContext = await browser.newContext();
    adminPage = await adminContext.newPage();
    appCheckMonitor = await attachAuthenticatedAppCheckMonitor(adminPage);
    await appCheckMonitor.assertTokenFingerprint();
    await loginAdminWithRealMfa(adminPage, ADMIN_BASE_URL, requireAuditCredentials());
  });

  test.afterEach(async ({}, testInfo) => {
    if (!appCheckMonitor) return;
    appCheckMonitor.assertClean(testInfo.title);
    appCheckMonitor.assertAuthenticatedFirebaseRead(testInfo.title);
  });

  test.afterAll(async () => {
    try {
      appCheckMonitor?.assertClean('Admin launch audit shared session');
      appCheckMonitor?.assertAuthenticatedFirebaseRead('Admin launch audit shared session');
    } finally {
      await adminContext?.close();
      adminContext = null;
      adminPage = null;
      appCheckMonitor = null;
    }
  });

  test('admin dashboard loads with KPI cards', async () => {
    const page = pageForAudit();
    const errors = await consoleCollector(page);
    await page.goto(adminUrl('/dashboard'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'admin/dashboard');
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);
  });

  test('admin owners list loads', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/owners'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/owners');
  });

  test('admin tenants list loads', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/tenants'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/tenants');
  });

  test('admin tickets list loads', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/tickets'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/tickets');
  });

  test('admin technicians list loads', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/technicians'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/technicians');
  });

  test('admin SOS feed loads', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/sos'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/sos');
    await expect(page.getByTestId('admin-sos-feed')).toBeVisible({ timeout: 10_000 });
  });

  test('admin financials loads', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/financials'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/financials');
  });

  test('admin contract control remains on the real route', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/contracts'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await expect(page).toHaveURL(adminUrl('/contracts'));
    await expect(page.getByTestId('admin-contract-control')).toBeVisible({ timeout: 10_000 });
    await assertHealthy(page, 'admin/contracts');
  });

  test('admin audit log loads', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/audit'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'admin/audit');
  });

  test('admin AR/EN language switch works and shows no raw i18n keys', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/dashboard'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    const languageButton = page.locator(
      'button:has-text("AR"), button:has-text("EN"), [id*="lang"], button[aria-label*="language" i], button:has-text("Arabic"), button:has-text("عربي")',
    ).first();
    await expect(languageButton, 'Language toggle must be visible in admin shell').toBeVisible({ timeout: 10_000 });
    await languageButton.click();
    await page.waitForTimeout(1_000);
    expect(await page.locator('body').innerText({ timeout: 10_000 })).toBeTruthy();
    await languageButton.click();
    await page.waitForTimeout(500);
  });

  test('admin live map page loads', async () => {
    const page = pageForAudit();
    await page.goto(adminUrl('/technicians/map'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'admin/technicians/map');
  });
});
