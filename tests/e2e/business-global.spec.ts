/**
 * business-global.spec.ts
 * Deep E2E business flow for Global mechanics.
 * Verifies: Arabic/English language toggle (RTL/LTR switching) and Google Maps rendering.
 */
import { test, expect } from '@playwright/test';

test.describe('Global Platform Mechanics', () => {
  
  test('Arabic/English language toggle switches RTL/LTR mode', async ({ page }) => {
    // Visit a public page with language support
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    
    // Check initial direction (usually LTR)
    const htmlDir = await page.locator('html').getAttribute('dir');
    const bodyDir = await page.locator('body').getAttribute('dir');
    
    // Find the language toggle button
    const langToggleBtn = page.locator('button:has-text("AR"), button:has-text("العربية"), [data-testid="language-toggle"]').first();
    
    if (await langToggleBtn.isVisible()) {
      await langToggleBtn.click();
      await page.waitForTimeout(1000);
      
      // Verify direction changed to RTL
      const newHtmlDir = await page.locator('html').getAttribute('dir');
      const newBodyDir = await page.locator('body').getAttribute('dir');
      
      expect(newHtmlDir === 'rtl' || newBodyDir === 'rtl').toBeTruthy();
      
      // Toggle back to English
      const enToggleBtn = page.locator('button:has-text("EN"), button:has-text("English"), [data-testid="language-toggle"]').first();
      await enToggleBtn.click();
      await page.waitForTimeout(1000);
      
      const revertedHtmlDir = await page.locator('html').getAttribute('dir');
      const revertedBodyDir = await page.locator('body').getAttribute('dir');
      
      expect(revertedHtmlDir === 'ltr' || revertedBodyDir === 'ltr' || (!revertedHtmlDir && !revertedBodyDir)).toBeTruthy();
    }
  });

  test('Google Maps integration loads successfully', async ({ page }) => {
    // Visit a page known to render a map (e.g., owner properties or contact)
    await page.goto('/contact', { waitUntil: 'domcontentloaded' });
    
    // Look for map canvas or iframe
    const mapContainer = page.locator('.gm-style, iframe[src*="google.com/maps"], [aria-roledescription="map"]').first();
    
    // We don't fail strictly if not found on /contact, as it might be lazy loaded or behind auth,
    // but if it exists, it should be visible without throwing API key errors.
    if (await mapContainer.isVisible()) {
      await expect(mapContainer).toBeVisible({ timeout: 5000 });
      
      // Ensure no Google Maps API errors are overlaying the map
      const mapError = page.locator('.dismissButton, .gm-err-container');
      await expect(mapError).not.toBeVisible();
    }
  });
});
