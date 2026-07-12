import { test, expect, Page, BrowserContext } from '@playwright/test';
import { installAppCheckDebugToken, assertAppCheckDebugTokenInPage, collectAppCheckFailures } from './helpers/appCheckDebug';

function requireEnv(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Credentialed tests fail closed without secrets.`);
  }
  return value;
}

const OWNER_EMAIL = () => requireEnv('E2E_OWNER_EMAIL');
const TENANT_EMAIL = () => requireEnv('E2E_TENANT_EMAIL');
const TECH_A_EMAIL = () => requireEnv('E2E_TECHNICIAN_EMAIL');
const BROKER_EMAIL = () => requireEnv('E2E_BROKER_EMAIL');

function rolePassword(role: 'OWNER' | 'TENANT' | 'TECHNICIAN' | 'BROKER' | 'ADMIN'): string {
  return requireEnv(`E2E_${role}_PASSWORD`);
}

/** Optional second technician for race-condition walkthrough only (not launch-critical). */
function optionalTechBCredentials(): { email: string; password: string } | null {
  const email = String(process.env.E2E_TECHNICIAN_B_EMAIL || '').trim();
  const password = String(process.env.E2E_TECHNICIAN_B_PASSWORD || '').trim();
  if (!email && !password) return null;
  if (!email || !password) {
    throw new Error(
      'E2E_TECHNICIAN_B_EMAIL and E2E_TECHNICIAN_B_PASSWORD must both be set together. Do not reuse E2E_TECHNICIAN_PASSWORD.',
    );
  }
  return { email, password };
}

const dummyImageBuffer = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581e20000000049454e44ae426082', 'hex');

async function loginToProfile(page: Page, email: string, role: string, password: string) {
  await page.goto(`/login?intendedRole=${role}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.goto(`/login?intendedRole=${role}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
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
    await loginToProfile(page, OWNER_EMAIL(), 'owner', rolePassword('OWNER'));
    await expect(page.locator('body')).toContainText(/Properties|Contract|No owner profile/i, { timeout: 15000 });
    // Check Vault link
    const vaultBtn = page.locator('text=Document Vault').or(page.locator('[data-testid="owner-vault"]')).first();
    if (await vaultBtn.isVisible().catch(() => false)) await vaultBtn.click();
    await expect(page).toHaveURL(/.*owner.*/);
  });

  test('2. Tenant Context: Check More Services and no-unit fallback', async () => {
    const page = await tenantContext.newPage();
    await loginToProfile(page, TENANT_EMAIL(), 'tenant', rolePassword('TENANT'));
    
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

    // Login both techs (Tech B is optional; when present, B password must be its own env var).
    await loginToProfile(pageA, TECH_A_EMAIL(), 'technician', rolePassword('TECHNICIAN'));
    const techB = optionalTechBCredentials();
    if (!techB) {
      test.skip(true, 'Tech B credentials not provided; cannot verify ALREADY_EXISTS race-condition Snackbar.');
      return;
    }
    await loginToProfile(pageB, techB.email, 'technician', techB.password);

    await pageA.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
    await pageB.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });

    // Wait for the ticket in the open job pool
    const acceptBtnA = pageA.getByRole('button', { name: /ACCEPT JOB|Accept Job|Accept Mission|Claim/i }).first();
    const acceptBtnB = pageB.getByRole('button', { name: /ACCEPT JOB|Accept Job|Accept Mission|Claim/i }).first();

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
    if (page.url() === 'about:blank') await loginToProfile(page, TECH_A_EMAIL(), 'technician', rolePassword('TECHNICIAN'));

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
    await loginToProfile(page, BROKER_EMAIL(), 'broker', rolePassword('BROKER'));
    await page.goto('/broker/leads/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Lead|New/i, { timeout: 15000 });

    const clientName = page.getByTestId('broker-lead-client-name');
    if (await clientName.isVisible().catch(() => false)) {
      await clientName.fill(`Walkthrough Lead ${Date.now()}`);
      const phone = page.getByLabel(/Phone Number/i);
      if (await phone.isVisible().catch(() => false)) await phone.fill('+971501234567');
      const submit = page.getByTestId('broker-lead-submit');
      if (await submit.isEnabled().catch(() => false)) {
        await submit.click();
        await expect(page.locator('body')).toContainText(/success|submitted|created|lead/i, { timeout: 20000 });
      }
    }

    await page.goto('/broker/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Commissions|Referral/i, { timeout: 15000 });
  });

  test('7. Admin Context: Verify standalone admin-panel bridge and credentialed login', async () => {
    const adminBase = String(process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app').replace(/\/+$/, '');
    const page = await adminContext.newPage();
    await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(/Opening Admin Command Center|dedicated production admin panel/i, { timeout: 10000 });
    await expect(page.locator('body')).toContainText(/bin-group-admin-panel\.web\.app/i);

    const continueButton = page.getByRole('button', { name: /Continue to Admin Command Center/i }).first();
    if (await continueButton.isVisible().catch(() => false)) {
      await continueButton.click();
    }

    await page.waitForURL((url) => url.origin === new URL(adminBase).origin, { timeout: 20000 });
    expect(page.url()).toMatch(new RegExp(`^${adminBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(dashboard|login)`));

    if (page.url().includes('/login')) {
      await page.locator('input[type="email"], input[name*="email" i]').first().fill(requireEnv('E2E_ADMIN_EMAIL'));
      await page.locator('input[type="password"]').first().fill(rolePassword('ADMIN'));
      await page.locator('form button[type="submit"]').first().click();
      await page.waitForURL(`${adminBase}/dashboard`, { timeout: 25000 });
    }

    await expect(page.locator('body')).not.toContainText(/auth\/invalid-credential|permission-denied|SOVEREIGN_FAILURE/i, { timeout: 15000 });
    await expect(page.locator('body')).toContainText(/Admin|Dashboard|Command/i, { timeout: 15000 });

    await page.goto(`${adminBase}/sos`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-sos-feed')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).toContainText(/SOS|Emergency|emergency/i, { timeout: 15000 });
  });
});

test.beforeEach(async ({ page }) => {
  await installAppCheckDebugToken(page);
});
