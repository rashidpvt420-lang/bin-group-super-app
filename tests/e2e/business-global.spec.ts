/**
 * business-global.spec.ts
 * Deep E2E business flow for Global mechanics.
 * Verifies: Arabic/English language toggle (RTL/LTR switching) and Google Maps rendering.
 */
import { test, expect } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

test.describe('Global Platform Mechanics', () => {
  test.beforeEach(async ({ page }) => {
    const __appCheckMonitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = __appCheckMonitor;
    await __appCheckMonitor.assertTokenFingerprint();
  });

  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    // Global mechanics are public-route checks; still fail on App Check/429, but do not require an authenticated Firebase read.
    monitor.assertClean(test.info().title);
  });

  test('Arabic/English language toggle switches RTL/LTR mode', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body', { timeout: 20_000 });

    // Dismiss a known optional overlay, but never bypass the language UI itself.
    const dismissSelectors = [
      'button:has-text("Accept")',
      'button:has-text("Close")',
      'button:has-text("Got it")',
      'button:has-text("Continue")',
      '[aria-label="Close"]',
      '[data-testid="modal-close"]',
    ];
    for (const selector of dismissSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1_500 }).catch(() => false)) {
        await button.click();
        await page.waitForTimeout(300);
        break;
      }
    }

    const languageToggle = page
      .locator('[data-testid="language-toggle"], button:has-text("AR"), button:has-text("العربية")')
      .first();
    await expect(languageToggle, 'The public language control is required and must be visible.').toBeVisible({ timeout: 10_000 });

    await languageToggle.click();
    await expect.poll(async () => {
      const htmlDir = await page.locator('html').getAttribute('dir');
      const bodyDir = await page.locator('body').getAttribute('dir');
      return htmlDir === 'rtl' || bodyDir === 'rtl';
    }, { timeout: 10_000, message: 'Selecting Arabic must switch the rendered document to RTL.' }).toBeTruthy();

    const englishToggle = page
      .locator('[data-testid="language-toggle"], button:has-text("EN"), button:has-text("English")')
      .first();
    await expect(englishToggle, 'The English language control must remain reachable after switching to Arabic.').toBeVisible({ timeout: 10_000 });
    await englishToggle.click();

    await expect.poll(async () => {
      const htmlDir = await page.locator('html').getAttribute('dir');
      const bodyDir = await page.locator('body').getAttribute('dir');
      return htmlDir === 'ltr' || bodyDir === 'ltr' || (!htmlDir && !bodyDir);
    }, { timeout: 10_000, message: 'Selecting English must restore LTR rendering.' }).toBeTruthy();
  });

  test('Google Maps integration loads successfully', async ({ page }) => {
    await page.goto('/contact', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/contact(?:[/?#]|$)/);

    const mapContainer = page
      .locator('.gm-style, iframe[src*="google.com/maps"], iframe[src*="maps.google"], [aria-roledescription="map"], [data-testid="contact-map"]')
      .first();
    await expect(mapContainer, 'The Contact page must render the production map UI.').toBeVisible({ timeout: 15_000 });

    const mapError = page.locator('.dismissButton, .gm-err-container, [data-testid="map-error"]');
    await expect(mapError, 'Google Maps must load without a visible provider or configuration error.').toHaveCount(0);
  });
});
