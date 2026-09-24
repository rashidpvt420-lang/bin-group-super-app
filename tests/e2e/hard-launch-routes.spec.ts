import { expect, Page, test } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';
import { loginAdminWithRealMfa, requireAdminMfaCredentials } from './helpers/adminMfa';
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
    email: process.env.E2E_OWNER_MAILBOX_EMAIL || '',
    password: process.env.E2E_OWNER_PASSWORD || '',
    routes: [
      '/owner/dashboard',
      '/owner/dashboard/full',
      '/owner/activation',
      '/owner/onboarding-status',
      '/owner/properties',
      '/owner/contracts',
      '/owner/financials',
      '/owner/payment-proof',
      '/owner/iban',
      '/owner/profile',
      '/owner/roi',
      '/owner/units',
      '/owner/tenants',
      '/owner/property-passport',
      '/owner/documents',
      '/owner/renewals',
      '/owner/inspections',
      '/owner/review-queue',
      '/owner/design-studio',
      '/owner/complaint',
      '/owner/tickets',
      '/owner/ai-intelligence',
      '/owner/damage-estimate',
      '/owner/p-l-report',
      '/owner/find-room-rent',
      '/owner/contractor-marketplace',
      '/owner/home-discovery',
      '/owner/approvals',
      '/owner/bin-connect',
      '/owner/pilot-completion',
    ],
  },
  {
    name: 'Tenant',
    roleKey: 'tenant',
    email: process.env.E2E_TENANT_EMAIL || '',
    password: process.env.E2E_TENANT_PASSWORD || '',
    routes: [
      '/tenant/dashboard',
      '/tenant/dashboard/full',
      '/tenant/scheduled-service',
      '/tenant/unit',
      '/tenant/ai-concierge',
      '/tenant/request',
      '/tenant/tickets',
      '/tenant/chat',
      '/tenant/emergency',
      '/tenant/profile',
      '/tenant/documents',
      '/tenant/design-studio',
      '/tenant/gate-pass',
      '/tenant/amenities',
      '/tenant/payments',
      '/tenant/move-inspection',
      '/tenant/notices',
      '/tenant/keys',
      '/tenant/parcels',
      '/tenant/visitor-parking',
      '/tenant/homes',
      '/tenant/find-room-rent',
      '/tenant/marketplace',
      '/tenant/staff-directory',
      '/tenant/messages',
      '/tenant/community',
      '/tenant/renewals',
    ],
  },
  {
    name: 'Technician',
    roleKey: 'technician',
    email: process.env.E2E_TECHNICIAN_EMAIL || '',
    password: process.env.E2E_TECHNICIAN_PASSWORD || '',
    routes: [
      '/technician/dashboard',
      '/technician/dashboard/full',
      '/technician/jobs',
      '/technician/proof-readiness',
      '/technician/chat',
      '/technician/map',
      '/technician/history',
      '/technician/profile',
      '/technician/hr',
      '/technician/offline',
      '/technician/support',
      '/technician/bin-connect',
      '/technician/pilot-completion',
    ],
  },
  {
    name: 'Broker',
    roleKey: 'broker',
    email: process.env.E2E_BROKER_MAILBOX_EMAIL || '',
    password: process.env.E2E_BROKER_PASSWORD || '',
    routes: [
      '/broker/dashboard',
      '/broker/dashboard/full',
      '/broker/leads',
      '/broker/leads/new',
      '/broker/referrals',
      '/broker/referrals/new',
      '/broker/commissions',
      '/broker/attribution',
      '/broker/documents',
      '/broker/profile',
    ],
  },
  {
    name: 'Admin',
    roleKey: 'admin',
    email: process.env.E2E_ADMIN_EMAIL || '',
    password: process.env.E2E_ADMIN_PASSWORD || '',
    baseUrl: ADMIN_BASE_URL,
    routes: [
      '/dashboard',
      '/profile',
      '/mfa-recovery',
      '/contracts',
      '/financials',
      '/financials/payroll',
      '/transactions',
      '/broker',
      '/broker-attributions',
      '/broker-commissions',
      '/owners',
      '/tenants',
      '/unit-links',
      '/tenant-services',
      '/control-center',
      '/properties/passport',
      '/bulk-import',
      '/tickets',
      '/technicians',
      '/technicians/map',
      '/sos',
      '/document-vault',
      '/audit-shield',
      '/reports',
      '/settings',
      '/smoke-test',
      '/payments',
      '/profitability',
      '/compliance',
      '/pilot',
      '/ops/public',
      '/ops/whatsapp-triage',
      '/ops/bin-connect',
      '/ops/pilot-completion',
      '/ops/public-launch-command',
      '/ops/rfq',
      '/ops/vendors',
      '/ops/data-governance',
      '/reports/institutional',
      '/ops/technicians',
      '/vault',
      '/orphans',
      '/onboard-property',
      '/design-studio',
      '/hr',
      '/audit',
      '/admin/pricing-matrix',
      '/admin/units',
      '/admin/bin-gpt-engineer',
      '/ops/amenity-control',
      '/ops/announcements',
      '/ops/document-library',
      '/ops/key-register',
      '/ops/parcel-desk',
      '/ops/visitor-parking',
      '/ops/marketplace-approvals',
      '/ops/staff-directory',
      '/ops/messages',
      '/ops/community-moderation',
    ],
  },
];

