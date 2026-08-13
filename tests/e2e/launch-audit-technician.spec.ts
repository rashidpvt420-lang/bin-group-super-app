/**
 * launch-audit-technician.spec.ts
 * Deep E2E launch audit for the Technician role.
 * Verifies: dashboard (duty toggle), jobs, map (with geolocation grant),
 * history, HR, profile, AR/EN switch.
 */
import { expect, type BrowserContext, type Page, test } from '@playwright/test';
import { assertAppCheckDebugTokenInPage, collectAppCheckFailures, attachAuthenticatedAppCheckMonitor, type AppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL    = process.env.E2E_TECHNICIAN_EMAIL    ?? '';
const PASSWORD = process.env.E2E_TECHNICIAN_PASSWORD ?? '';

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized|app check|firebase.?app.?check|insufficient permissions/i;

function requireAuditCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Launch audit blocked: missing E2E_TECHNICIAN_EMAIL/PASSWORD. Do not skip technician launch audit during clearance.');
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

test.describe('Technician launch audit', () => {
  // Keep one real authenticated Technician session for the serial route audit
  // so the proof does not create an avoidable burst of password sign-ins.
  test.describe.configure({ mode: 'serial' });

  let technicianContext: BrowserContext | null = null;
  let technicianPage: Page | null = null;
  let appCheckMonitor: AppCheckMonitor | null = null;

  const pageForAudit = () => {
    if (!technicianPage) throw new Error('Technician launch-audit session was not initialized.');
    return technicianPage;
  };

  test.beforeAll(async ({ browser }) => {
    technicianContext = await browser.newContext({
      geolocation: { latitude: 25.2048, longitude: 55.2708 },
      permissions: ['geolocation'],
    });
    technicianPage = await technicianContext.newPage();
    appCheckMonitor = await attachAuthenticatedAppCheckMonitor(technicianPage);
    await appCheckMonitor.assertTokenFingerprint();
    requireAuditCredentials();
    await login(technicianPage);
  });

  test.afterEach(async ({}, testInfo) => {
    if (!appCheckMonitor) return;
    appCheckMonitor.assertClean(testInfo.title);
    appCheckMonitor.assertAuthenticatedFirebaseRead(testInfo.title);
  });

  test.afterAll(async () => {
    try {
      appCheckMonitor?.assertClean('Technician launch audit shared session');
      appCheckMonitor?.assertAuthenticatedFirebaseRead('Technician launch audit shared session');
    } finally {
      await technicianContext?.close();
      technicianContext = null;
      technicianPage = null;
      appCheckMonitor = null;
    }
  });

  test('technician dashboard loads with duty toggle', async () => {
    const page = pageForAudit();
    await assertAppCheckDebugTokenInPage(page);
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/technician/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'technician/dashboard');
    expect(collectAppCheckFailures(errors), 'App Check/403/429 console failures').toEqual([]);
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);

    const dutyBtn = page.locator(
      'button:has-text("DUTY"), button:has-text("START"), button:has-text("Duty"), button:has-text("واجب"), button:has-text("بدء")'
    ).first();
    const dutyVisible = await dutyBtn.isVisible({ timeout: 8_000 }).catch(() => false);
    expect(dutyVisible, 'Duty toggle button must be visible on technician dashboard').toBe(true);
  });

  test('technician jobs list loads', async () => {
    const page = pageForAudit();
    await page.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/jobs');
  });

  test('technician map page loads (geolocation granted)', async () => {
    const page = pageForAudit();
    await page.goto('/technician/map', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000);
    await assertHealthy(page, 'technician/map');
    const mapContainer = page.locator('[class*="map"], [id*="map"], #map, .leaflet-container, [data-testid*="map"]').first();
    await mapContainer.isVisible({ timeout: 10_000 }).catch(() => false);
    const body = await page.locator('body').innerText();
    expect(body, 'Map page must not crash').not.toMatch(CRASH_PATTERN);
  });

  test('technician history page loads', async () => {
    const page = pageForAudit();
    await page.goto('/technician/history', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/history');
  });

  test('technician HR/duty page loads', async () => {
    const page = pageForAudit();
    await page.goto('/technician/hr', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/hr');
  });

  test('technician profile page loads', async () => {
    const page = pageForAudit();
    await page.goto('/technician/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/profile');
  });

  test('technician chat page loads', async () => {
    const page = pageForAudit();
    await page.goto('/technician/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/chat');
  });

  test('technician AR/EN language switch works', async () => {
    const page = pageForAudit();
    await page.goto('/technician/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);

    const langBtn = page.getByTestId('technician-language-toggle');
    await expect(langBtn, 'Language toggle must be visible in technician shell').toBeVisible({ timeout: 10_000 });
    await langBtn.click();
    await page.waitForTimeout(1_200);

    const afterText = await page.locator('body').innerText({ timeout: 10_000 });
    expect(afterText.trim().length, 'Content must render after language switch').toBeGreaterThan(0);
    expect(afterText, 'No crash after language switch').not.toMatch(CRASH_PATTERN);

    await page.getByTestId('technician-language-toggle').click();
    await page.waitForTimeout(500);
  });
});
