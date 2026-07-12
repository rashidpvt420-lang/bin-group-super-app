/**
 * Authenticated production business proof for the Owner role.
 * No Firebase network mocking is allowed in this launch-critical suite.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, Page } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env.e2e');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const EMAIL = process.env.E2E_OWNER_EMAIL ?? '';
const PASSWORD = process.env.E2E_OWNER_PASSWORD ?? '';
const SEEDED_PROPERTY = 'E2E Live Role Tower';

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_OWNER_EMAIL/PASSWORD. Owner launch validation cannot be skipped for public release.');
  }
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.context().clearCookies();
  await page.goto(`/login?intendedRole=owner&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`/login?intendedRole=owner&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/owner/**', { timeout: 30_000 });
  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|identity fault|access denied/i,
    { timeout: 15_000 },
  );
}

async function expectSeededOwnerData(page: Page, context: string) {
  await expect(page.locator('body'), `${context} must render the production owner fixture`).toContainText(
    new RegExp(`${SEEDED_PROPERTY}|E2E-101|MAINTENANCE`, 'i'),
    { timeout: 30_000 },
  );
  await expect(page.locator('body')).not.toContainText(
    /no properties found|no active contract|dashboard locked|payment verification required|permission-denied/i,
    { timeout: 10_000 },
  );
}

test.describe('Owner Business Workflow', () => {
  test.beforeEach(async ({ page }) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = monitor;
    await monitor.assertTokenFingerprint();
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('Owner authenticates and sees the activated production portfolio', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/dashboard/, { timeout: 20_000 });
    await expectSeededOwnerData(page, 'owner dashboard');
    await expect(page.locator('body')).toContainText(/property|portfolio|asset|unit/i, { timeout: 20_000 });
  });

  test('Owner sees the active contract and financial controls for the same property', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/owner/contracts', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/contracts/, { timeout: 20_000 });
    await expectSeededOwnerData(page, 'owner contracts');
    await expect(page.locator('body')).toContainText(/active|contract|service/i, { timeout: 20_000 });

    await page.goto('/owner/financials', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/financials/, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(
      /permission-denied|missing or insufficient permissions|application error|minified react error/i,
      { timeout: 10_000 },
    );
    await expect(page.locator('body')).toContainText(/AED|payment|financial|invoice|billing/i, { timeout: 20_000 });
  });
});
