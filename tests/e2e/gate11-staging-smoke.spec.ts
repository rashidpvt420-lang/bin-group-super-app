/**
 * Gate 11: signed-in 5-profile smoke against Firebase Hosting preview channels.
 */
import { expect, Page, Response, test } from '@playwright/test';
import { installAppCheckDebugToken, assertAppCheckDebugTokenInPage, collectAppCheckFailures } from './helpers/appCheckDebug';
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'fs';
import { createHmac } from 'node:crypto';
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

// Same real-MFA handling as tests/e2e/business-admin.spec.ts: the canonical
// Founder admin account has an enrolled Firebase MFA factor, so a password-only
// login can never reach /dashboard. No MFA step is skipped or bypassed.
function adminTotpSecret() {
  return String(process.env.E2E_FOUNDER_TOTP_SECRET || '').toUpperCase().replace(/[\s=-]/g, '');
}

function adminRealMfaCode() {
  return String(process.env.E2E_ADMIN_REAL_MFA_CODE || process.env.E2E_FOUNDER_REAL_MFA_CODE || '').trim();
}

function currentAdminMfaCode() {
  const secret = adminTotpSecret();
  if (!secret) return adminRealMfaCode();
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const key = Buffer.from(Array.from({ length: Math.floor(bits.length / 8) }, (_, index) =>
    Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

function isFirebaseMfaFinalizeResponse(response: Response) {
  return /identitytoolkit\.googleapis\.com\/v2\/accounts\/mfaSignIn:finalize/.test(response.url());
}

async function waitForFreshTotpWindow(page: Page) {
  const remaining = 30_000 - (Date.now() % 30_000);
  if (remaining < 10_000) await page.waitForTimeout(remaining + 250);
}

async function waitForNextTotpWindow(page: Page) {
  const remaining = 30_000 - (Date.now() % 30_000);
  await page.waitForTimeout(remaining + 250);
}

async function submitAdminMfaCode(page: Page) {
  const responsePromise = page.waitForResponse(isFirebaseMfaFinalizeResponse, { timeout: 15_000 }).catch(() => null);
  await page.getByTestId('admin-mfa-resolve-signin').click();
  return responsePromise;
}

async function visibleAdminMfaError(page: Page) {
  const error = page.getByTestId('admin-mfa-signin-error');
  await error.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  return String((await error.textContent().catch(() => '')) || '').trim();
}

async function completeAdminMfaChallenge(page: Page) {
  const factorSelect = page.getByTestId('admin-mfa-factor-select');
  if (await factorSelect.isVisible().catch(() => false)) {
    for (const opt of await factorSelect.locator('option').all()) {
      if (/authenticator/i.test(await opt.innerText())) {
        const val = await opt.getAttribute('value');
        if (val) await factorSelect.selectOption(val);
        break;
      }
    }
  }
  const usesTotp = await page.getByTestId('admin-mfa-totp-selected').isVisible().catch(() => false);
  if (usesTotp && !/^[A-Z2-7]{16,}$/.test(adminTotpSecret())) {
    throw new Error('Admin selected a TOTP factor but E2E_FOUNDER_TOTP_SECRET is not configured.');
  }
  if (!usesTotp && !/^\d{6}$/.test(adminRealMfaCode()) && !adminTotpSecret()) {
    throw new Error('Admin MFA challenge requires E2E_FOUNDER_TOTP_SECRET or a real MFA code.');
  }
  await page.getByTestId('admin-mfa-send-signin-code').click();
  await expect(page.getByTestId('admin-mfa-signin-code')).toBeVisible({ timeout: 30_000 });
  if (usesTotp) await waitForFreshTotpWindow(page);
  await page.getByTestId('admin-mfa-signin-code').fill(currentAdminMfaCode());
  const firstMfaResponse = await submitAdminMfaCode(page);
  if (usesTotp && firstMfaResponse && !firstMfaResponse.ok()) {
    const firstError = await visibleAdminMfaError(page);
    if (!/incorrect|expired/i.test(firstError)) {
      throw new Error(`Admin TOTP sign-in failed with Firebase status ${firstMfaResponse.status()}.`);
    }
    await waitForNextTotpWindow(page);
    await page.getByTestId('admin-mfa-signin-code').fill(currentAdminMfaCode());
    const retryMfaResponse = await submitAdminMfaCode(page);
    if (retryMfaResponse && !retryMfaResponse.ok()) {
      throw new Error('Admin TOTP was rejected in two consecutive windows. Reconcile E2E_FOUNDER_TOTP_SECRET with the enrolled factor.');
    }
  }
}

async function loginAdminPanel(page: Page, email: string, password: string) {
  if (!adminBaseUrl) throw new Error('E2E_ADMIN_BASE_URL is required.');
  await page.goto(`${adminBaseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  const challenge = page.getByTestId('admin-mfa-signin-challenge');
  const outcome = await Promise.race([
    challenge.waitFor({ state: 'visible', timeout: 30_000 }).then(() => 'mfa' as const),
    page.waitForURL('**/dashboard', { timeout: 30_000 }).then(() => 'dashboard' as const),
  ]).catch(() => 'timeout' as const);
  if (outcome === 'mfa') await completeAdminMfaChallenge(page);
  await page.waitForURL('**/dashboard', { timeout: 45_000 });
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
