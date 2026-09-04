import { test, expect, type Page } from '@playwright/test';
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
      if (!target) continue;
      try {
        const json = JSON.parse(readFileSync(target, 'utf8'));
        if (!appUrl && json.appPreviewUrl) appUrl = json.appPreviewUrl;
        if (!adminUrl && json.adminPreviewUrl) adminUrl = json.adminPreviewUrl;
      } catch {
        // Keep looking for a valid staging deployment evidence file.
      }
    }
  }

  if (!appUrl || !adminUrl) {
    throw new Error(
      `Missing required staging URLs: STAGING_APP_URL='${appUrl}', STAGING_ADMIN_URL='${adminUrl}'. Cannot run real App Check proof.`,
    );
  }

  for (const [name, value] of [['STAGING_APP_URL', appUrl], ['STAGING_ADMIN_URL', adminUrl]] as const) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.web.app')) {
      throw new Error(`${name} must be an HTTPS Firebase staging Hosting URL, got '${value}'.`);
    }
    if (!parsed.hostname.startsWith('bin-group-staging')) {
      throw new Error(`${name} must target bin-group-staging, got '${parsed.hostname}'.`);
    }
  }

  return { appUrl, adminUrl };
}

type AppCheckEvidence = {
  enterpriseExchangeRequests: number;
  enterpriseExchangeStatuses: number[];
  debugExchangeRequests: number;
  recaptchaEnterpriseScriptRequests: number;
  appCheckConsoleErrors: string[];
};

async function verifyRealEnterpriseAppCheck(page: Page, url: string, surface: 'staff-app' | 'admin') {
  const evidence: AppCheckEvidence = {
    enterpriseExchangeRequests: 0,
    enterpriseExchangeStatuses: [],
    debugExchangeRequests: 0,
    recaptchaEnterpriseScriptRequests: 0,
    appCheckConsoleErrors: [],
  };

  page.on('request', (request) => {
    const requestUrl = request.url();
    if (requestUrl.includes('exchangeRecaptchaEnterpriseToken')) {
      evidence.enterpriseExchangeRequests += 1;
    }
    if (requestUrl.includes('exchangeDebugToken')) {
      evidence.debugExchangeRequests += 1;
    }
    if (/recaptcha\/(?:enterprise\/)?enterprise\.js/i.test(requestUrl)) {
      evidence.recaptchaEnterpriseScriptRequests += 1;
    }
  });

  page.on('response', (response) => {
    const responseUrl = response.url();
    if (responseUrl.includes('exchangeRecaptchaEnterpriseToken')) {
      evidence.enterpriseExchangeStatuses.push(response.status());
    }
  });

  page.on('console', (message) => {
    if (!['error', 'warning'].includes(message.type())) return;
    const text = message.text();
    if (/AppCheck|app-check|reCAPTCHA|invalid site key|invalid domain/i.test(text)) {
      evidence.appCheckConsoleErrors.push(text);
    }
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await expect(page.locator('body')).toBeVisible();

  // App Check's auto-refresh path should request an actual token shortly after
  // the production build initializes. We intentionally do not mock reCAPTCHA,
  // intercept Firebase, manufacture tokens, or call the exchange endpoint.
  await expect
    .poll(() => evidence.enterpriseExchangeStatuses.length, {
      timeout: 20_000,
      message: `${surface}: no real Firebase App Check Enterprise exchange response was observed`,
    })
    .toBeGreaterThan(0);

  const hasDebugTokenInWindow = await page.evaluate(() => {
    const globalWindow = window as typeof window & {
      FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown;
      self?: { FIREBASE_APPCHECK_DEBUG_TOKEN?: unknown };
    };
    return Boolean(
      globalWindow.FIREBASE_APPCHECK_DEBUG_TOKEN ||
      globalWindow.self?.FIREBASE_APPCHECK_DEBUG_TOKEN,
    );
  });

  expect(hasDebugTokenInWindow, `${surface}: debug App Check token must not be enabled`).toBe(false);
  expect(evidence.debugExchangeRequests, `${surface}: debug exchange endpoint must never be called`).toBe(0);
  expect(
    evidence.enterpriseExchangeRequests,
    `${surface}: expected at least one real exchangeRecaptchaEnterpriseToken request`,
  ).toBeGreaterThan(0);
  expect(
    evidence.enterpriseExchangeStatuses.some((status) => status >= 200 && status < 300),
    `${surface}: Firebase App Check Enterprise exchange did not return a 2xx response; statuses=${evidence.enterpriseExchangeStatuses.join(',')}`,
  ).toBe(true);
  expect(evidence.appCheckConsoleErrors, `${surface}: App Check/reCAPTCHA console errors detected`).toEqual([]);

  const successfulStatus = evidence.enterpriseExchangeStatuses.find((status) => status >= 200 && status < 300) ?? 0;
  console.log(`[LIVE APPCHECK ${surface}] provider=recaptcha-enterprise`);
  console.log(`[LIVE APPCHECK ${surface}] enterpriseExchangeRequests=${evidence.enterpriseExchangeRequests}`);
  console.log(`[LIVE APPCHECK ${surface}] enterpriseExchangeStatus=${successfulStatus}`);
  console.log(`[LIVE APPCHECK ${surface}] debugExchangeRequests=${evidence.debugExchangeRequests}`);
  console.log(`[LIVE APPCHECK ${surface}] recaptchaEnterpriseScriptRequests=${evidence.recaptchaEnterpriseScriptRequests}`);
  console.log(`[LIVE APPCHECK ${surface}] origin=${new URL(url).origin}`);
  console.log(`[LIVE APPCHECK ${surface}] tokenExchangeVerified=true`);
}

test.describe('Real Enterprise App Check fail-closed staging proof', () => {
  let appUrl = '';
  let adminUrl = '';

  test.beforeAll(() => {
    ({ appUrl, adminUrl } = resolveStagingUrls());
  });

  test('Staff App obtains a real reCAPTCHA Enterprise App Check token', async ({ page }) => {
    await verifyRealEnterpriseAppCheck(page, appUrl, 'staff-app');
  });

  test('Admin obtains a real reCAPTCHA Enterprise App Check token', async ({ page }) => {
    await verifyRealEnterpriseAppCheck(page, adminUrl, 'admin');
  });
});
