import { expect, Page, test } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || 'https://bin-groups.com';

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

const homepageBrandText = [/BIN/i, /Group/i, /maintenance/i, /property/i];
const routeFailureText = /404|not found|page not found|application error|unhandled runtime error|chunkloaderror|firebaseerror: missing|minified react error|access denied|permission-denied/i;

async function expectNoRuntimeCrash(page: Page) {
  await expect(page.locator('body')).toBeVisible();
  const bodyText = await page.locator('body').innerText({ timeout: 15_000 });
  expect(bodyText).not.toMatch(/Application error|Unhandled Runtime Error|ChunkLoadError|FirebaseError: Missing|Minified React error/i);
}

async function expectHealthyPublicRoute(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
  expect(response?.status(), `${route} should not return a server error`).toBeLessThan(500);
  await expectNoRuntimeCrash(page);

  const bodyText = (await page.locator('body').innerText({ timeout: 15_000 })).trim();
  expect(bodyText.length, `${route} should render visible body content`).toBeGreaterThan(0);
  expect(bodyText, `${route} should not render an error, 404, or access-denied page`).not.toMatch(routeFailureText);

  if (route === '/') {
    expect(homepageBrandText.some((pattern) => pattern.test(bodyText)), 'Homepage should render BIN GROUP/property-care brand content').toBeTruthy();
  }
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expectNoRuntimeCrash(page);

  const emailInput = page.locator('input[type="email"], input[name*="email" i], input[autocomplete="email"]').first();
  const passwordInput = page.locator('input[type="password"], input[name*="password" i], input[autocomplete="current-password"]').first();

  await expect(emailInput, 'Login page must expose an email input').toBeVisible({ timeout: 15_000 });
  await expect(passwordInput, 'Login page must expose a password input').toBeVisible({ timeout: 15_000 });

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submit = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in"), button:has-text("SIGN IN"), button:has-text("دخول")').first();
  await expect(submit, 'Login page must expose a submit button').toBeVisible({ timeout: 15_000 });
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
      await page.waitForTimeout(3_000);

      await page.goto(roleRoutes[role], { waitUntil: 'domcontentloaded' });
      await expectNoRuntimeCrash(page);

      await expect(page).toHaveURL(new RegExp(roleRoutes[role].replace('/', '\\/')), { timeout: 20_000 });
      const bodyText = await page.locator('body').innerText({ timeout: 15_000 });
      expect(bodyText).not.toMatch(/permission-denied|unauthenticated|access denied|not authorized/i);
      expect(consoleErrors.join('\n')).not.toMatch(/permission-denied|Missing or insufficient permissions|FirebaseError/i);

      // Owner-specific control room validations
      if (role === 'owner') {
        // 1. Confirm dashboard active loads and shows core control room sections
        await expect(page.locator('text=Financial Control')).toBeVisible({ timeout: 10_000 });
        await expect(page.locator('text=Portfolio Health')).toBeVisible();
        await expect(page.locator('text=Tenant Registry')).toBeVisible();
        await expect(page.locator('text=Action Items Required')).toBeVisible();

        // 2. Validate tenant registry text contains the separate UID warning note
        expect(bodyText).toContain('Tenants use their own login. They are linked to the owner by property and unit, not by sharing owner UID.');

        // 3. If real assets exist, zero-unit placeholders should be hidden, and sorting should put Al Ain Falaj Hazza first
        const hasAlAin = bodyText.includes('Al Ain Falaj Hazza');
        const hasNewAsset = bodyText.includes('New Asset');
        if (hasAlAin) {
          // Real asset exists, so zero-unit "New Asset" placeholders should be hidden
          expect(hasNewAsset).toBeFalsy();
          
          // Verify Al Ain appears before any placeholder text
          const alAinIndex = bodyText.indexOf('Al Ain Falaj Hazza');
          const newAssetIndex = bodyText.indexOf('New Asset');
          if (newAssetIndex !== -1) {
            expect(alAinIndex).toBeLessThan(newAssetIndex);
          }
        }

        // 4. Validate that Majlis, Hotel, School, Hospital assets hide lease expiry
        // (verified by checking that "LEASE EXPIRY" is not displayed next to those specific asset details in the calendar)
        const hasMajlisText = bodyText.toLowerCase().includes('majlis') || bodyText.toLowerCase().includes('hotel') || bodyText.toLowerCase().includes('school');
        if (hasMajlisText) {
          // If Majlis or institutional types are rendered, ensure lease expiry date warning is not shown for them
          const leaseExpiryLabel = page.locator('text=LEASE EXPIRY');
          const leaseCount = await leaseExpiryLabel.count();
          for (let i = 0; i < leaseCount; i++) {
            const parentText = await leaseExpiryLabel.nth(i).evaluate(el => el.parentElement?.textContent || '');
            expect(parentText.toLowerCase()).not.toMatch(/majlis|majils|hotel|school|hospital|clinic|healthcare/);
          }
        }

        // 5. Verify contracts page remains clean
        await page.goto('/owner/contracts', { waitUntil: 'domcontentloaded' });
        await expectNoRuntimeCrash(page);
        const contractsBody = await page.locator('body').innerText();
        expect(contractsBody).not.toMatch(/permission-denied|access denied|firebaseerror/i);

        // 6. Verify property passport details open successfully if a passport link is available
        await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
        const passportButton = page.locator('a[href*="property-passport/"], button:has-text("PROPERTY PASSPORT")').first();
        if (await passportButton.count() > 0) {
          await passportButton.click();
          await page.waitForLoadState('domcontentloaded');
          await expectNoRuntimeCrash(page);
          const passportDetailBody = await page.locator('body').innerText();
          expect(passportDetailBody).not.toMatch(/permission-denied|access denied|firebaseerror/i);
        }
      }
    });
  }
});

export { baseURL };
