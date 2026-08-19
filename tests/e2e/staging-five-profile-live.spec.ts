import { test, expect } from '@playwright/test';
import {
  adminUrl,
  loginAdminPanel,
  loginMainRole,
  requireEnv,
  waitForAdminLoader,
} from './helpers/profileReadiness';

const ACCESS_FAILURE = /permission-denied|missing or insufficient permissions|unauthenticated|auth\/invalid-credential|SOVEREIGN_FAILURE/i;
const CRASH = /application error|unhandled runtime error|chunkloaderror|minified react error/i;

function assertStagingUrl(name: string, raw: string) {
  const parsed = new URL(raw);
  expect(parsed.protocol, `${name} must be HTTPS`).toBe('https:');
  expect(parsed.hostname, `${name} must target isolated staging Hosting`).toMatch(/^bin-group-staging.*\.web\.app$/);
  expect(parsed.hostname, `${name} must never target production`).not.toContain('bin-group-57c60');
}

test.describe('BIN GROUP staging authenticated five-profile live gate', () => {
  test.beforeAll(() => {
    assertStagingUrl('E2E_BASE_URL', requireEnv('E2E_BASE_URL'));
    assertStagingUrl('E2E_ADMIN_BASE_URL', requireEnv('E2E_ADMIN_BASE_URL'));

    const requiredStagingEmails = [
      requireEnv('E2E_ADMIN_EMAIL'),
      requireEnv('E2E_OWNER_MAILBOX_EMAIL'),
      requireEnv('E2E_TENANT_EMAIL'),
      requireEnv('E2E_TECHNICIAN_EMAIL'),
      requireEnv('E2E_BROKER_MAILBOX_EMAIL'),
    ];
    for (const email of requiredStagingEmails) {
      expect(email.toLowerCase(), 'Live staging E2E must use staging-only identities').toMatch(/^e2e-staging-.*@bingroup\.com$/);
    }
  });

  test('Owner authenticates and reaches the staging owner dashboard', async ({ page }) => {
    await loginMainRole(page, 'owner', requireEnv('E2E_OWNER_MAILBOX_EMAIL'), requireEnv('E2E_OWNER_PASSWORD'));
    await expect(page).toHaveURL(/\/owner\/dashboard/);
    await expect(page.locator('body')).not.toContainText(ACCESS_FAILURE);
    await expect(page.locator('body')).not.toContainText(CRASH);
    await expect(page.locator('body')).toContainText(/property|portfolio|contract|dashboard/i, { timeout: 20_000 });
  });

  test('Tenant authenticates and reaches the linked maintenance request surface', async ({ page }) => {
    await loginMainRole(page, 'tenant', requireEnv('E2E_TENANT_EMAIL'), requireEnv('E2E_TENANT_PASSWORD'));
    await page.goto('/tenant/request', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(ACCESS_FAILURE);
    await expect(page.locator('body')).not.toContainText(CRASH);
    await expect(page.locator('body')).toContainText(/maintenance|request|service|residence/i, { timeout: 20_000 });
  });

  test('Technician authenticates and reaches assigned/open staging jobs', async ({ page }) => {
    await loginMainRole(page, 'technician', requireEnv('E2E_TECHNICIAN_EMAIL'), requireEnv('E2E_TECHNICIAN_PASSWORD'));
    await page.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(ACCESS_FAILURE);
    await expect(page.locator('body')).not.toContainText(CRASH);
    await expect(page.locator('body')).toContainText(/job|mission|assignment|open job pool/i, { timeout: 20_000 });
  });

  test('Broker authenticates and reaches broker-only navigation', async ({ page }) => {
    await loginMainRole(page, 'broker', requireEnv('E2E_BROKER_MAILBOX_EMAIL'), requireEnv('E2E_BROKER_PASSWORD'));
    await page.goto('/broker/leads', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(ACCESS_FAILURE);
    await expect(page.locator('body')).not.toContainText(CRASH);
    await expect(page.locator('body')).toContainText(/lead|broker|referral|client/i, { timeout: 20_000 });
  });

  test('Admin authenticates without redirect loop and loads the Admin dashboard', async ({ page }) => {
    await loginAdminPanel(page, requireEnv('E2E_ADMIN_EMAIL'), requireEnv('E2E_ADMIN_PASSWORD'));
    await waitForAdminLoader(page);
    await expect(page).toHaveURL(new RegExp(`${adminUrl('/dashboard').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[/?#]|$)`));
    await expect(page.locator('body')).not.toContainText(ACCESS_FAILURE);
    await expect(page.locator('body')).not.toContainText(CRASH);
    await expect(page.locator('body')).toContainText(/admin|dashboard|operations|contracts|users/i, { timeout: 20_000 });
  });

  test('Unauthenticated access cannot enter the Admin dashboard', async ({ page }) => {
    await page.goto(adminUrl('/dashboard'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_000);
    expect(page.url()).toMatch(/\/login(?:[/?#]|$)/);
  });
});
