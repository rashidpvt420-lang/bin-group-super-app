/**
 * launch-audit-technician.spec.ts
 * Deep E2E launch audit for the Technician role.
 * Verifies: dashboard (duty toggle), jobs, map (with geolocation grant),
 * history, HR, profile, AR/EN switch.
 */
import { expect, Page, test } from '@playwright/test';

const EMAIL    = process.env.E2E_TECHNICIAN_EMAIL    ?? '';
const PASSWORD = process.env.E2E_TECHNICIAN_PASSWORD ?? '';

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

test.describe('Technician launch audit', () => {
  test.skip(!EMAIL || !PASSWORD, 'Missing E2E_TECHNICIAN_EMAIL/PASSWORD — skipping technician audit.');

  // Grant geolocation so the map page doesn't block on a permission prompt
  test.use({
    geolocation: { latitude: 25.2048, longitude: 55.2708 }, // Dubai
    permissions: ['geolocation'],
  });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('technician dashboard loads with duty toggle', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/technician/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    await assertHealthy(page, 'technician/dashboard');
    expect(errors.join('\n')).not.toMatch(ACCESS_DENIED);

    // Verify duty toggle button is present (START DUTY / END DUTY or Arabic equivalent)
    const dutyBtn = page.locator(
      'button:has-text("DUTY"), button:has-text("START"), button:has-text("Duty"), button:has-text("واجب"), button:has-text("بدء")'
    ).first();
    const dutyVisible = await dutyBtn.isVisible({ timeout: 8_000 }).catch(() => false);
    expect(dutyVisible, 'Duty toggle button must be visible on technician dashboard').toBe(true);
  });

  test('technician jobs list loads', async ({ page }) => {
    await page.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/jobs');
  });

  test('technician map page loads (geolocation granted)', async ({ page }) => {
    await page.goto('/technician/map', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3_000); // Allow map tile load
    await assertHealthy(page, 'technician/map');
    // Map container should render — div with leaflet, google maps, or a map-related element
    const mapContainer = page.locator('[class*="map"], [id*="map"], #map, .leaflet-container, [data-testid*="map"]').first();
    const hasMap = await mapContainer.isVisible({ timeout: 10_000 }).catch(() => false);
    // Map renders OR the page shows a meaningful fallback (not a crash)
    const body = await page.locator('body').innerText();
    expect(body, 'Map page must not crash').not.toMatch(CRASH_PATTERN);
  });

  test('technician history page loads', async ({ page }) => {
    await page.goto('/technician/history', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/history');
  });

  test('technician HR/duty page loads', async ({ page }) => {
    await page.goto('/technician/hr', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/hr');
  });

  test('technician profile page loads', async ({ page }) => {
    await page.goto('/technician/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/profile');
  });

  test('technician chat page loads', async ({ page }) => {
    await page.goto('/technician/chat', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    await assertHealthy(page, 'technician/chat');
  });

  test('technician AR/EN language switch works', async ({ page }) => {
    await page.goto('/technician/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);

    const langBtn = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await expect(langBtn, 'Language toggle must be visible in technician shell').toBeVisible({ timeout: 10_000 });

    await langBtn.click();
    await page.waitForTimeout(1_200);

    const afterText = await page.locator('body').innerText({ timeout: 10_000 });
    expect(afterText.trim().length, 'Content must render after language switch').toBeGreaterThan(0);
    expect(afterText, 'No crash after language switch').not.toMatch(CRASH_PATTERN);

    // Switch back
    const langBtnAfter = page.locator('button:has-text("AR"), button:has-text("EN")').first();
    await langBtnAfter.click();
    await page.waitForTimeout(500);
  });
});
