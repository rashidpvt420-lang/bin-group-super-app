import { expect, Page, test } from '@playwright/test';

type RoleName = 'admin' | 'owner' | 'tenant' | 'technician' | 'broker';

const criticalRoutes: Record<RoleName, string[]> = {
  admin: ['/admin/dashboard', '/admin/owners', '/admin/tenants', '/admin/tickets', '/admin/technicians', '/admin/financials', '/admin/contracts', '/admin/audit', '/admin/properties/registry', '/admin/properties/passport'],
  owner: ['/owner/dashboard', '/owner/activation', '/owner/contracts', '/owner/property-passport', '/owner/units', '/owner/tenants', '/owner/documents', '/owner/tickets', '/owner/financials', '/owner/roi'],
  tenant: ['/tenant/dashboard', '/tenant/unit', '/tenant/request', '/tenant/tickets', '/tenant/documents', '/tenant/profile'],
  technician: ['/technician/dashboard', '/technician/jobs', '/technician/map', '/technician/history', '/technician/profile'],
  broker: ['/broker/dashboard', '/broker/leads', '/broker/referrals', '/broker/commissions', '/broker/documents', '/broker/profile'],
};

const fatalRouteFailureText = /404|page not found|application error|unhandled runtime error|chunkloaderror|minified react error|invalid-credential|wrong-password|user-not-found/i;
const accessFailureText = /access denied|not authorized/i;

async function expectNoRuntimeCrash(page: Page, route: string) {
  await expect(page.locator('body'), `${route} body should be visible`).toBeVisible({ timeout: 20_000 });
  const text = await page.locator('body').innerText({ timeout: 20_000 });
  expect(text.trim().length, `${route} should render visible text`).toBeGreaterThan(0);
  expect(text, `${route} should not render fatal crash text`).not.toMatch(fatalRouteFailureText);

  if (accessFailureText.test(text)) {
    const lowerText = text.toLowerCase();
    const looksLikeBlockedScreen = lowerText.includes('login') || lowerText.includes('contact admin') || lowerText.includes('insufficient role') || lowerText.includes('unauthorized');
    expect(looksLikeBlockedScreen, `${route} should not render an access-block screen`).toBeFalsy();
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });

  const emailInput = page.locator('[data-testid="login-email"], input[type="email"], input[name*="email" i], input[autocomplete="email"], input:not([type="password"])').first();
  const passwordInput = page.locator('[data-testid="login-password"], input[type="password"], input[name*="password" i], input[autocomplete="current-password"]').first();
  await expect(emailInput, 'Login email field should be visible').toBeVisible({ timeout: 25_000 });
  await expect(passwordInput, 'Login password field should be visible').toBeVisible({ timeout: 25_000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
  await expectNoRuntimeCrash(page, '/login after submit');
}

async function expectDashboardControls(page: Page, role: RoleName) {
  await expect(page.getByTestId(`${role}-language-toggle`), `${role} must expose language toggle`).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId(`${role}-logout`).or(page.getByTestId(`${role}-logout-mobile`)), `${role} must expose logout control`).toBeVisible({ timeout: 15_000 });
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

    test(`${role} dashboard exposes required launch controls`, async ({ page }) => {
      await page.goto(criticalRoutes[role][0], { waitUntil: 'domcontentloaded' });
      await expectNoRuntimeCrash(page, criticalRoutes[role][0]);
      await expectDashboardControls(page, role);
    });

    test(`${role} language switch is mandatory`, async ({ page }) => {
      await page.goto(criticalRoutes[role][0], { waitUntil: 'domcontentloaded' });
      await expectNoRuntimeCrash(page, criticalRoutes[role][0]);
      const languageButton = page.getByTestId(`${role}-language-toggle`);
      await expect(languageButton).toBeVisible({ timeout: 15_000 });
      await languageButton.click();
      await page.waitForTimeout(800);
      await expectNoRuntimeCrash(page, `${role} language switch`);
    });
  });
}
