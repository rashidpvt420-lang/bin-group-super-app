/**
 * business-broker.spec.ts
 * Deep E2E business flow for the Broker role.
 * Verifies: authenticated broker identity, lead attribution, and commission visibility.
 */
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, Page } from '@playwright/test';
import { installAppCheckDebugToken, assertAppCheckDebugTokenInPage, collectAppCheckFailures, attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env.e2e');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const EMAIL = process.env.E2E_BROKER_EMAIL ?? '';
const PASSWORD = process.env.E2E_BROKER_PASSWORD ?? '';

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_BROKER_EMAIL/PASSWORD. Broker launch validation cannot be skipped for public release.');
  }
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/broker/dashboard', { timeout: 20_000 });

  const identitySpinner = page.getByText(/Authenticating BIN-Groups Identity/i).first();
  await expect(
    identitySpinner,
    'Broker identity must resolve. Seed/repair the broker Auth role claim and users/{uid} profile when this remains visible.'
  ).toBeHidden({ timeout: 15_000 });

  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|identity fault|role authorization error/i,
    { timeout: 10_000 },
  );
}

test.describe('Broker Business Workflow', () => {
  test.beforeEach(async ({ page }) => {
    const __appCheckMonitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = __appCheckMonitor;
    await __appCheckMonitor.assertTokenFingerprint();
    await login(page);
  });
  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });


  test('Broker can submit an attributed property lead and view commissions', async ({ page }) => {
    test.setTimeout(100_000);
    const uniqueLead = `E2E Lead ${Date.now()}`;

    await page.goto('/broker/leads/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });

    const clientName = page.getByTestId('broker-lead-client-name');
    await expect(clientName).toBeVisible({ timeout: 15_000 });
    await clientName.fill(uniqueLead);

    await page.getByLabel(/Phone Number/i).fill('+971501234567');
    await page.getByLabel(/Email Address/i).fill(`broker-e2e-${Date.now()}@example.com`);
    await page.getByLabel(/Property Interest|Requirement/i).fill('Full maintenance and property management for an E2E staging villa');
    await page.getByLabel(/Location|Emirate/i).fill('Al Ain');
    await page.getByLabel(/Budget Range/i).fill('50000');
    await page.getByLabel(/Mission Notes/i).fill('Credentialed staging verification of broker attribution and lead creation.');

    const submit = page.getByTestId('broker-lead-submit');
    await expect(submit).toBeEnabled({ timeout: 10_000 });
    await submit.click();

    await expect(page.getByText(/Lead recorded with attribution/i)).toBeVisible({ timeout: 25_000 });
    const createdLeadCard = page.getByTestId('broker-lead-card').filter({ hasText: uniqueLead }).first();
    await expect(createdLeadCard).toBeVisible({ timeout: 20_000 });
    await expect(createdLeadCard).toContainText(/ATTRIBUTION|broker_lead_/i, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|Lead could not be submitted/i, { timeout: 5_000 });

    await page.goto('/broker/commissions', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });
    await expect(page.getByText(/Finance & Payouts/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/PENDING SETTLEMENT|APPROVED FOR PAYOUT|LIFETIME EARNED/i, { timeout: 15_000 });
  });
});
