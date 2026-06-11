import { expect, Page, test } from '@playwright/test';

type RoleName = 'admin' | 'owner' | 'tenant' | 'technician' | 'broker';

const roleRoutes: Record<RoleName, string> = {
  admin: '/admin/dashboard',
  owner: '/owner/dashboard',
  tenant: '/tenant/dashboard',
  technician: '/technician/dashboard',
  broker: '/broker/dashboard',
};

const publicRoutes = ['/', '/login', '/owners', '/tenants', '/technicians', '/brokers', '/company', '/support', '/privacy', '/terms'];

const criticalRuntimeFailureText = /application error|unhandled runtime error|chunkloaderror|firebaseerror: missing|minified react error|cannot read properties of undefined|null is not an object/i;
const serverErrorText = /bad gateway|service unavailable|internal server error|gateway timeout/i;
const visibleAccessFailureText = /permission-denied|unauthenticated|access denied|not authorized/i;

async function collectPageDiagnostics(page: Page, route: string) {
  return page.evaluate((targetRoute) => {
    const body = document.body?.innerText?.trim() || '';
    return {
      targetRoute,
      href: window.location.href,
      pathname: window.location.pathname,
      title: document.title,
      readyState: document.readyState,
      bodyLength: body.length,
      bodyPreview: body.slice(0, 500),
      rootHtmlLength: document.getElementById('root')?.innerHTML?.length || 0,
    };
  }, route).catch((error) => ({
    targetRoute: route,
    href: page.url(),
    error: error instanceof Error ? error.message : String(error),
  }));
}

async function waitForRenderableBody(page: Page, route: string) {
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForFunction(() => Boolean(document.body), null, { timeout: 20_000 });

  await page.waitForFunction(
    () => {
      const bodyText = document.body?.innerText?.trim() || '';
      const rootHtml = document.getElementById('root')?.innerHTML || '';
      return bodyText.length > 0 || rootHtml.length > 0;
    },
    null,
    { timeout: 25_000 },
  ).catch(async (error) => {
    const diagnostics = await collectPageDiagnostics(page, route);
    throw new Error(`Route ${route} did not render visible DOM content. Diagnostics: ${JSON.stringify(diagnostics)}. Cause: ${error instanceof Error ? error.message : String(error)}`);
  });

  return page.locator('body').innerText({ timeout: 20_000 });
}

async function expectNoCriticalRuntimeCrash(page: Page, route = page.url()) {
  const bodyText = await waitForRenderableBody(page, route);
  expect(bodyText).not.toMatch(criticalRuntimeFailureText);
  expect(bodyText).not.toMatch(serverErrorText);
  return bodyText;
}

async function expectHealthyPublicRoute(page: Page, route: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      expect(response, `${route} should return an HTTP response`).toBeTruthy();
      expect(response?.status(), `${route} should not return a server error`).toBeLessThan(500);

      const bodyText = (await expectNoCriticalRuntimeCrash(page, route)).trim();
      expect(bodyText.length, `${route} should render visible body content`).toBeGreaterThan(0);

      if (route === '/') {
        expect(/BIN|Group|maintenance|property/i.test(bodyText), 'Homepage should render BIN GROUP/property-care brand content').toBeTruthy();
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt === 1) {
        await page.waitForTimeout(1_500);
        continue;
      }
    }
  }

  const diagnostics = await collectPageDiagnostics(page, route);
  throw new Error(`Public route smoke failed for ${route}. Diagnostics: ${JSON.stringify(diagnostics)}. Cause: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expectNoCriticalRuntimeCrash(page, '/login');

  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[autocomplete="email"]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i], input[autocomplete="current-password"]').first();

  await expect(emailInput, 'Login page must expose an email input').toBeVisible({ timeout: 20_000 });
  await expect(passwordInput, 'Login page must expose a password input').toBeVisible({ timeout: 20_000 });

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submit = page.locator('form button[type="submit"]').first();
  await expect(submit, 'Login page must expose a submit button').toBeVisible({ timeout: 20_000 });
  await submit.click();
}

async function expectDashboardControls(page: Page, role: RoleName) {
  await expect(page.getByTestId(`${role}-language-toggle`), `${role} must expose language toggle`).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`${role}-logout`).or(page.getByTestId(`${role}-logout-mobile`)), `${role} must expose logout control`).toBeVisible({ timeout: 20_000 });
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

    test(`${role} can login, reach dashboard, and see launch controls`, async ({ page }) => {
      if (!email || !password) {
        throw new Error(`Missing E2E_${role.toUpperCase()}_EMAIL/PASSWORD secrets. Mandatory role credentials must be defined for public launch smoke tests.`);
      }

      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        console.log(`[BROWSER CONSOLE ${msg.type()}]: ${msg.text()}`);
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });
      page.on('pageerror', (err) => {
        console.log(`[BROWSER PAGEERROR]: ${err.message}`);
      });
      page.on('requestfailed', (request) => {
        console.log(`[BROWSER REQUESTFAILED]: ${request.url()} - ${request.failure()?.errorText}`);
      });

      await login(page, email!, password!);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2_000);

      await page.goto(roleRoutes[role], { waitUntil: 'domcontentloaded' });
      await expectNoCriticalRuntimeCrash(page, roleRoutes[role]);
      await expectDashboardControls(page, role);

      const currentPath = new URL(page.url()).pathname;
      expect(currentPath, `${role} should be able to reach ${roleRoutes[role]}`).toBe(roleRoutes[role]);

      const bodyText = await page.locator('body').innerText({ timeout: 20_000 });
      expect(bodyText).not.toMatch(visibleAccessFailureText);

      const criticalConsoleErrors = consoleErrors.filter((entry) =>
        /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i.test(entry)
      );
      expect(criticalConsoleErrors.join('\n')).toBe('');
    });
  }
});
