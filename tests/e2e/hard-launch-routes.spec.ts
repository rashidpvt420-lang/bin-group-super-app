import { expect, Page, test } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';
import { existsSync } from 'fs';
import { config as loadDotenv } from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

for (const candidate of [
  path.resolve(__dirname, '../../.env.e2e'),
  path.resolve(__dirname, '../../../.env.e2e'),
  path.resolve(process.cwd(), '.env.e2e'),
  path.resolve(process.cwd(), 'bin-group-super-app/.env.e2e'),
]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate });
    break;
  }
}

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized|app check|firebase.?app.?check|insufficient permissions/i;
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || '').trim().replace(/\/+$/, '');

type RoleCase = {
  name: 'Owner' | 'Tenant' | 'Technician' | 'Broker' | 'Admin';
  roleKey: 'owner' | 'tenant' | 'technician' | 'broker' | 'admin';
  email: string;
  password: string;
  routes: readonly string[];
  baseUrl?: string;
};

const roleCases: RoleCase[] = [
  {
    name: 'Owner',
    roleKey: 'owner',
    email: process.env.E2E_OWNER_EMAIL || '',
    password: process.env.E2E_OWNER_PASSWORD || '',
    routes: ['/owner/dashboard', '/owner/properties', '/owner/contracts', '/owner/financials', '/owner/tenants', '/owner/documents', '/owner/property-passport', '/owner/tickets', '/owner/units', '/owner/roi', '/owner/activation'],
  },
  {
    name: 'Tenant',
    roleKey: 'tenant',
    email: process.env.E2E_TENANT_EMAIL || '',
    password: process.env.E2E_TENANT_PASSWORD || '',
    routes: ['/tenant/dashboard', '/tenant/unit', '/tenant/request', '/tenant/tickets', '/tenant/documents', '/tenant/emergency', '/tenant/chat', '/tenant/profile', '/tenant/gate-pass', '/tenant/amenities'],
  },
  {
    name: 'Technician',
    roleKey: 'technician',
    email: process.env.E2E_TECHNICIAN_EMAIL || '',
    password: process.env.E2E_TECHNICIAN_PASSWORD || '',
    routes: ['/technician/dashboard', '/technician/jobs', '/technician/map', '/technician/history', '/technician/hr', '/technician/profile', '/technician/chat'],
  },
  {
    name: 'Broker',
    roleKey: 'broker',
    email: process.env.E2E_BROKER_EMAIL || '',
    password: process.env.E2E_BROKER_PASSWORD || '',
    routes: ['/broker/dashboard', '/broker/leads', '/broker/referrals', '/broker/commissions', '/broker/documents', '/broker/profile'],
  },
  {
    name: 'Admin',
    roleKey: 'admin',
    email: process.env.E2E_ADMIN_EMAIL || '',
    password: process.env.E2E_ADMIN_PASSWORD || '',
    baseUrl: ADMIN_BASE_URL,
    routes: ['/dashboard', '/profile', '/contracts', '/owners', '/tenants', '/tickets', '/technicians', '/sos', '/financials', '/audit'],
  },
];

function requireRoleConfiguration(role: RoleCase) {
  if (!role.email || !role.password || (role.name === 'Admin' && !role.baseUrl)) {
    throw new Error(`Hard-launch exact-route audit blocked: missing ${role.name} credentials${role.name === 'Admin' ? ' or E2E_ADMIN_BASE_URL' : ''}.`);
  }
}

async function login(page: Page, role: RoleCase) {
  requireRoleConfiguration(role);
  const loginUrl = role.baseUrl ? `${role.baseUrl}/login` : '/login';
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('[data-testid="login-email"], input[type="email"], input[name*="email" i], input[autocomplete="email"]').first();
  const passwordInput = page.locator('[data-testid="login-password"], input[type="password"], input[name*="password" i], input[autocomplete="current-password"]').first();
  await expect(emailInput, `${role.name} login email must be visible`).toBeVisible({ timeout: 25_000 });
  await expect(passwordInput, `${role.name} login password must be visible`).toBeVisible({ timeout: 25_000 });
  await emailInput.fill(role.email);
  await passwordInput.fill(role.password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
  await expect(page, `${role.name} must leave the login route`).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

async function assertExactRoute(page: Page, role: RoleCase, route: string) {
  const destination = role.baseUrl ? `${role.baseUrl}${route}` : route;
  const response = await page.goto(destination, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(route.includes('/map') ? 2_500 : 900);
  expect(response?.status() ?? 200, `${role.name} ${route} must not return a server error`).toBeLessThan(500);
  await expect.poll(() => new URL(page.url()).pathname, {
    message: `${role.name} ${route} must remain on its registered route rather than a wildcard redirect`,
  }).toBe(route);
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${role.name} ${route} must render visible text`).toBeGreaterThan(0);
  expect(body, `${role.name} ${route} must not render a runtime crash`).not.toMatch(CRASH_PATTERN);
  expect(body, `${role.name} ${route} must not render an access denial`).not.toMatch(ACCESS_DENIED);
}

for (const role of roleCases) {
  test(`${role.name} hard-launch routes remain exact and authenticated`, async ({ page }) => {
    test.setTimeout(180_000);
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    await monitor.assertTokenFingerprint();
    await login(page, role);
    for (const route of role.routes) await assertExactRoute(page, role, route);
    monitor.assertClean(`${role.name} hard-launch exact routes`);
    monitor.assertAuthenticatedFirebaseRead(`${role.name} hard-launch exact routes`);
  });
}
