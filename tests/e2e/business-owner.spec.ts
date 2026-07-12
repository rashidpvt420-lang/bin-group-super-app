/**
 * business-owner.spec.ts
 * Deep E2E business flow for the Owner role.
 * Verifies: owner onboarding reaches a real UAE quote estimate using the current onboarding flow.
 */
import { test, expect, Page } from '@playwright/test';
import { installAppCheckDebugToken, assertAppCheckDebugTokenInPage, collectAppCheckFailures, attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

async function clickFirstVisible(page: Page, selectors: string[], timeout = 15000) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 2500 }).catch(() => false)) {
      await expect(target).toBeEnabled({ timeout });
      await target.click();
      return;
    }
  }
  throw new Error(`No visible clickable target found for: ${selectors.join(' | ')}`);
}

async function fillByLabelOrSelector(page: Page, labels: RegExp[], selectors: string[], value: string) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);
  await page.waitForFunction(() => {
    const inputs = Array.from(document.querySelectorAll('input:not([type="file"]):not([type="hidden"]), textarea'));
    return inputs.some((el: any) => el.offsetParent !== null || (el.offsetWidth > 0 && el.offsetHeight > 0));
  }, { timeout: 45_000 });

  for (const label of labels) {
    const target = page.getByLabel(label).first();
    if (await target.isVisible({ timeout: 2500 }).catch(() => false)) {
      await target.fill(value);
      return;
    }
  }

  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 2500 }).catch(() => false)) {
      await target.fill(value);
      return;
    }
  }

  const diagnostics = await page.evaluate(() => ({
    href: window.location.href,
    title: document.title,
    bodyPreview: document.body?.innerText?.slice(0, 700),
    inputs: Array.from(document.querySelectorAll('input, textarea')).map((input: any) => ({
      type: input.type,
      name: input.name,
      id: input.id,
      placeholder: input.placeholder,
      ariaLabel: input.getAttribute('aria-label'),
      testId: input.getAttribute('data-testid'),
      visible: !!(input.offsetWidth || input.offsetHeight || input.getClientRects().length),
    })),
  }));

  throw new Error(`Unable to fill ${value}; labels=${labels.map(String).join(', ')} selectors=${selectors.join(', ')} diagnostics=${JSON.stringify(diagnostics)}`);
}

async function fillCoordinate(page: Page, testId: string, value: string) {
  const input = page.getByTestId(testId);
  await expect(input).toBeVisible({ timeout: 15_000 });
  await input.fill(value);
  await input.blur();
  await expect(input).toHaveValue(value, { timeout: 10_000 });
}

test.describe('Owner Business Workflow', () => {
  test.beforeEach(async ({ page }) => {
    const __appCheckMonitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = __appCheckMonitor;
    await __appCheckMonitor.assertTokenFingerprint();
  });
  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('Owner can navigate to onboarding and generate a quote', async ({ page, context }) => {
    test.setTimeout(120000);

    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ longitude: 55.2708, latitude: 25.2048 });
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
    await page.waitForSelector('input, textarea', { timeout: 45_000 });

    await fillByLabelOrSelector(page, [/Company \/ Owner name/i, /Owner name/i, /Company/i], ['input[type="text"] >> nth=0', 'input >> nth=0'], 'E2E Owner Corp');
    await fillByLabelOrSelector(page, [/Trade license/i, /Emirates ID/i], ['input[type="text"] >> nth=1', 'input >> nth=1'], 'TL-E2E-100');
    await fillByLabelOrSelector(page, [/Contact name/i], ['input[type="text"] >> nth=2', 'input >> nth=2'], 'E2E Contact');
    await fillByLabelOrSelector(page, [/Contact phone/i, /Phone/i], ['input[type="text"] >> nth=3', 'input[type="tel"]', 'input >> nth=3'], '+971501112224');
    await fillByLabelOrSelector(page, [/Contact email/i, /Email/i], ['input[type="email"]', 'input[type="text"] >> nth=4', 'input >> nth=4'], email);

    await clickFirstVisible(page, ['button:has-text("Continue to Asset Profile")', 'button:has-text("Continue")']);
    await expect(page.locator('body')).toContainText(/Asset Profile|Asset type/i, { timeout: 15000 });

    await clickFirstVisible(page, ['text=Villa', 'text=/Villa/i']);
    await fillByLabelOrSelector(page, [/Units/i, /Wudu areas/i], ['input[type="number"] >> nth=0', 'input >> nth=0'], '1');
    await fillByLabelOrSelector(page, [/Floors/i], ['input[type="number"] >> nth=1', 'input >> nth=1'], '2');
    await fillByLabelOrSelector(page, [/Sq Ft/i, /sqft/i], ['input[type="number"] >> nth=2', 'input >> nth=2'], '3500');
    await fillByLabelOrSelector(page, [/Age/i], ['input[type="number"] >> nth=3', 'input >> nth=3'], '2');

    await clickFirstVisible(page, ['button:has-text("Continue")']);
    await expect(page.locator('body')).toContainText(/Property Location|Property Address/i, { timeout: 15000 });

    const addressInput = page.getByTestId('property-address-input');
    await expect(addressInput).toBeVisible({ timeout: 15_000 });
    await addressInput.fill('E2E Villa 45, Marina, Dubai');
    await addressInput.blur();
    await expect(addressInput).toHaveValue('E2E Villa 45, Marina, Dubai');

    await fillCoordinate(page, 'property-latitude-input', '25.2048');
    await fillCoordinate(page, 'property-longitude-input', '55.2708');

    const locationContinue = page.getByRole('button', { name: /^Continue$/i }).last();
    await expect(locationContinue, 'Property Location Continue must become enabled after valid address and coordinates').toBeEnabled({ timeout: 15_000 });
    await locationContinue.click();

    await expect(page.locator('body')).toContainText(/Systems Matrix|Systems & Add-ons|Systems/i, { timeout: 20_000 });
    await clickFirstVisible(page, ['button:has-text("Initialize Analysis")', 'button:has-text("Initialize System Analysis")', 'button:has-text("Continue")']);

    await expect(page.locator('body')).toContainText(/Commercial Service Plan|Quote Estimate|Contract model/i, { timeout: 20000 });
    await expect(page.locator('body')).toContainText(/Quote Estimate/i, { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/AED\s*[1-9][0-9,]*/i, { timeout: 10000 });
  });
});