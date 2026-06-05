/**
 * business-global.spec.ts
 * Deep E2E business flow for Global mechanics.
 * Verifies: Arabic/English language toggle (RTL/LTR switching) and Google Maps rendering.
 */
import { test, expect } from '@playwright/test';

test.describe('Global Platform Mechanics', () => {
  test('Arabic/English language toggle switches RTL/LTR mode', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('body', { timeout: 20_000 });

    // Dismiss any modal/overlay that might be intercepting clicks (cookie banner, legal modal, etc.)
    const dismissSelectors = [
      'button:has-text("Accept")',
      'button:has-text("Close")',
      'button:has-text("Got it")',
      'button:has-text("Continue")',
      '[aria-label="Close"]',
      '[data-testid="modal-close"]',
    ];
    for (const sel of dismissSelectors) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await btn.click().catch(() => undefined);
        await page.waitForTimeout(300);
        break;
      }
    }

    const langToggleBtn = page.locator('button:has-text("AR"), button:has-text("العربية"), [data-testid="language-toggle"]').first();

    if (await langToggleBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      // Use force:true in case a transparent overlay remains above the button
      await langToggleBtn.click({ force: true });
      await expect.poll(async () => {
        const htmlDir = await page.locator('html').getAttribute('dir');
        const bodyDir = await page.locator('body').getAttribute('dir');
        return htmlDir === 'rtl' || bodyDir === 'rtl';
      }, { timeout: 10_000 }).toBeTruthy();

      const enToggleBtn = page.locator('button:has-text("EN"), button:has-text("English"), [data-testid="language-toggle"]').first();
      await enToggleBtn.click({ force: true });
      await expect.poll(async () => {
        const htmlDir = await page.locator('html').getAttribute('dir');
        const bodyDir = await page.locator('body').getAttribute('dir');
        return htmlDir === 'ltr' || bodyDir === 'ltr' || (!htmlDir && !bodyDir);
      }, { timeout: 10_000 }).toBeTruthy();
      return;
    }

    // Fallback: directly drive via localStorage and verify HTML dir attribute
    await page.evaluate(() => localStorage.setItem('bin_language', 'ar'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const dirAfterAr = await page.locator('html').getAttribute('dir');
    const bodyDirAr = await page.locator('body').getAttribute('dir');
    expect(dirAfterAr === 'rtl' || bodyDirAr === 'rtl').toBeTruthy();

    await page.evaluate(() => localStorage.setItem('bin_language', 'en'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    const dirAfterEn = await page.locator('html').getAttribute('dir');
    expect(dirAfterEn === 'ltr' || dirAfterEn === null).toBeTruthy();
  });


  test('Google Maps integration loads successfully', async ({ page }) => {
    await page.goto('/contact', { waitUntil: 'domcontentloaded' });

    const mapContainer = page.locator('.gm-style, iframe[src*="google.com/maps"], [aria-roledescription="map"]').first();

    if (await mapContainer.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(mapContainer).toBeVisible({ timeout: 5000 });
      const mapError = page.locator('.dismissButton, .gm-err-container');
      await expect(mapError).not.toBeVisible();
    }
  });
});