function requireRoleConfiguration(role: RoleCase) {
  if (!role.email || !role.password || (role.name === 'Admin' && !role.baseUrl)) {
    throw new Error(`Hard-launch exact-route audit blocked: missing ${role.name} credentials${role.name === 'Admin' ? ' or E2E_ADMIN_BASE_URL' : ''}.`);
  }
}

async function login(page: Page, role: RoleCase) {
  requireRoleConfiguration(role);
  if (role.name === 'Admin') {
    const founder = requireAdminMfaCredentials('E2E_FOUNDER');
    if (founder.email !== 'ceo@bin-groups.com') {
      throw new Error('Admin hard-launch exact-route audit requires the canonical Founder MFA identity.');
    }
    await loginAdminWithRealMfa(page, role.baseUrl || '', founder);
    return;
  }

  const loginUrl = role.baseUrl ? `${role.baseUrl}/login` : '/login';
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('[data-testid="login-email"], input[type="email"], input[name*="email" i], input[autocomplete="email"]').first();
  const passwordInput = page.locator('[data-testid="login-password"], input[type="password"], input[name*="password" i], input[autocomplete="current-password"]').first();
  await expect(emailInput, `${role.name} login email must be visible`).toBeVisible({ timeout: 25_000 });
  await expect(passwordInput, `${role.name} login password must be visible`).toBeVisible({ timeout: 25_000 });
  await emailInput.fill(role.email);
  await passwordInput.fill(role.password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });
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

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(route.includes('/map') ? 2_000 : 500);
  await expect.poll(() => new URL(page.url()).pathname, {
    message: `${role.name} ${route} must survive browser refresh without wildcard/auth fallback`,
  }).toBe(route);
  const refreshedBody = await page.locator('body').innerText({ timeout: 20_000 });
  expect(refreshedBody.trim().length, `${role.name} ${route} must render after refresh`).toBeGreaterThan(0);
  expect(refreshedBody, `${role.name} ${route} must not crash after refresh`).not.toMatch(CRASH_PATTERN);
  expect(refreshedBody, `${role.name} ${route} must not lose authorization after refresh`).not.toMatch(ACCESS_DENIED);
}

async function assertMobileArabicRoute(page: Page, role: RoleCase, route: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('bin_language', 'ar'));
  const destination = role.baseUrl ? `${role.baseUrl}${route}` : route;
  await page.goto(destination, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(route.includes('/map') ? 2_000 : 600);

  await expect.poll(() => new URL(page.url()).pathname, {
    message: `${role.name} ${route} must remain exact in mobile Arabic mode`,
  }).toBe(route);

  await expect.poll(async () => page.evaluate(() => document.documentElement.dir), {
    message: `${role.name} ${route} must switch the document to RTL`,
  }).toBe('rtl');

  await expect.poll(async () => page.evaluate(() => document.documentElement.lang), {
    message: `${role.name} ${route} must expose Arabic document language`,
  }).toBe('ar');

  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${role.name} ${route} must render on phone viewport`).toBeGreaterThan(0);
  expect(body, `${role.name} ${route} must not crash in mobile Arabic mode`).not.toMatch(CRASH_PATTERN);
  expect(body, `${role.name} ${route} must remain authorized in mobile Arabic mode`).not.toMatch(ACCESS_DENIED);

  const overflow = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    overflow.scrollWidth,
    `${role.name} ${route} must not create page-level horizontal overflow on a 390px viewport`,
  ).toBeLessThanOrEqual(overflow.width + 8);

  if (role.name !== 'Admin') {
    const back = page.getByRole('button', { name: /Back|رجوع/i }).first();
    await expect(back, `${role.name} ${route} must expose a route-aware back control`).toBeVisible({ timeout: 10_000 });
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect.poll(async () => page.evaluate(() => ({
    path: location.pathname,
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
  })), {
    message: `${role.name} ${route} must preserve route + Arabic RTL after refresh`,
  }).toEqual({ path: route, dir: 'rtl', lang: 'ar' });
}

for (const role of roleCases) {
  test(`${role.name} hard-launch routes remain exact and authenticated`, async ({ page }) => {
    test.setTimeout(600_000);
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    await monitor.assertTokenFingerprint();
    await login(page, role);
    for (const route of role.routes) await assertExactRoute(page, role, route);
    for (const route of role.routes) await assertMobileArabicRoute(page, role, route);
    monitor.assertClean(`${role.name} hard-launch exact routes`);
    monitor.assertAuthenticatedFirebaseRead(`${role.name} hard-launch exact routes`);
  });
}
