import { expect, Page, test } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const CRASH_PATTERN = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const ACCESS_DENIED = /permission-denied|unauthenticated|access denied|not authorized|app check|firebase.?app.?check|insufficient permissions/i;
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || '').trim().replace(/\/+$/, '');

type RoleCase = {
  name: string;
  email: string;
  password: string;
  routes: readonly string[];
  baseUrl?: string;
};

const roleCases: RoleCase[] = [
  {
    name: 'Owner',
    email: process.env.E2E_OWNER_EMAIL || '',
    password: process.env.E2E_OWNER_PASSWORD || '',
    routes: ['/owner/dashboard', '/owner/properties', '/owner/contracts', '/owner/financials', '/owner/tenants', '/owner/documents', '/owner/property-passport', '/owner/tickets', '/owner/units', '/owner/roi', '/owner/activation'],
  },
  {
    name: 'Tenant',
    email: process.env.E2E_TENANT_EMAIL || '',
    password: process.env.E2E_TENANT_PASSWORD || '',
    routes: ['/tenant/dashboard', '/tenant/unit', '/tenant/request', '/tenant/tickets', '/tenant/documents', '/tenant/emergency', '/tenant/chat', '/tenant/profile', '/tenant/gate-pass', '/tenant/amenities'],
  },
  {
    name: 'Technician',
    email: process.env.E2E_TECHNICIAN_EMAIL || '',
    password: process.env.E2E_TECHNICIAN_PASSWORD || '',
    routes: ['/technician/dashboard', '/technician/jobs', '/technician/map', '/technician/history', '/technician/hr', '/technician/profile', '/technician/chat'],
  },
  {
    name: 'Broker',
    email: process.env.E2E_BROKER_EMAIL || '',
    password: process.env.E2E_BROKER_PASSWORD || '',
    routes: ['/broker/dashboard', '/broker/leads', '/broker/referrals', '/broker/commissions', '/broker/documents', '/broker/profile'],
  },
  {
    name: 'Admin',
    email: process.env.E2E_ADMIN_EMAIL || '',
    password: process.env.E2E_ADMIN_PASSWORD || '',
    baseUrl: ADMIN_BASE_URL,
    routes: ['/dashboard', '/profile', '/contracts', '/owners', '/tenants', '/tickets', '/technicians', '/sos', '/financials', '/audit'],
  },
];

async function login(page: Page, role: RoleCase) {
  if (!role.email || !role.password || (role.name === 'Admin' && !role.baseUrl)) {
    throw new Error(`Exact-route audit blocked: missing ${role.name} credentials${role.name === 'Admin' ? ' or E2E_ADMIN_BASE_URL' : ''}.`);
  }
  const loginUrl = role.baseUrl ? `${role.baseUrl}/login` : '/login';
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(role.email);
  await page.locator('input[type="password"]').first().fill(role.password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2_000);
}

async function assertExactRoute(page: Page, role: RoleCase, route: string) {
  const destination = role.baseUrl ? `${role.baseUrl}${route}` : route;
  await page.goto(destination, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(route.includes('/map') ? 2_500 : 900);
  await expect.poll(() => new URL(page.url()).pathname, {
    message: `${role.name} ${route} must remain on its registered route rather than a wildcard redirect`,
  }).toBe(route);
  const body = await page.locator('body').innerText({ timeout: 20_000 });
  expect(body.trim().length, `${role.name} ${route}: body must render`).toBeGreaterThan(0);
  expect(body, `${role.name} ${route}: no runtime crash`).not.toMatch(CRASH_PATTERN);
  expect(body, `${role.name} ${route}: no access denial`).not.toMatch(ACCESS_DENIED);
}

for (const role of roleCases) {
  test(`${role.name} registered routes do not silently redirect`, async ({ page }) => {
    test.setTimeout(150_000);
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    await monitor.assertTokenFingerprint();
    await login(page, role);
    for (const route of role.routes) await assertExactRoute(page, role, route);
    monitor.assertClean(`${role.name} exact-route audit`);
    monitor.assertAuthenticatedFirebaseRead(`${role.name} exact-route audit`);
  });
}
