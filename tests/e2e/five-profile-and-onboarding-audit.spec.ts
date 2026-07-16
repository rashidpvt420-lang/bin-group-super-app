import { expect, test, Page } from '@playwright/test';
import {
  adminUrl,
  loginAdminPanel,
  loginMainRole,
  requireEnv,
  waitForAdminLoader,
} from './helpers/profileReadiness';

const CRASH = /application error|unhandled runtime error|chunkloaderror|minified react error|SOVEREIGN_FAILURE/i;
const ACCESS_DENIED = /permission-denied|missing or insufficient permissions|unauthenticated/i;

async function assertRtl(page: Page) {
  const rtl = await page.evaluate(() => {
    if (document.querySelector('[dir="rtl"]')) return true;
    return getComputedStyle(document.body).direction === 'rtl' || getComputedStyle(document.documentElement).direction === 'rtl';
  });
  expect(rtl).toBe(true);
}

async function assertMobileNoHorizontalOverflow(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
  const overflow = await page.evaluate(() => {
    const width = Math.max(document.documentElement.scrollWidth, document.body?.scrollWidth || 0);
    return width - window.innerWidth;
  });
  expect(overflow).toBeLessThanOrEqual(8);
}

const roleProfiles = [
  {
    role: 'owner' as const,
    emailEnv: 'E2E_OWNER_EMAIL',
    passwordEnv: 'E2E_OWNER_PASSWORD',
    heading: /Owner Profile|ملف المالك/i,
    save: /Save Owner Profile|حفظ ملف المالك/i,
    success: /Owner profile updated successfully|تم تحديث ملف المالك بنجاح/i,
    arabic: /ملف المالك/i,
    canSave: true,
  },
  {
    role: 'tenant' as const,
    emailEnv: 'E2E_TENANT_EMAIL',
    passwordEnv: 'E2E_TENANT_PASSWORD',
    heading: /Tenant Profile|ملف المستأجر/i,
    save: /Save Profile|حفظ الملف/i,
    success: /Tenant profile updated successfully|تم تحديث ملف المستأجر بنجاح/i,
    arabic: /ملف المستأجر/i,
    canSave: true,
  },
  {
    role: 'technician' as const,
    emailEnv: 'E2E_TECHNICIAN_EMAIL',
    passwordEnv: 'E2E_TECHNICIAN_PASSWORD',
    heading: /Technician Profile|ملف الفني/i,
    save: /Save Profile|Update Profile|حفظ الملف|تحديث الملف/i,
    success: /Technician profile updated successfully|تم تحديث ملف الفني بنجاح/i,
    arabic: /ملف الفني/i,
    canSave: true,
  },
  {
    role: 'broker' as const,
    emailEnv: 'E2E_BROKER_EMAIL',
    passwordEnv: 'E2E_BROKER_PASSWORD',
    heading: /Broker Profile|ملف الوسيط/i,
    save: /Submit|Save|إرسال|حفظ/i,
    success: /submitted securely|up to date|تم إرسال|محدث بالفعل/i,
    arabic: /ملف الوسيط/i,
    canSave: false,
  },
];

test.describe('Five-profile browser audit', () => {
  for (const profile of roleProfiles) {
    test(`${profile.role} profile renders, reloads, supports Arabic RTL and fits mobile`, async ({ page }) => {
      test.setTimeout(120_000);
      await loginMainRole(page, profile.role, requireEnv(profile.emailEnv), requireEnv(profile.passwordEnv));
      await page.goto(`/${profile.role}/profile`, { waitUntil: 'domcontentloaded' });
      await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);

      const body = page.locator('body');
      await expect(body).not.toContainText(CRASH, { timeout: 15_000 });
      await expect(body).not.toContainText(ACCESS_DENIED, { timeout: 15_000 });
      await expect(body).toContainText(profile.heading, { timeout: 20_000 });
      await expect(page.locator('input').first()).toBeVisible({ timeout: 15_000 });

      if (profile.canSave) {
        const firstInput = page.locator('input').first();
        const originalValue = await firstInput.inputValue();
        expect(originalValue.trim().length).toBeGreaterThan(0);
        await page.getByRole('button', { name: profile.save }).first().click();
        await expect(body).toContainText(profile.success, { timeout: 20_000 });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
        await expect(page.locator('input').first()).toHaveValue(originalValue, { timeout: 15_000 });
      }

      await page.evaluate(() => localStorage.setItem('bin_language', 'ar'));
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
      await expect(page.locator('body')).toContainText(profile.arabic, { timeout: 20_000 });
      await assertRtl(page);
      await assertMobileNoHorizontalOverflow(page);
    });
  }

  test('Admin operational settings render in RTL and mobile while personal profile remains tracked separately', async ({ page }) => {
    test.setTimeout(120_000);
    await loginAdminPanel(page, requireEnv('E2E_ADMIN_EMAIL'), requireEnv('E2E_ADMIN_PASSWORD'));
    await page.goto(adminUrl('/settings'), { waitUntil: 'domcontentloaded' });
    await waitForAdminLoader(page);
    await expect(page.locator('body')).not.toContainText(CRASH, { timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText(ACCESS_DENIED, { timeout: 15_000 });
    await page.evaluate(() => localStorage.setItem('bin_language', 'ar'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAdminLoader(page);
    await assertRtl(page);
    await assertMobileNoHorizontalOverflow(page);
  });

  test.fixme('Admin has a dedicated /profile route with MFA, sessions, devices and security history');
});

test.describe('Owner onboarding browser audit', () => {
  test('account stage precedes property stage and local persistence contains only safe draft coordinates', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Company/i, { timeout: 20_000 });

    const stageLabels = await page.locator('.MuiStepLabel-label').allTextContents();
    const accountIndex = stageLabels.findIndex((label) => /Account/i.test(label));
    const propertyIndex = stageLabels.findIndex((label) => /Property/i.test(label));
    expect(accountIndex).toBeGreaterThanOrEqual(0);
    expect(propertyIndex).toBeGreaterThan(accountIndex);

    const firstInput = page.locator('input').first();
    await expect(firstInput).toBeVisible({ timeout: 15_000 });
    await firstInput.fill('E2E Minimal Draft');
    await page.waitForFunction(() => Boolean(localStorage.getItem('bin-group-onboarding-v3')));

    const persisted = await page.evaluate(() => {
      const raw = localStorage.getItem('bin-group-onboarding-v3');
      return raw ? JSON.parse(raw) : null;
    });
    expect(persisted?.version).toBe(4);
    expect(Object.keys(persisted?.state || {}).sort()).toEqual(['intakeId', 'step']);
    const serialized = JSON.stringify(persisted);
    for (const sensitive of ['password', 'kycUrls', 'paymentManifest', 'signatureName', 'ownerAccount', 'proofDocuments']) {
      expect(serialized).not.toContain(sensitive);
    }

    await page.evaluate(() => localStorage.setItem('bin_language', 'ar'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/الشركة/);
    await expect(page.locator('body')).toContainText(/الحساب/);
    await expect(page.locator('body')).toContainText(/العقار/);
    await assertRtl(page);
    await assertMobileNoHorizontalOverflow(page);
  });
});
