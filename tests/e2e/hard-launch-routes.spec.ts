import { expect, Page, test } from '@playwright/test';

type RoleName = 'admin' | 'owner' | 'tenant' | 'technician' | 'broker';

const criticalRoutes: Record<RoleName, string[]> = {
  admin: [
    '/admin/dashboard',
    '/admin/payments',
    '/admin/building-registry',
    '/admin/properties/registry',
    '/admin/property-passports',
    '/admin/contracts',
    '/admin/tickets',
    '/admin/technicians/map',
  ],
  owner: [
    '/owner/dashboard',
    '/owner/activation',
    '/owner/contracts',
    '/owner/property-passport',
    '/owner/units',
    '/owner/tenants',
    '/owner/documents',
  ],
  tenant: [
    '/tenant/dashboard',
    '/tenant/unit',
    '/tenant/request',
    '/tenant/tickets',
    '/tenant/documents',
    '/tenant/profile',
  ],
  technician: [
    '/technician/dashboard',
    '/technician/jobs',
    '/technician/map',
    '/technician/history',
    '/technician/profile',
  ],
  broker: [
    '/broker/dashboard',
  ],
};

const routeFailureText = /404|not found|page not found|application error|unhandled runtime error|chunkloaderror|firebaseerror: missing|minified react error|permission-denied|access denied|not authorized/i;

async function expectNoRuntimeCrash(page: Page, route: string) {
  await expect(page.locator('body'), `${route} body should be visible`).toBeVisible({ timeout: 20_000 });
  const text = await page.locator('body').innerText({ timeout: 20_000 });
  expect(text.trim().length, `${route} should render visible text`).toBeGreaterThan(0);
  expect(text, `${route} should not render crash/access/failure text`).not.toMatch(routeFailureText);
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[autocomplete="email"]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i], input[autocomplete="current-password"]').first();
  await expect(emailInput).toBeVisible({ timeout: 20_000 });
  await expect(passwordInput).toBeVisible({ timeout: 20_000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("SIGN IN"), button:has-text("دخول")').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
}

for (const role of Object.keys(criticalRoutes) as RoleName[]) {
  test.describe(`${role} hard-launch critical routes`, () => {
    const email = process.env[`E2E_${role.toUpperCase()}_EMAIL`];
    const password = process.env[`E2E_${role.toUpperCase()}_PASSWORD`];

    test.beforeEach(async ({ page }) => {
      test.skip(!email || !password, `Missing E2E_${role.toUpperCase()}_EMAIL/PASSWORD secrets.`);
      await login(page, email!, password!);
    });

    for (const route of criticalRoutes[role]) {
      test(`${role} route renders: ${route}`, async ({ page }) => {
        const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
        expect(response?.status(), `${route} should not return a server error`).toBeLessThan(500);
        await expectNoRuntimeCrash(page, route);
      });
    }
  });
}
