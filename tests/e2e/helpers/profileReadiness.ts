import { expect, Page } from '@playwright/test';

export const SEED_IDS = {
  sosTicket: 'e2e-live-sos-ticket',
  ownerPaymentPending: 'e2e-live-owner-payment-pending',
  poolTicket: 'e2e-live-pool-ticket-open',
  technicianTicket: (uid: string) => `e2e-live-technician-ticket-${uid.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80)}`,
  technicianCompleted: (uid: string) => `e2e-live-technician-completed-${uid.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 80)}`,
} as const;

export function requireEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Profile readiness tests fail closed without secrets.`);
  }
  return value;
}

export function adminBaseUrl(): string {
  return requireEnv('E2E_ADMIN_BASE_URL').replace(/\/+$/, '');
}

export function adminUrl(pathname: string): string {
  const base = adminBaseUrl();
  return `${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

export async function loginMainRole(page: Page, role: 'owner' | 'tenant' | 'technician' | 'broker', email: string, password: string) {
  await page.goto(`/login?intendedRole=${role}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`/login?intendedRole=${role}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(`**/${role}/dashboard`, { timeout: 25_000 });
  await expect(page.locator('body')).not.toContainText(/SOVEREIGN_FAILURE|permission-denied|missing or insufficient permissions/i, { timeout: 15_000 });
}

export async function loginAdminPanel(page: Page, email: string, password: string) {
  await page.goto(adminUrl('/login'), { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL(`${adminBaseUrl()}/dashboard`, { timeout: 25_000 });
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|auth\/invalid-credential/i, { timeout: 15_000 });
}

export async function waitForAdminLoader(page: Page) {
  await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
}
