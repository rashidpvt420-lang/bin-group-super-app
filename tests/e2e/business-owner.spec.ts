/**
 * business-owner.spec.ts
 * Deep E2E business flow for the Owner role.
 * Verifies: owner onboarding reaches a real UAE quote estimate using the current onboarding flow.
 */
import { test, expect, Page } from '@playwright/test';

async function clickFirstVisible(page: Page, selectors: string[], timeout = 15000) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 1500 }).catch(() => false)) {
      await expect(target).toBeEnabled({ timeout });
      await target.click();
      return;
    }
  }
  throw new Error(`No visible clickable target found for: ${selectors.join(' | ')}`);
}

async function fillByLabelOrSelector(page: Page, labels: RegExp[], selectors: string[], value: string) {
  for (const label of labels) {
    const target = page.getByLabel(label).first();
    if (await target.isVisible({ timeout: 1000 }).catch(() => false)) {
      await target.fill(value);
      return;
    }
  }

  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 1000 }).catch(() => false)) {
      await target.fill(value);
      return;
    }
  }

  throw new Error(`Unable to fill ${value}; labels=${labels.map(String).join(', ')} selectors=${selectors.join(', ')}`);
}

test.describe('Owner Business Workflow', () => {
  test('Owner can navigate to onboarding and generate a quote', async ({ page, context }) => {
    test.setTimeout(120000);

    await context.grantPermissions(['geolocation']);
    await page.setViewportSize({ width: 1440, height: 1300 });

    await page.route('**/*.googleapis.com/**', async route => {
      const url = route.request().url();
      if (url.includes('firebasestorage.googleapis.com/v0/b/')) {
        const nameParam = new URL(url).searchParams.get('name') || 'dummy.pdf';
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            name: nameParam,
            bucket: 'bin-group-57c60.firebasestorage.app',
            downloadTokens: 'e2e-mock-token-12345',
            contentType: 'application/pdf',
            size: '1000',
            updated: new Date().toISOString(),
          }),
        });
        return;
      }

      const reqHeaders = { ...route.request().headers() };
      delete reqHeaders.referer;
      delete reqHeaders.Referer;
      await route.continue({ headers: { ...reqHeaders, referer: 'https://bin-group-57c60.web.app/' } });
    });

    page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));

    const email = `e2e-owner-${Date.now()}@bin-groups.com`;

    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      localStorage.removeItem('bin-group-onboarding-v3');
      localStorage.removeItem('bin_migration_v4_legacy_onboarding_cleanup_done');
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/.*onboarding.*/);
    await expect(page.locator('body')).not.toContainText(/SOVEREIGN CONNECTION TIMEOUT|permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await fillByLabelOrSelector(page, [/Company \/ Owner name/i, /Owner name/i, /Company/i], ['input[type="text"] >> nth=0'], 'E2E Owner Corp');
    await fillByLabelOrSelector(page, [/Trade license/i, /Emirates ID/i], ['input[type="text"] >> nth=1'], 'TL-E2E-100');
    await fillByLabelOrSelector(page, [/Contact name/i], ['input[type="text"] >> nth=2'], 'E2E Contact');
    await fillByLabelOrSelector(page, [/Contact phone/i, /Phone/i], ['input[type="text"] >> nth=3'], '+971501112224');
    await fillByLabelOrSelector(page, [/Contact email/i, /Email/i], ['input[type="email"]', 'input[type="text"] >> nth=4'], email);

    await clickFirstVisible(page, ['button:has-text("Continue to Asset Profile")', 'button:has-text("Continue")']);
    await expect(page.locator('body')).toContainText(/Asset Profile|Asset type/i, { timeout: 15000 });

    await clickFirstVisible(page, ['text=Villa', 'text=/Villa/i']);
    await fillByLabelOrSelector(page, [/Units/i, /Wudu areas/i], ['input[type="number"] >> nth=0'], '1');
    await fillByLabelOrSelector(page, [/Floors/i], ['input[type="number"] >> nth=1'], '2');
    await fillByLabelOrSelector(page, [/Sq Ft/i, /sqft/i], ['input[type="number"] >> nth=2'], '3500');
    await fillByLabelOrSelector(page, [/Age/i], ['input[type="number"] >> nth=3'], '2');

    await clickFirstVisible(page, ['button:has-text("Continue")']);
    await expect(page.locator('body')).toContainText(/Property Location|Property Address/i, { timeout: 15000 });

    await fillByLabelOrSelector(page, [/Address/i, /Property Address/i], ['[data-testid="property-address-input"]', 'input[name="address"]'], 'E2E Villa 45, Marina, Dubai');
    await fillByLabelOrSelector(page, [/Latitude/i], ['[data-testid="property-latitude-input"]', 'input[name="latitude"]'], '25.2048');
    await fillByLabelOrSelector(page, [/Longitude/i], ['[data-testid="property-longitude-input"]', 'input[name="longitude"]'], '55.2708');
    await clickFirstVisible(page, ['button:has-text("Save Coordinates")', 'button:has-text("Continue")']);
    if (await page.locator('text=Property Location').isVisible({ timeout: 1000 }).catch(() => false)) {
      await clickFirstVisible(page, ['button:has-text("Continue")']);
    }

    await expect(page.locator('body')).toContainText(/Systems Matrix|Systems & Add-ons|Systems/i, { timeout: 15000 });
    await clickFirstVisible(page, ['button:has-text("Initialize Analysis")', 'button:has-text("Initialize System Analysis")', 'button:has-text("Continue")']);

    await expect(page.locator('body')).toContainText(/Commercial Service Plan|Quote Estimate|Contract model/i, { timeout: 20000 });
    await expect(page.locator('body')).toContainText(/Quote Estimate/i, { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/AED\s*[1-9][0-9,]*/i, { timeout: 10000 });
  });
});
