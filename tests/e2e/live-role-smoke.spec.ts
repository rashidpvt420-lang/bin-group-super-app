import { expect, Page, test } from '@playwright/test';

type RoleName = 'admin' | 'owner' | 'tenant' | 'technician' | 'broker';

const roleRoutes: Record<RoleName, string> = {
  admin: '/admin/dashboard',
  owner: '/owner/dashboard',
  tenant: '/tenant/dashboard',
  technician: '/technician/dashboard',
  broker: '/broker/dashboard',
};

const publicRoutes = [
  '/',
  '/login',
  '/owners',
  '/tenants',
  '/technicians',
  '/brokers',
  '/company',
  '/support',
  '/privacy',
  '/terms',
];

const criticalRuntimeFailureText = /application error|unhandled runtime error|chunkloaderror|firebaseerror: missing|minified react error/i;
const serverErrorText = /bad gateway|service unavailable|internal server error/i;

async function expectNoCriticalRuntimeCrash(page: Page) {
  await expect(page.locator('body')).toBeVisible({ timeout: 20_000 });
  const bodyText = await page.locator('body').innerText({ timeout: 20_000 });
  expect(bodyText).not.toMatch(criticalRuntimeFailureText);
  expect(bodyText).not.toMatch(serverErrorText);
}

async function expectHealthyPublicRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
  expect(response, `${route} should return an HTTP response`).toBeTruthy();
  expect(response?.status(), `${route} should not return a server error`).toBeLessThan(500);

  await expectNoCriticalRuntimeCrash(page);

  const bodyText = (await page.locator('body').innerText({ timeout: 20_000 })).trim();
  expect(bodyText.length, `${route} should render visible body content`).toBeGreaterThan(0);

  if (route === '/') {
    expect(/BIN|Group|maintenance|property/i.test(bodyText), 'Homepage should render BIN GROUP/property-care brand content').toBeTruthy();
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expectNoCriticalRuntimeCrash(page);

  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[autocomplete="email"]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i], input[autocomplete="current-password"]').first();

  await expect(emailInput, 'Login page must expose an email input').toBeVisible({ timeout: 20_000 });
  await expect(passwordInput, 'Login page must expose a password input').toBeVisible({ timeout: 20_000 });

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submit = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("SIGN IN"), button:has-text("دخول")').first();
  await expect(submit, 'Login page must expose a submit button').toBeVisible({ timeout: 20_000 });
  await submit.click();
}

test.describe('BIN GROUP production public smoke', () => {
  for (const route of publicRoutes) {
    test(`public route loads: ${route}`, async ({ page }) => {
      await expectHealthyPublicRoute(page, route);
    });
  }
});

test.describe('BIN GROUP production authenticated role smoke', () => {
  const roles: RoleName[] = ['admin', 'owner', 'tenant', 'technician', 'broker'];

  for (const role of roles) {
    const email = process.env[`E2E_${role.toUpperCase()}_EMAIL`];
    const password = process.env[`E2E_${role.toUpperCase()}_PASSWORD`];

    test(`${role} can login and reach dashboard`, async ({ page }) => {
      test.skip(!email || !password, `Missing E2E_${role.toUpperCase()}_EMAIL/PASSWORD secrets.`);

      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await login(page, email!, password!);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2_000);

      await page.goto(roleRoutes[role], { waitUntil: 'domcontentloaded' });
      await expectNoCriticalRuntimeCrash(page);

      const currentPath = new URL(page.url()).pathname;
      expect(currentPath, `${role} should be able to reach ${roleRoutes[role]}`).toBe(roleRoutes[role]);

      const bodyText = await page.locator('body').innerText({ timeout: 20_000 });
      expect(bodyText).not.toMatch(/permission-denied|unauthenticated|access denied|not authorized/i);
      expect(consoleErrors.join('\n')).not.toMatch(/permission-denied|missing or insufficient permissions/i);
    });
  }
});
