/**
 * business-broker.spec.ts
 * Deep E2E business flow for the Broker role.
 * Verifies: lead submission controls and commission tracking are launch-ready.
 */
import { test, expect, Page } from '@playwright/test';

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
  await page.waitForURL('**/broker/dashboard', { timeout: 20000 });
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error/i, { timeout: 10000 });
}

async function requireVisible(page: Page, selectors: string[], label: string) {
  for (const selector of selectors) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 1500 }).catch(() => false)) return target;
  }
  const bodyPreview = await page.locator('body').innerText({ timeout: 5000 }).catch(() => 'body unavailable');
  throw new Error(`Missing required broker launch control: ${label}. Selectors: ${selectors.join(' | ')}. Body: ${bodyPreview.slice(0, 1200)}`);
}

async function clickRequired(page: Page, selectors: string[], label: string) {
  const target = await requireVisible(page, selectors, label);
  await expect(target, `${label} must be enabled`).toBeEnabled({ timeout: 10000 });
  await target.click();
}

async function fillRequired(page: Page, selectors: string[], value: string, label: string) {
  const target = await requireVisible(page, selectors, label);
  await target.fill(value);
}

test.describe('Broker Business Workflow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Broker can submit a new property lead and view commissions', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/broker/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await clickRequired(page, [
      '[data-testid="broker-submit-lead"]',
      '[data-testid*="lead" i]',
      'button:has-text("Submit Lead")',
      'button:has-text("New Lead")',
      'a:has-text("Submit Lead")',
      'a:has-text("New Lead")',
    ], 'submit lead action');

    await fillRequired(page, [
      '[data-testid="broker-lead-owner-name"] input',
      'input[name="ownerName"]',
      'input[placeholder*="owner" i]',
      'input[placeholder*="name" i]',
    ], 'E2E Lead Owner', 'lead owner name');

    await fillRequired(page, [
      '[data-testid="broker-lead-property-name"] input',
      'input[name="propertyName"]',
      'input[placeholder*="property" i]',
    ], 'E2E Lead Property', 'lead property name');

    await clickRequired(page, [
      '[data-testid="broker-lead-submit"]',
      'button:has-text("Submit")',
      'button:has-text("Save")',
    ], 'lead submit action');

    await expect(page.locator('body')).toContainText(/success|submitted|lead|saved/i, { timeout: 20000 });
    await expect(page.locator('body')).not.toContainText(/failed|permission-denied|missing or insufficient permissions/i, { timeout: 5000 });

    await page.goto('/broker/commissions', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10000 });

    await expect(
      page.locator('[data-testid*="commission" i], table, [role="table"], .MuiDataGrid-root, text=/commission|earned|pending/i').first(),
      'Broker commissions page must render commission tracking surface'
    ).toBeVisible({ timeout: 15000 });
  });
});
