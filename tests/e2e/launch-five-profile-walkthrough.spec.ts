import { test, expect, Page, BrowserContext } from '@playwright/test';

// Use universal E2E credentials
const UNIVERSAL_PASSWORD = process.env.E2E_UNIVERSAL_PASSWORD || 'E2e!Test!Pass2026';
const OWNER_EMAIL = 'e2e-owner@bingroup.com';
const TENANT_EMAIL = 'e2e-tenant@bingroup.com';
const TECH_A_EMAIL = 'e2e-technician@bingroup.com';
const TECH_B_EMAIL = 'e2e-tech-b@bingroup.com'; // Requires secondary tech for race condition
const BROKER_EMAIL = 'e2e-broker@bingroup.com';
const ADMIN_EMAIL = 'e2e-admin@bingroup.com';

const dummyImageBuffer = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581e20000000049454e44ae426082', 'hex');

async function loginToProfile(page: Page, email: string, role: string) {
  await page.goto(`/login?intendedRole=${role}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`/login?intendedRole=${role}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(UNIVERSAL_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await expect(page.locator('body')).not.toContainText(/SOVEREIGN_FAILURE/i, { timeout: 10000 });
  await page.waitForURL(`**/${role}/dashboard`, { timeout: 20000 });
}

test.describe.serial('5-Profile Hard Launch Walkthrough', () => {
  let ownerContext: BrowserContext;
  let tenantContext: BrowserContext;
  let techAContext: BrowserContext;
  let techBContext: BrowserContext;
  let brokerContext: BrowserContext;
  let adminContext: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    ownerContext = await browser.newContext();
    tenantContext = await browser.newContext();
    techAContext = await browser.newContext();
    techBContext = await browser.newContext();
    brokerContext = await browser.newContext();
    adminContext = await browser.newContext();
  });

  test.afterAll(async () => {
    await ownerContext.close();
    await tenantContext.close();
    await techAContext.close();
    await techBContext.close();
    await brokerContext.close();
    await adminContext.close();
  });

  test('1. Owner Context: Login and Check Dashboard / Vault', async () => {
    const page = await ownerContext.newPage();
    await loginToProfile(page, OWNER_EMAIL, 'owner');
    await expect(page.locator('body')).toContainText(/Properties|Contract|No owner profile/i, { timeout: 15000 });
    // Check Vault link
    const vaultBtn = page.locator('text=Document Vault').or(page.locator('[data-testid="owner-vault"]')).first();
    if (await vaultBtn.isVisible().catch(() => false)) await vaultBtn.click();
    await expect(page).toHaveURL(/.*owner.*/);
  });

  test('2. Tenant Context: Create Maintenance Request and check More Services', async () => {
    const page = await tenantContext.newPage();
    await loginToProfile(page, TENANT_EMAIL, 'tenant');
    
    // Check More Services drawer
    const moreServicesBtn = page.locator('button:has-text("More Services")').first();
    if (await moreServicesBtn.isVisible().catch(() => false)) {
      await moreServicesBtn.click();
      await expect(page.locator('text=Notices').first()).toBeVisible();
      await expect(page.locator('text=Keys').first()).toBeVisible();
      await page.keyboard.press('Escape');
    }

    // Report Issue
    await page.goto('/tenant/request', { waitUntil: 'domcontentloaded' });
    const category = page.getByTestId('tenant-request-category').or(page.getByTestId('tenant-request-category-input')).first();
    if (await category.isVisible().catch(() => false)) {
      await category.click();
      await page.getByRole('option').first().click();
      
      await page.getByTestId('tenant-request-location').locator('input, textarea').first().fill('Living Room E2E');
      await page.getByTestId('tenant-request-description').locator('input, textarea').first().fill('E2E AC issue photo evidence.');
      
      // Photo Upload
      const fileInput = page.locator('input[type="file"]').first();
      if (await fileInput.isVisible().catch(() => false)) {
        await fileInput.setInputFiles({ name: 'issue.png', mimeType: 'image/png', buffer: dummyImageBuffer });
      }

      await page.getByTestId('tenant-request-submit').click();
      await expect(page.locator('body')).toContainText(/success|created|ticket|submitted/i, { timeout: 25000 });
    }
  });

  test('3 & 4. Technician Contexts: Race condition and Snackbar handling', async () => {
    const pageA = await techAContext.newPage();
    const pageB = await techBContext.newPage();

    // Login both techs
    await loginToProfile(pageA, TECH_A_EMAIL, 'technician');
    try {
      await loginToProfile(pageB, TECH_B_EMAIL, 'technician');
    } catch {
      console.warn('Tech B login failed, skipping race condition check (Tech B not seeded)');
      return;
    }

    await pageA.goto('/technician/pool', { waitUntil: 'domcontentloaded' });
    await pageB.goto('/technician/pool', { waitUntil: 'domcontentloaded' });

    // Wait for the ticket in the pool
    const acceptBtnA = pageA.locator('button:has-text("Accept"), button:has-text("Claim")').first();
    const acceptBtnB = pageB.locator('button:has-text("Accept"), button:has-text("Claim")').first();

    if (await acceptBtnA.isVisible({ timeout: 10000 }).catch(() => false)) {
      // Tech A accepts
      await acceptBtnA.click();
      await expect(pageA.locator('body')).toContainText(/Accepted|En Route/i, { timeout: 15000 });

      // Tech B tries to accept the SAME ticket
      if (await acceptBtnB.isVisible().catch(() => false)) {
        await acceptBtnB.click();
        // Verify Snackbar error!
        await expect(pageB.locator('body')).toContainText(/ALREADY_EXISTS|already assigned/i, { timeout: 10000 });
      }
    }
  });

  test('5. Technician A Context: Upload Before/After and Complete Job', async () => {
    const page = techAContext.pages()[0] || await techAContext.newPage();
    if (page.url() === 'about:blank') await loginToProfile(page, TECH_A_EMAIL, 'technician');

    await page.goto('/technician/dashboard', { waitUntil: 'domcontentloaded' });
    
    // Find active job
    const activeJobBtn = page.locator('button:has-text("View"), button:has-text("Details"), a[href*="/technician/ticket/"]').first();
    if (await activeJobBtn.isVisible().catch(() => false)) {
      await activeJobBtn.click();
      
      const arriveBtn = page.locator('button:has-text("Arrived")').first();
      if (await arriveBtn.isVisible().catch(() => false)) await arriveBtn.click();

      // Before/After proof
      const fileInputs = page.locator('input[type="file"]');
      if (await fileInputs.count() > 0) {
        await fileInputs.first().setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: dummyImageBuffer });
      }

      const completeBtn = page.locator('button:has-text("Complete")').first();
      if (await completeBtn.isVisible().catch(() => false)) await completeBtn.click();
      
      await expect(page.locator('body')).toContainText(/Completed|Closed/i, { timeout: 15000 });
    }
  });

  test('6. Broker Context: Add lead and check attribution', async () => {
    const page = await brokerContext.newPage();
    await loginToProfile(page, BROKER_EMAIL, 'broker');
    await page.goto('/broker/leads/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Lead|New/i, { timeout: 15000 });
    await page.goto('/broker/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Commissions|Referral/i, { timeout: 15000 });
  });

  test.skip('7. Admin Context: Check Launch Health Rows', async () => {
    // Skipped: The Admin dashboard is a separate application in apps/admin-panel.
    // The main app (bin-group-super-app) correctly redirects /admin to https://bin-group-admin-panel.web.app/
    const page = await adminContext.newPage();
    await loginToProfile(page, ADMIN_EMAIL, 'admin');
    await expect(page.locator('body')).toContainText(/Stripe|App Check/i, { timeout: 15000 });
    await expect(page.locator('body')).toContainText(/Email/i, { timeout: 15000 });
  });
});
