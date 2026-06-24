import { expect, Page, test } from '@playwright/test';

const fatalLaunchText = /404|page not found|application error|unhandled runtime error|chunkloaderror|minified react error|sovereign connection timeout|failed to fetch dynamically imported module/i;
const allowedConsoleNoise = /favicon|devtools|content security policy.*font|analytics|ResizeObserver loop limit exceeded/i;

async function expectStablePublicPage(page: Page, routeName: string) {
  await expect(page.locator('body'), `${routeName} body should be visible`).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('body'), `${routeName} should not show a fatal launch failure`).not.toContainText(fatalLaunchText, { timeout: 20_000 });
  const text = await page.locator('body').innerText({ timeout: 20_000 });
  expect(text.trim().length, `${routeName} should render visible text`).toBeGreaterThan(0);
}

async function openAndVerify(page: Page, route: string, expectedText: RegExp) {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (!allowedConsoleNoise.test(text)) consoleErrors.push(text);
  });

  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), `${route} should not return HTTP 5xx`).toBeLessThan(500);
  await expectStablePublicPage(page, route);
  await expect(page.locator('body'), `${route} should expose expected launch text`).toContainText(expectedText, { timeout: 30_000 });

  const fatalErrors = consoleErrors.filter((error) => fatalLaunchText.test(error));
  expect(fatalErrors, `${route} should not emit fatal console errors`).toEqual([]);
}

test.describe('production public launch routes', () => {
  test('public marketing, login, onboarding, support, and contact routes render', async ({ page }) => {
    await openAndVerify(page, '/', /BIN|GROUP|Property|Operations/i);
    await openAndVerify(page, '/login', /login|email|password|identity|portal/i);
    await expect(page.locator('input[type="email"], input[name*="email" i], [data-testid="login-email"]').first(), 'login email input should be visible').toBeVisible({ timeout: 20_000 });
    await expect(page.locator('input[type="password"], input[name*="password" i], [data-testid="login-password"]').first(), 'login password input should be visible').toBeVisible({ timeout: 20_000 });

    await openAndVerify(page, '/onboarding', /Company|Owner|Asset|Property|Onboarding/i);
    await expect(page.locator('input:not([type="hidden"]), textarea').first(), 'onboarding should expose an intake input').toBeVisible({ timeout: 30_000 });

    await openAndVerify(page, '/support', /support|help|contact|emergency/i);
    await openAndVerify(page, '/contact', /contact|support|ceo|bin/i);
  });

  test('public invoice and certificate verification entry routes render without IDs', async ({ page }) => {
    await openAndVerify(page, '/verify', /invoice|contract|verification|hash|registry/i);
    await expect(page.locator('input[aria-label="Invoice or Contract Hash Identifier"], input[title="Invoice or Contract Hash Identifier"]').first(), 'invoice verifier hash input should be visible').toBeVisible({ timeout: 20_000 });

    await openAndVerify(page, '/verify-cert', /certificate|verification|registry|identifier/i);
    await expect(page.locator('input[aria-label="Certificate Identifier"], input[title="Certificate Identifier"]').first(), 'certificate verifier input should be visible').toBeVisible({ timeout: 20_000 });
  });

  test('public invoice and certificate deep-link routes render with IDs', async ({ page }) => {
    await openAndVerify(page, '/verify/invoice/e2e-invalid-proof-hash', /invoice|contract|verification|hash|registry|invalid/i);
    await openAndVerify(page, '/verify/cert/e2e-invalid-cert-id', /certificate|verification|registry|identifier|invalid/i);
    await openAndVerify(page, '/verify-cert/e2e-invalid-cert-id', /certificate|verification|registry|identifier|invalid/i);
  });

  test('standalone admin portal exposes only the protected authentication shell publicly', async ({ page }) => {
    const adminBaseUrl = process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app';
    const response = await page.goto(adminBaseUrl, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), 'admin portal root should not return HTTP 5xx').toBeLessThan(500);
    await expectStablePublicPage(page, 'admin portal root');
    await expect(page.locator('body'), 'admin portal should expose auth shell, not raw dashboard data').toContainText(/authenticating|sovereign identity|login|admin/i, { timeout: 30_000 });
    await expect(page.locator('body'), 'admin portal should not expose dashboard data before authentication').not.toContainText(/owner revenue|tenant records|payment approvals|audit log entries|technician payroll/i, { timeout: 10_000 });
  });
});
