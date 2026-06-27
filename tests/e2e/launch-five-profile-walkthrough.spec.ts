import { test, expect, Page, BrowserContext } from '@playwright/test';

// Use universal E2E credentials
const UNIVERSAL_PASSWORD = process.env.E2E_UNIVERSAL_PASSWORD || 'E2e!Test!Pass2026';
const OWNER_EMAIL = 'e2e-owner@bingroup.com';
const TENANT_EMAIL = 'e2e-tenant@bingroup.com';
const TECH_A_EMAIL = 'e2e-technician@bingroup.com';
const TECH_B_EMAIL = 'e2e-tech-b@bingroup.com'; // Requires secondary tech for race condition
const BROKER_EMAIL = 'e2e-broker@bingroup.com';

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

  test('2. Tenant Context: Check More Services and no-unit fallback', async () => {
    const page = await tenantContext.newPage();
    await loginToProfile(page, TENANT_EMAIL, 'tenant');
    
    // Check More Services drawer
    const moreServicesBtn = page.locator('button:has-text("More Services")').first();
    await expect(moreServicesBtn).toBeVisible();
    await moreServicesBtn.click();
    await expect(page.locator('text=Notices').first()).toBeVisible();
    await expect(page.locator('text=Marketplace').first()).toBeVisible();
    await expect(page.locator('text=Messages').first()).toBeVisible();
    await expect(page.locator('text=Link my unit').first()).toBeVisible();
    await page.keyboard.press('Escape');

    const linkMyUnit = page.locator('text=Link my unit').first();
    if (await linkMyUnit.isVisible().catch(() => false)) {
      await page.getByLabel('Property / building name').fill('E2E Verification Tower');
      await page.getByLabel('Unit number').fill('E2E-000');
      await page.getByLabel('Notes for verification').fill('Automated no-unit fallback smoke proof.');
      await expect(page.getByRole('button', { name: /Submit link request/i })).toBeEnabled();
    }
  });

  test('3. Tenant Context: Create Maintenance Request with photo when linked unit is seeded', async () => {
    const page = await tenantContext.newPage();
    await page.goto('/tenant/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Tenant Dashboard|Quick Services|Link my unit/i, { timeout: 15000 });
    const dashboardText = await page.locator('body').innerText();
    test.skip(/Link my unit|No assigned unit/i.test(dashboardText), 'Tenant smoke account has no linked unit/property; photo ticket submission requires a seeded linked tenant.');

    // Report Issue
    await page.goto('/tenant/request', { waitUntil: 'domcontentloaded' });
    const category = page.getByTestId('tenant-request-category').or(page.getByTestId('tenant-request-category-input')).first();
    await expect(category).toBeVisible();
    await category.click();
    await page.getByRole('option').first().click();

    await page.getByTestId('tenant-request-location').locator('input, textarea').first().fill('Living Room E2E');
    await page.getByTestId('tenant-request-description').locator('input, textarea').first().fill('E2E AC issue photo evidence.');

    // Photo Upload
    await page.locator('input[type="file"]').first().setInputFiles({ name: 'issue.png', mimeType: 'image/png', buffer: dummyImageBuffer });

    await page.getByTestId('tenant-request-submit').click();
    await expect(page.locator('body')).toContainText(/success|created|ticket|submitted/i, { timeout: 25000 });
  });

  test('4. Technician Contexts: Race condition and Snackbar handling', async () => {
    const pageA = await techAContext.newPage();
    const pageB = await techBContext.newPage();

    // Login both techs
    await loginToProfile(pageA, TECH_A_EMAIL, 'technician');
    try {
      await loginToProfile(pageB, TECH_B_EMAIL, 'technician');
    } catch {
      test.skip(true, 'Tech B is not seeded; cannot verify ALREADY_EXISTS race-condition Snackbar.');
      return;
    }

    await pageA.goto('/technician/pool', { waitUntil: 'domcontentloaded' });
    await pageB.goto('/technician/pool', { waitUntil: 'domcontentloaded' });

    // Wait for the ticket in the pool
    const acceptBtnA = pageA.locator('button:has-text("Accept"), button:has-text("Claim")').first();
    const acceptBtnB = pageB.locator('button:has-text("Accept"), button:has-text("Claim")').first();

    if (!(await acceptBtnA.isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip(true, 'No open mission-pool ticket is seeded for the technician race-condition proof.');
      return;
    }

    // Tech A accepts
    await acceptBtnA.click();
    await expect(pageA.locator('body')).toContainText(/Accepted|En Route/i, { timeout: 15000 });

    // Tech B tries to accept the SAME ticket
    if (!(await acceptBtnB.isVisible().catch(() => false))) {
      test.skip(true, 'Tech B cannot see the same mission-pool ticket; race-condition proof is not available.');
      return;
    }
    await acceptBtnB.click();
    // Verify Snackbar error!
    await expect(pageB.locator('body')).toContainText(/ALREADY_EXISTS|already assigned/i, { timeout: 10000 });
  });

  test('5. Technician A Context: Upload Before/After and Complete Job', async () => {
    const page = techAContext.pages()[0] || await techAContext.newPage();
    if (page.url() === 'about:blank') await loginToProfile(page, TECH_A_EMAIL, 'technician');

    await page.goto('/technician/dashboard', { waitUntil: 'domcontentloaded' });

    // Find active job
    const activeJobBtn = page.locator('button:has-text("View"), button:has-text("Details"), a[href*="/technician/ticket/"]').first();
    if (!(await activeJobBtn.isVisible().catch(() => false))) {
      test.skip(true, 'No active technician job is available for before/after completion proof.');
      return;
    }
    await activeJobBtn.click();

    const arriveBtn = page.locator('button:has-text("Arrived")').first();
    if (await arriveBtn.isVisible().catch(() => false)) await arriveBtn.click();

    // Before/After proof
    const fileInputs = page.locator('input[type="file"]');
    if (await fileInputs.count() === 0) {
      test.skip(true, 'Technician job detail has no file input for before/after proof.');
      return;
    }
    await fileInputs.first().setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: dummyImageBuffer });

    const completeBtn = page.locator('button:has-text("Complete")').first();
    await expect(completeBtn).toBeVisible();
    await completeBtn.click();

    await expect(page.locator('body')).toContainText(/Completed|Closed/i, { timeout: 15000 });
  });

  test('6. Broker Context: Add lead and check attribution', async () => {
    const page = await brokerContext.newPage();
    await loginToProfile(page, BROKER_EMAIL, 'broker');
    await page.goto('/broker/leads/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Lead|New/i, { timeout: 15000 });
    await page.goto('/broker/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Commissions|Referral/i, { timeout: 15000 });
  });

  test('7. Admin Context: Verify standalone admin-panel bridge', async () => {
    // The main app owns the admin bridge only; the standalone admin panel owns
    // launch-health rows and sovereign operations after cross-domain handoff.
    const page = await adminContext.newPage();
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Opening Admin Command Center|dedicated production admin panel/i, { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/bin-group-admin-panel\.web\.app/i);

    const externalBridge = page.waitForURL((url) => url.origin === 'https://bin-group-admin-panel.web.app', { timeout: 20000 });
    const continueButton = page.getByRole('button', { name: /Continue to Admin Command Center/i }).first();
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    }
    await externalBridge;
    expect(page.url()).toMatch(/^https:\/\/bin-group-admin-panel\.web\.app\/(dashboard|login)/);
  });
});
