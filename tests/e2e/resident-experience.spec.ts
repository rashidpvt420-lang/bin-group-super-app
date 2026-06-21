import { test, expect, Page } from '@playwright/test';

const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL ?? '';
const TENANT_PASSWORD = process.env.E2E_TENANT_PASSWORD ?? '';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

async function loginTenant(page: Page) {
  const appCheckToken = process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
  if (appCheckToken) {
    await page.addInitScript(`window.FIREBASE_APPCHECK_DEBUG_TOKEN = "${appCheckToken}";`);
  }

  await page.context().clearCookies();
  await page.goto('/login?intendedRole=tenant&refresh=' + Date.now(), { waitUntil: 'domcontentloaded' });
  
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(TENANT_EMAIL);
  await page.locator('input[type="password"]').first().fill(TENANT_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();

  await page.waitForURL('**/tenant/dashboard', { timeout: 20_000 });
}

async function loginAdmin(page: Page) {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').first().fill(ADMIN_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/admin/dashboard', { timeout: 20_000 });
}

test.describe('Resident Experience & Building Operations E2E', () => {
  test('Tenant can access all experience module routes', async ({ page }) => {
    test.skip(!TENANT_EMAIL || !TENANT_PASSWORD, 'Tenant credentials not set');
    test.setTimeout(90_000);
    await loginTenant(page);

    const routes = [
      '/tenant/notices',
      '/tenant/documents',
      '/tenant/keys',
      '/tenant/parcels',
      '/tenant/visitor-parking',
      '/tenant/marketplace',
      '/tenant/staff-directory',
      '/tenant/messages',
      '/tenant/community',
      '/tenant/amenities'
    ];

    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(route), { timeout: 15_000 });
      await expect(page.locator('body')).not.toContainText(/permission-denied|unauthorized|missing or insufficient permissions/i);
    }
  });

  test('Admin can access all operation module routes', async ({ page }) => {
    test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Admin credentials not set');
    test.setTimeout(90_000);
    await loginAdmin(page);

    const routes = [
      '/ops/amenity-control',
      '/ops/announcements',
      '/ops/document-library',
      '/ops/key-register',
      '/ops/parcel-desk',
      '/ops/visitor-parking',
      '/ops/marketplace-approvals',
      '/ops/staff-directory',
      '/ops/messages',
      '/ops/community-moderation'
    ];

    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(new RegExp(route), { timeout: 15_000 });
      await expect(page.locator('body')).not.toContainText(/permission-denied|unauthorized|missing or insufficient permissions/i);
    }
  });

  test('Tenant can request visitor parking space', async ({ page }) => {
    test.skip(!TENANT_EMAIL || !TENANT_PASSWORD, 'Tenant credentials not set');
    test.setTimeout(60_000);
    await loginTenant(page);

    await page.goto('/tenant/visitor-parking', { waitUntil: 'domcontentloaded' });
    
    // Fill form
    await page.locator('input[label="Visitor Name"], input[name*="visitor" i], label:has-text("Visitor Name") + div input').first().fill('John Doe');
    await page.locator('input[label="Vehicle Plate"], input[name*="plate" i], label:has-text("Vehicle Plate") + div input').first().fill('DXB-A-12345');
    
    // Submit
    const requestBtn = page.locator('button:has-text("REQUEST PASS"), button:has-text("SUBMIT"), button:has-text("Request Pass")').first();
    await expect(requestBtn).toBeEnabled();
    await requestBtn.click();

    // Verify list updates or success is logged
    await page.waitForTimeout(2000);
    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toContain('DXB-A-12345');
  });

  test('Tenant can request amenity booking', async ({ page }) => {
    test.skip(!TENANT_EMAIL || !TENANT_PASSWORD, 'Tenant credentials not set');
    test.setTimeout(60_000);
    await loginTenant(page);

    await page.goto('/tenant/amenities', { waitUntil: 'domcontentloaded' });

    // Select first bookable amenity button
    const bookBtn = page.locator('button:has-text("BOOK NOW"), button:has-text("Book Now"), button:has-text("BOOK")').first();
    if (await bookBtn.isVisible()) {
      await bookBtn.click();
      
      // Confirm inside dialog
      const confirmBtn = page.locator('button:has-text("CONFIRM BOOKING"), button:has-text("Confirm Booking"), button:has-text("BOOK")').first();
      await confirmBtn.click();
      
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').innerText();
      expect(bodyText).toContain('booked');
    }
  });
});
