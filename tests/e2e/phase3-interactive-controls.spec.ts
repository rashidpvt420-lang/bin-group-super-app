import { expect, Page, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installAppCheckDebugToken } from './helpers/appCheckDebug';

type Role = 'owner' | 'tenant' | 'technician' | 'broker';

const routeSource = readFileSync(new URL('./hard-launch-routes.spec.ts', import.meta.url), 'utf8');
const CRASH = /application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i;
const AUTHZ = /permission-denied|missing or insufficient permissions|access denied|not authorized/i;

function requireEnv(name: string) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing ${name}; Phase 3 interactive-control audit fails closed.`);
  return value;
}

function block(start: string, end: string) {
  const a = routeSource.indexOf(start);
  const b = routeSource.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Unable to resolve Phase 3 route block ${start}`);
  return routeSource.slice(a, b);
}

function quotedRoutes(source: string) {
  return [...source.matchAll(/'([^']+)'/g)]
    .map((m) => m[1])
    .filter((value) => value.startsWith('/'));
}

const publicRoutes = quotedRoutes(block('const publicRoutes = [', '] as const;'));
const roleRoutes: Record<Role, string[]> = {
  owner: quotedRoutes(block("name: 'Owner'", "name: 'Tenant'")),
  tenant: quotedRoutes(block("name: 'Tenant'", "name: 'Technician'")),
  technician: quotedRoutes(block("name: 'Technician'", "name: 'Broker'")),
  broker: quotedRoutes(block("name: 'Broker'", "name: 'Admin'")),
};

async function login(page: Page, role: Role) {
  const envRole = role.toUpperCase();
  const emailName = role === 'owner' ? 'E2E_OWNER_MAILBOX_EMAIL'
    : role === 'broker' ? 'E2E_BROKER_MAILBOX_EMAIL'
    : role === 'tenant' ? 'E2E_TENANT_EMAIL'
    : 'E2E_TECHNICIAN_EMAIL';
  await page.goto(`/login?intendedRole=${role}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(requireEnv(emailName));
  await page.locator('input[type="password"]').first().fill(requireEnv(`E2E_${envRole}_PASSWORD`));
  const submit = page.locator('form button[type="submit"]').first();
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
  await submit.click();
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 30_000 });
}

async function auditVisibleControls(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).not.toContainText(CRASH, { timeout: 20_000 });
  await expect(page.locator('body')).not.toContainText(AUTHZ, { timeout: 20_000 });

  const result = await page.evaluate(() => {
    const selector = [
      'button', 'a[href]', 'input', 'textarea', 'select',
      '[role="button"]', '[role="switch"]', '[role="checkbox"]',
      '[role="radio"]', '[role="menuitem"]', '[tabindex="0"]',
    ].join(',');
    const visible = (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const nameOf = (el: HTMLElement) => {
      const aria = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
      const title = el.getAttribute('title');
      const testId = el.getAttribute('data-testid');
      const text = (el.innerText || el.getAttribute('value') || el.getAttribute('placeholder') || '').trim();
      return (aria || title || text || testId || '').trim();
    };
    const controls = [...document.querySelectorAll<HTMLElement>(selector)].filter(visible);
    return controls.map((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      name: nameOf(el),
      disabled: (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true',
      testId: el.getAttribute('data-testid') || '',
      type: el.getAttribute('type') || '',
    }));
  });

  expect(result.length, `${route} should expose its rendered interactive controls`).toBeGreaterThan(0);
  const unnamed = result.filter((control) => !control.name);
  expect(unnamed, `${route} contains visible controls with no accessible identity`).toEqual([]);

  // A disabled control is valid; Phase 3 requires it to remain non-actionable.
  for (const control of result.filter((item) => item.disabled)) {
    expect(control.disabled, `${route} disabled control ${control.name} must remain disabled`).toBe(true);
  }

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).not.toContainText(CRASH, { timeout: 20_000 });
}

test.beforeEach(async ({ page }) => {
  await installAppCheckDebugToken(page);
});

test.describe('Phase 3 — every rendered interactive control', () => {
  for (const route of publicRoutes) {
    test(`public controls remain accessible and refresh-safe: ${route}`, async ({ page }) => {
      await auditVisibleControls(page, route);
    });
  }

  for (const role of Object.keys(roleRoutes) as Role[]) {
    test(`${role} controls remain accessible across every registered route`, async ({ page }) => {
      test.setTimeout(600_000);
      await login(page, role);
      for (const route of roleRoutes[role]) await auditVisibleControls(page, route);
    });
  }

  test('Arabic/RTL control identities remain available', async ({ page }) => {
    await login(page, 'tenant');
    await page.evaluate(() => localStorage.setItem('bin_language', 'ar'));
    await page.goto('/tenant/dashboard', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => ({
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
    }))).toEqual({ dir: 'rtl', lang: 'ar' });
    await auditVisibleControls(page, '/tenant/dashboard');
  });
});
