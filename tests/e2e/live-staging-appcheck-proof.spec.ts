import { test, expect } from '@playwright/test';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

function resolveStagingUrls() {
  let appUrl = process.env.STAGING_APP_URL || process.env.E2E_BASE_URL || '';
  let adminUrl = process.env.STAGING_ADMIN_URL || process.env.E2E_ADMIN_BASE_URL || '';

  if (!appUrl || !adminUrl) {
    const root = process.cwd();
    const dirs = readdirSync(root).filter((d) => d.startsWith('staff-os-staging-'));
    for (const dir of dirs) {
      const p1 = join(root, dir, 'staff-os-staging-deployment.json');
      const p2 = join(root, dir, dir, 'staff-os-staging-deployment.json');
      const target = existsSync(p1) ? p1 : existsSync(p2) ? p2 : null;
      if (target) {
        try {
          const json = JSON.parse(readFileSync(target, 'utf8'));
          if (!appUrl && json.appPreviewUrl) appUrl = json.appPreviewUrl;
          if (!adminUrl && json.adminPreviewUrl) adminUrl = json.adminPreviewUrl;
        } catch {
          // continue
        }
      }
    }
  }

  if (!appUrl || !adminUrl) {
    throw new Error(
      `Missing required Staging URLs: STAGING_APP_URL='${appUrl}', STAGING_ADMIN_URL='${adminUrl}'. Cannot run live App Check proof.`
    );
  }

  return { appUrl, adminUrl };
}

test.describe('Real Enterprise App Check Fail-Closed Staging Proof', () => {
  const { appUrl, adminUrl } = resolveStagingUrls();

  test('1. Verify Real Enterprise App Check Exchange on Staging App', async ({ page }) => {
    let enterpriseExchangeRequests = 0;
    let debugExchangeRequests = 0;
    let enterpriseExchangeStatus = 0;
    const appCheckConsoleErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        msg.type() === 'error' &&
        /AppCheck|app-check|reCAPTCHA|invalid site key|invalid domain|UNAUTHENTICATED|PERMISSION_DENIED/i.test(text)
      ) {
        appCheckConsoleErrors.push(text);
      }
    });

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('exchangeDebugToken')) {
        debugExchangeRequests++;
      }
    });

    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('exchangeRecaptchaEnterpriseToken') || (url.includes('firebaseappcheck.googleapis.com') && url.includes('exchangeRecaptchaEnterpriseToken'))) {
        enterpriseExchangeRequests++;
        enterpriseExchangeStatus = res.status();
      }
    });

    console.log(`Navigating to live staging App: ${appUrl}`);
    await page.goto(appUrl, { waitUntil: 'networkidle', timeout: 60000 });

    // Assert body loaded cleanly
    await expect(page.locator('body')).toBeVisible();

    // Verify NO debug token in page context
    const hasDebugTokenInWindow = await page.evaluate(() => {
      const g = window as any;
      return Boolean(g.FIREBASE_APPCHECK_DEBUG_TOKEN || g.self?.FIREBASE_APPCHECK_DEBUG_TOKEN);
    });

    expect(hasDebugTokenInWindow).toBe(false);
    expect(debugExchangeRequests).toBe(0);

    // Fail if App Check console errors occurred
    expect(appCheckConsoleErrors).toEqual([]);

    // Require Enterprise exchange request to have been made and succeeded
    expect(enterpriseExchangeRequests).toBeGreaterThanOrEqual(1);
    expect(enterpriseExchangeStatus).toBeGreaterThanOrEqual(200);
    expect(enterpriseExchangeStatus).toBeLessThan(300);

    const origin = new URL(appUrl).origin;
    console.log(`provider=recaptcha-enterprise`);
    console.log(`enterpriseExchangeRequests=${enterpriseExchangeRequests}`);
    console.log(`enterpriseExchangeStatus=${enterpriseExchangeStatus}`);
    console.log(`debugExchangeRequests=${debugExchangeRequests}`);
    console.log(`origin=${origin}`);
    console.log(`tokenExchangeVerified=true`);
  });

  test('2. Verify Real Enterprise App Check Exchange on Staging Admin Panel', async ({ page }) => {
    let enterpriseExchangeRequests = 0;
    let debugExchangeRequests = 0;
    let enterpriseExchangeStatus = 0;
    const appCheckConsoleErrors: string[] = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (
        msg.type() === 'error' &&
        /AppCheck|app-check|reCAPTCHA|invalid site key|invalid domain|UNAUTHENTICATED|PERMISSION_DENIED/i.test(text)
      ) {
        appCheckConsoleErrors.push(text);
      }
    });

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('exchangeDebugToken')) {
        debugExchangeRequests++;
      }
    });

    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('exchangeRecaptchaEnterpriseToken') || (url.includes('firebaseappcheck.googleapis.com') && url.includes('exchangeRecaptchaEnterpriseToken'))) {
        enterpriseExchangeRequests++;
        enterpriseExchangeStatus = res.status();
      }
    });

    console.log(`Navigating to live staging Admin: ${adminUrl}`);
    await page.goto(adminUrl, { waitUntil: 'networkidle', timeout: 60000 });

    await expect(page.locator('body')).toBeVisible();

    const hasDebugTokenInWindow = await page.evaluate(() => {
      const g = window as any;
      return Boolean(g.FIREBASE_APPCHECK_DEBUG_TOKEN || g.self?.FIREBASE_APPCHECK_DEBUG_TOKEN);
    });

    expect(hasDebugTokenInWindow).toBe(false);
    expect(debugExchangeRequests).toBe(0);

    expect(appCheckConsoleErrors).toEqual([]);

    expect(enterpriseExchangeRequests).toBeGreaterThanOrEqual(1);
    expect(enterpriseExchangeStatus).toBeGreaterThanOrEqual(200);
    expect(enterpriseExchangeStatus).toBeLessThan(300);

    const origin = new URL(adminUrl).origin;
    console.log(`provider=recaptcha-enterprise`);
    console.log(`enterpriseExchangeRequests=${enterpriseExchangeRequests}`);
    console.log(`enterpriseExchangeStatus=${enterpriseExchangeStatus}`);
    console.log(`debugExchangeRequests=${debugExchangeRequests}`);
    console.log(`origin=${origin}`);
    console.log(`tokenExchangeVerified=true`);
  });
});
