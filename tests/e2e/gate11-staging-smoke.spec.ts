/**
 * Gate 11: signed-in 5-profile smoke against Firebase Hosting preview channels.
 */
import { expect, Page, test } from '@playwright/test';
import { installAppCheckDebugToken, assertAppCheckDebugTokenInPage, collectAppCheckFailures } from './helpers/appCheckDebug';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../../.env.e2e');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const adminBaseUrl = (process.env.E2E_ADMIN_BASE_URL || '').replace(/\/$/, '');
const crashPattern = /application error|unhandled runtime error|chunkloaderror|minified react error|sovereign_failure|system interruption/i;
const accessDenied = /permission-denied|unauthenticated|access denied|not authorized|missing or insufficient permissions/i;
type RoleName = 'owner' | 'tenant' | 'technician' | 'broker';
const roleDashboard: Record<RoleName, string> = { owner: '/owner/dashboard', tenant: '/tenant/dashboard', technician: '/technician/dashboard', broker: '/broker/dashboard' };
const forbiddenByRole: Record<RoleName, string[]> = {
  owner: ['/admin/dashboard', '/broker/dashboard', '/technician/dashboard'],
  tenant: ['/admin/dashboard', '/owner/dashboard', '/broker/dashboard', '/technician/dashboard'],
  technician: ['/admin/dashboard', '/owner/dashboard', '/broker/dashboard'],
  broker: ['/admin/dashboard', '/owner/dashboard'],
};

async function loginMainApp(page: Page, email: string, password: string, intendedRole?: string) {
  const loginUrl = intendedRole ? `/login?intendedRole=${intendedRole}&refresh=${Date.now()}` : '/login';
  await page.context().clearCookies();
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  if (intendedRole) await page.waitForURL(`**/${intendedRole}/dashboard`, { timeout: 25_000 });
  else await expect(page).not.toHaveURL(/\/login$/, { timeout: 25_000 });
}

async function loginAdminPanel(page: Page, email: string, password: string) {
  if (!adminBaseUrl) throw new Error('E2E_ADMIN_BASE_URL is required.');
  await page.goto(`${adminBaseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/dashboard', { timeout: 25_000 });
}

async function assertHealthy(page: Page, label: string) {
  const body = await page.locator('body').innerText({ timeout: 25_000 });
  expect(body.trim().length, `${label}: body text`).toBeGreaterThan(0);
  expect(body, `${label}: no crash`).not.toMatch(crashPattern);
  expect(body, `${label}: no access denied`).not.toMatch(accessDenied);
  await expect(page, `${label}: should not stay on login`).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

async function expectLaunchControls(page: Page, role: RoleName) {
  await expect(page.getByTestId(`${role}-language-toggle`).or(page.getByRole('button', { name: /^AR$|^EN$/i })).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`${role}-logout`).or(page.getByTestId(`${role}-logout-mobile`)).first()).toBeVisible({ timeout: 20_000 });
}

function cred(role: string) {
  const key = role.toUpperCase();
  return { email: process.env[`E2E_${key}_EMAIL`] || '', password: process.env[`E2E_${key}_PASSWORD`] || '' };
}

test.describe('Gate 11 admin panel signed-in smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installAppCheckDebugToken(page);
  });
  const { email, password } = cred('admin');
  test.skip(!email || !password || !adminBaseUrl, 'Missing admin staging credentials');
  test('admin lands on dashboard and can open control center + broker management', async ({ page }) => {
    await loginAdminPanel(page, email, password);
    await page.goto(`${adminBaseUrl}/dashboard`, { waitUntil: 'domcontentloaded' });
    await assertHealthy(page, 'admin /dashboard');
    for (const route of ['/control-center', '/broker']) {
      await page.goto(`${adminBaseUrl}${route}`, { waitUntil: 'domcontentloaded' });
      await assertHealthy(page, `admin ${route}`);
    }
  });
});

test.describe('Gate 11 main app role smoke', () => {
  for (const role of ['owner', 'tenant', 'technician', 'broker'] as RoleName[]) {
    test.describe(`${role} signed-in smoke`, () => {
      const { email, password } = cred(role);
      test.skip(!email || !password, `Missing E2E_${role.toUpperCase()} credentials`);
      test(`${role} reaches dashboard with launch controls`, async ({ page }) => {
        await loginMainApp(page, email, password, role);
        await page.goto(roleDashboard[role], { waitUntil: 'domcontentloaded' });
        await assertHealthy(page, `${role} dashboard`);
        await expectLaunchControls(page, role);
        expect(new URL(page.url()).pathname).toBe(roleDashboard[role]);
      });
      test(`${role} cannot access forbidden routes`, async ({ page }) => {
        await loginMainApp(page, email, password, role);
        for (const route of forbiddenByRole[role]) {
          await page.goto(route, { waitUntil: 'domcontentloaded' });
          await expect(page, `${role} should be redirected away from ${route}`).not.toHaveURL(new RegExp(`${route.replace(/\//g, '\\/')}$`), { timeout: 20_000 });
        }
      });
    });
  }
});

test.describe('Gate 11 workflow smoke', () => {
  test('tenant can reach maintenance request flow', async ({ page }) => {
    const { email, password } = cred('tenant');
    test.skip(!email || !password, 'Missing tenant credentials');
    await loginMainApp(page, email, password, 'tenant');
    await page.goto('/tenant/request', { waitUntil: 'domcontentloaded' });
    await assertHealthy(page, 'tenant request');
    await expect(page.getByTestId('tenant-request-category').or(page.getByTestId('tenant-request-category-input')).first()).toBeVisible({ timeout: 30_000 });
  });
  test('technician can reach jobs surface', async ({ page }) => {
    const { email, password } = cred('technician');
    test.skip(!email || !password, 'Missing technician credentials');
    await loginMainApp(page, email, password, 'technician');
    await page.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
    await assertHealthy(page, 'technician jobs');
  });
  test('broker can reach leads and commissions surfaces', async ({ page }) => {
    const { email, password } = cred('broker');
    test.skip(!email || !password, 'Missing broker credentials');
    await loginMainApp(page, email, password, 'broker');
    for (const route of ['/broker/leads', '/broker/referrals', '/broker/commissions']) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await assertHealthy(page, route);
    }
  });
});
