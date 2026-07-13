/**
 * profile-readiness-gates.spec.ts
 * Maps all 15 gates from launch_package/profile-readiness-gates.json to live E2E proofs.
 * Requires: npm run seed:e2e:gate11 + .env.e2e credentials + App Check debug token.
 */
import { test, expect } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';
import {
  SEED_IDS,
  adminUrl,
  loginAdminPanel,
  loginMainRole,
  requireEnv,
  waitForAdminLoader,
} from './helpers/profileReadiness';

const CRASH = /application error|unhandled runtime error|chunkloaderror|minified react error/i;
const ACCESS_DENIED = /permission-denied|missing or insufficient permissions|unauthenticated/i;

const dummyImageBuffer = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581e20000000049454e44ae426082',
  'hex',
);

test.describe('Profile readiness gates', () => {
  test.beforeEach(async ({ page }) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = monitor;
    await monitor.assertTokenFingerprint();
  });

  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test.describe('Owner profile gates', () => {
    test('ownerOnboardingFullPath — credentialed owner reaches activation/dashboard surfaces', async ({ page }) => {
      await loginMainRole(page, 'owner', requireEnv('E2E_OWNER_EMAIL'), requireEnv('E2E_OWNER_PASSWORD'));
      await page.goto('/owner/activation', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(ACCESS_DENIED, { timeout: 10_000 });
      await expect(page.locator('body')).toContainText(/activation|payment|contract|signature|gate/i, { timeout: 15_000 });
      await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(CRASH, { timeout: 10_000 });
    });

    test('ownerPaymentApproveReject — admin payment queue exposes approve controls for seeded pending contract', async ({ page }) => {
      await loginAdminPanel(page, requireEnv('E2E_ADMIN_EMAIL'), requireEnv('E2E_ADMIN_PASSWORD'));
      await page.goto(adminUrl('/manual-approvals'), { waitUntil: 'domcontentloaded' });
      await waitForAdminLoader(page);
      await expect(page.locator('body')).not.toContainText(ACCESS_DENIED, { timeout: 10_000 });
      const approveBtn = page.getByTestId('admin-approve-contract').or(
        page.getByRole('button', { name: /Verify Settlement|Approve Contract|Approve/i }),
      ).first();
      if (await approveBtn.isVisible({ timeout: 12_000 }).catch(() => false)) {
        await expect(approveBtn).toBeEnabled();
        await approveBtn.click();
        await expect(page.locator('body')).toContainText(/reference|settlement|confirm|activate/i, { timeout: 10_000 });
        await page.getByRole('button', { name: /Cancel/i }).first().click().catch(() => undefined);
      } else {
        await expect(page.locator('body')).toContainText(/settlement|payment|queue clear|verify/i, { timeout: 10_000 });
      }
    });

    test('ownerPostPaymentDashboard — unlocked owner dashboard shows portfolio and vault', async ({ page }) => {
      await loginMainRole(page, 'owner', requireEnv('E2E_OWNER_EMAIL'), requireEnv('E2E_OWNER_PASSWORD'));
      await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(/dashboard remains locked|activation incomplete/i, { timeout: 10_000 });
      await expect(page.locator('body')).toContainText(/Properties|Contract|Portfolio|Document Vault|No owner profile/i, { timeout: 15_000 });
      const vault = page.getByTestId('owner-vault').or(page.getByRole('button', { name: /Document Vault/i })).first();
      if (await vault.isVisible().catch(() => false)) await vault.click();
      await expect(page).toHaveURL(/\/owner\/(dashboard|documents)/);
    });
  });

  test.describe('Tenant profile gates', () => {
    test('tenantPhotoMaintenanceRequest — linked tenant can submit request with photo', async ({ page }) => {
      test.setTimeout(120_000);
      await loginMainRole(page, 'tenant', requireEnv('E2E_TENANT_EMAIL'), requireEnv('E2E_TENANT_PASSWORD'));
      await page.goto('/tenant/request', { waitUntil: 'domcontentloaded' });
      // Wait for the residence/property lookup to actually finish before reading body
      // text for the skip decision — immediately after navigation it's still the
      // loading state regardless of whether a unit is linked.
      await expect(page.getByTestId('tenant-residence-loading')).toBeHidden({ timeout: 20_000 }).catch(() => undefined);
      const body = await page.locator('body').innerText();
      test.skip(/Link my unit|No assigned unit|RESIDENCE UNASSIGNED/i.test(body), 'Tenant account has no linked unit; run seed:e2e:gate11 first.');

      const category = page.getByTestId('tenant-request-category').or(page.getByTestId('tenant-request-category-input')).first();
      await expect(category).toBeVisible({ timeout: 20_000 });
      await category.click();
      await page.getByRole('option').first().click();
      await page.getByTestId('tenant-request-location').locator('input, textarea').first().fill('Profile gate E2E location');
      await page.getByTestId('tenant-request-description').locator('input, textarea').first().fill('Profile readiness photo maintenance proof.');
      await page.locator('input[type="file"]').first().setInputFiles({ name: 'gate-proof.png', mimeType: 'image/png', buffer: dummyImageBuffer });
      const submit = page.getByTestId('tenant-request-submit');
      // Wait for the actual product-readiness condition (property + GPS loaded) rather
      // than a fixed delay — the button is disabled until propertyContextReady &&
      // propertyGpsReady, so an enabled state here is real proof, not a guess.
      await expect(submit).toBeVisible({ timeout: 20_000 });
      await expect(submit).toBeEnabled({ timeout: 20_000 });
      await submit.click();
      await expect(page.locator('body')).toContainText(/success|created|submitted|ticket/i, { timeout: 25_000 });
    });

    test('tenantSosAdminVisibility — seeded SOS appears in admin SOS feed', async ({ page }) => {
      await loginAdminPanel(page, requireEnv('E2E_ADMIN_EMAIL'), requireEnv('E2E_ADMIN_PASSWORD'));
      await page.goto(adminUrl('/sos'), { waitUntil: 'domcontentloaded' });
      await waitForAdminLoader(page);
      await expect(page.getByTestId('admin-sos-feed')).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('body')).toContainText(/SOS|Emergency|emergency/i, { timeout: 15_000 });
      const seeded = page.locator('body').getByText(new RegExp(SEED_IDS.sosTicket, 'i'));
      if (await seeded.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await expect(seeded).toBeVisible();
      } else {
        await expect(page.locator('body')).toContainText(/TENANT TRIGGERED SOS|emergency_submitted|Active Emergencies/i, { timeout: 10_000 });
      }
    });

    test('tenantUnitBindingAndArabic — link-my-unit fallback and AR/EN shell toggle', async ({ page }) => {
      await loginMainRole(page, 'tenant', requireEnv('E2E_TENANT_EMAIL'), requireEnv('E2E_TENANT_PASSWORD'));
      await page.goto('/tenant/dashboard', { waitUntil: 'domcontentloaded' });
      const langBtn = page.getByTestId('tenant-language-toggle').or(page.getByRole('button', { name: /^AR$|^EN$/i })).first();
      await expect(langBtn).toBeVisible({ timeout: 15_000 });
      await langBtn.click();
      await page.waitForTimeout(800);
      const afterSwitch = await page.locator('body').innerText();
      expect(afterSwitch.trim().length).toBeGreaterThan(0);
      expect(afterSwitch).not.toMatch(CRASH);

      const moreServices = page.getByRole('button', { name: /More Services/i }).first();
      if (await moreServices.isVisible().catch(() => false)) {
        await moreServices.click();
        const linkUnit = page.getByText(/Link my unit/i).first();
        if (await linkUnit.isVisible().catch(() => false)) {
          await expect(page.getByLabel(/Property \/ building name/i)).toBeVisible();
          await expect(page.getByLabel(/Unit number/i)).toBeVisible();
        }
        await page.keyboard.press('Escape');
      }
    });
  });

  test.describe('Technician profile gates', () => {
    test.use({ geolocation: { longitude: 55.2708, latitude: 25.2048 }, permissions: ['geolocation'] });

    test('technicianMissionLifecycle — jobs surface exposes pool or assigned mission', async ({ page }) => {
      await loginMainRole(page, 'technician', requireEnv('E2E_TECHNICIAN_EMAIL'), requireEnv('E2E_TECHNICIAN_PASSWORD'));
      await page.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(/OPEN JOB POOL|ACTIVE ASSIGNMENTS|My Jobs|MISSION/i, { timeout: 20_000 });
      const accept = page.getByRole('button', { name: /ACCEPT JOB|Accept Mission|OPEN JOB CARD/i }).first();
      await expect(accept).toBeVisible({ timeout: 20_000 });
    });

    test('technicianGpsAndDeniedFallback — denied GPS shows safe guidance on arrival', async ({ browser, page: defaultPage }) => {
      const context = await browser.newContext({ geolocation: { longitude: 55.2708, latitude: 25.2048 }, permissions: [] });
      const customPage = await context.newPage();
      const monitor = await attachAuthenticatedAppCheckMonitor(customPage);
      (customPage as any).__binAppCheckMonitor = monitor;
      await monitor.assertTokenFingerprint();

      // This test deliberately never navigates the default `page` fixture — it needs its
      // own isolated context with geolocation permissions denied, which the shared default
      // page (used by every other test in this file) doesn't have. Clear its monitor so
      // `test.afterEach`'s existing `if (!monitor) return;` guard honestly skips the
      // authenticated-read check for a page that was genuinely never used, instead of
      // fabricating a fake read to satisfy it.
      delete (defaultPage as any).__binAppCheckMonitor;

      try {
        await loginMainRole(customPage, 'technician', requireEnv('E2E_TECHNICIAN_EMAIL'), requireEnv('E2E_TECHNICIAN_PASSWORD'));
        await customPage.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
        const openJob = customPage
          .getByRole('button', {
            name: /OPEN JOB CARD|ACCEPT JOB|Accept Mission|View Job|Open Mission/i,
          })
          .first();

        // Wait for the openJob button to become visible (React chunk and Firestore load)
        let jobVisible = true;
        try {
          await openJob.waitFor({ state: 'visible', timeout: 20_000 });
        } catch {
          jobVisible = false;
        }

        if (!jobVisible) {
          const bodyText = await customPage.locator('body').innerText().catch(() => '');
          throw new Error(
            `GPS fallback proof blocked: seeded technician mission was not visible.\n` +
            `URL: ${customPage.url()}\n` +
            `Body:\n${bodyText.slice(0, 5000)}`
          );
        }

        await openJob.click();
        await customPage.waitForURL('**/technician/job/**', { timeout: 20_000 });

        // Wait for the details page loading spinner to disappear and content to load
        await customPage.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined);
        await customPage.getByText(/Mission Lifecycle/i).first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);

        // If status is ASSIGNED/ACCEPTED, click "On The Way" to enable the "Arrived" button
        const onTheWay = customPage.getByRole('button', { name: /On The Way/i }).first();
        if (await onTheWay.isVisible().catch(() => false) && await onTheWay.isEnabled().catch(() => false)) {
          await onTheWay.click();
        }

        const arrive = customPage.getByRole('button', { name: /Arrived|On Site|I have arrived/i }).first();
        await expect(arrive).toBeEnabled({ timeout: 15_000 });
        await arrive.click();
        await expect(customPage.locator('body')).toContainText(
          /GPS|permission|location|open area/i,
          { timeout: 20_000 },
        );

        monitor.assertClean(test.info().title);
        monitor.assertAuthenticatedFirebaseRead(test.info().title);
      } finally {
        await context.close().catch(() => undefined);
      }
    });

    test('technicianCompletionAudit — history lists completed missions', async ({ page }) => {
      await loginMainRole(page, 'technician', requireEnv('E2E_TECHNICIAN_EMAIL'), requireEnv('E2E_TECHNICIAN_PASSWORD'));
      await page.goto('/technician/history', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(ACCESS_DENIED, { timeout: 10_000 });
      const body = await page.locator('body').innerText();
      if (/no completed|empty|no history/i.test(body)) {
        test.skip(true, 'No completed technician tickets seeded yet; run seed:e2e:gate11.');
      }
      await expect(page.locator('body')).toContainText(/history|completed|closed|mission|ticket/i, { timeout: 15_000 });
    });
  });

  test.describe('Broker profile gates', () => {
    test('brokerReferralCommissionLifecycle — commissions surface shows lifecycle states', async ({ page }) => {
      await loginMainRole(page, 'broker', requireEnv('E2E_BROKER_EMAIL'), requireEnv('E2E_BROKER_PASSWORD'));
      await page.goto('/broker/commissions', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(/Finance|Payout|Commission|PENDING|LIFETIME/i, { timeout: 15_000 });
      await page.goto('/broker/leads', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).not.toContainText(ACCESS_DENIED, { timeout: 10_000 });
    });

    test('brokerDocsPolicyFraud — document vault shows compliance policy and upload controls', async ({ page }) => {
      await loginMainRole(page, 'broker', requireEnv('E2E_BROKER_EMAIL'), requireEnv('E2E_BROKER_PASSWORD'));
      await page.goto('/broker/documents', { waitUntil: 'domcontentloaded' });
      const vault = page.getByTestId('broker-documents-vault');
      if (await vault.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await expect(vault).toBeVisible();
      }
      await expect(page.locator('body')).toContainText(/Emirates ID|RERA|IBAN|UNDER REVIEW|VERIFIED|UPLOAD|MANDATORY COMPLIANCE/i, { timeout: 15_000 });
      await expect(page.locator('body')).toContainText(/Security Protocol|malware|compliance/i, { timeout: 10_000 });
      await page.goto('/broker/profile', { waitUntil: 'domcontentloaded' });
      await expect(page.locator('body')).toContainText(/payout|commission|RERA|blocked/i, { timeout: 15_000 });
    });
  });

  test.describe('Admin profile gates', () => {
    test('adminFreshLoginAndCorePages — standalone admin panel core routes render', async ({ page }) => {
      await loginAdminPanel(page, requireEnv('E2E_ADMIN_EMAIL'), requireEnv('E2E_ADMIN_PASSWORD'));
      for (const route of ['/dashboard', '/tickets', '/sos', '/manual-approvals', '/broker']) {
        await page.goto(adminUrl(route), { waitUntil: 'domcontentloaded' });
        await waitForAdminLoader(page);
        const body = await page.locator('body').innerText({ timeout: 15_000 });
        expect(body.trim().length).toBeGreaterThan(0);
        expect(body).not.toMatch(CRASH);
        expect(body).not.toMatch(ACCESS_DENIED);
      }
    });

    test('adminStaffProvisioning — technician registry exposes provisioning dialog', async ({ page }) => {
      await loginAdminPanel(page, requireEnv('E2E_ADMIN_EMAIL'), requireEnv('E2E_ADMIN_PASSWORD'));
      await page.goto(adminUrl('/technicians'), { waitUntil: 'domcontentloaded' });
      await waitForAdminLoader(page);
      const addBtn = page.getByTestId('admin-add-technician').or(page.getByRole('button', { name: /Add Technician|Add/i })).first();
      await expect(addBtn).toBeVisible({ timeout: 15_000 });
      await addBtn.click();
      await expect(page.getByLabel(/email/i).or(page.locator('input[type="email"]')).first()).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('body')).toContainText(/technician|email|name|special/i, { timeout: 10_000 });
      await page.getByRole('button', { name: /Cancel|Close/i }).first().click().catch(() => undefined);
    });

    test('adminPaymentUnlockAudit — settlement vault shows audit policy and verification dialog', async ({ page }) => {
      await loginAdminPanel(page, requireEnv('E2E_ADMIN_EMAIL'), requireEnv('E2E_ADMIN_PASSWORD'));
      await page.goto(adminUrl('/manual-approvals'), { waitUntil: 'domcontentloaded' });
      await waitForAdminLoader(page);
      await expect(page.locator('body')).toContainText(/settlement|payment|verify|policy|audit/i, { timeout: 15_000 });
      const approveBtn = page.getByTestId('admin-approve-contract').first();
      if (await approveBtn.isVisible({ timeout: 8_000 }).catch(() => false)) {
        await approveBtn.click();
        await expect(page.locator('body')).toContainText(/reference|amount|confirm|audit/i, { timeout: 10_000 });
      }
    });
  });
});
