/**
 * business-technician.spec.ts
 * Deep E2E business flow for the Technician role.
 * Verifies: job acceptance, GPS/arrival actions, proof upload, and ticket resolution.
 */
import { test, expect, Page, Locator } from '@playwright/test';
import { installAppCheckDebugToken, assertAppCheckDebugTokenInPage, collectAppCheckFailures } from './helpers/appCheckDebug';

const EMAIL = process.env.E2E_TECHNICIAN_EMAIL ?? '';
const PASSWORD = process.env.E2E_TECHNICIAN_PASSWORD ?? '';

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_TECHNICIAN_EMAIL/PASSWORD. Technician launch validation cannot be skipped for public release.');
  }
}

async function firstVisible(page: Page, selectors: string[], timeout = 15_000): Promise<Locator> {
  const deadline = Date.now() + timeout;
  let lastError = '';

  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 500 }).catch((error) => {
        lastError = String(error);
        return false;
      })) {
        return locator;
      }
    }
    await page.waitForTimeout(300);
  }

  const diagnostics = await page.evaluate(() => ({
    href: window.location.href,
    bodyPreview: document.body?.innerText?.slice(0, 1400),
    buttons: Array.from(document.querySelectorAll('button, a')).map((el: any) => ({
      text: el.innerText,
      ariaLabel: el.getAttribute('aria-label'),
      testId: el.getAttribute('data-testid'),
      disabled: el.disabled === true,
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    })).slice(0, 100),
  }));

  throw new Error(`No visible target found for selectors: ${selectors.join(' | ')}. Last error: ${lastError}. Diagnostics: ${JSON.stringify(diagnostics)}`);
}

async function clickRequired(page: Page, selectors: string[], label: string) {
  const target = await firstVisible(page, selectors);
  await expect(target, `${label} must be enabled`).toBeEnabled({ timeout: 10_000 });
  await target.click();
}

async function attachRequiredImage(page: Page, selectors: string[], label: string) {
  const input = await firstVisible(page, selectors, 20_000);
  await input.setInputFiles({
    name: `${label.toLowerCase().replace(/\s+/g, '-')}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(
      '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea73581e20000000049454e44ae426082',
      'hex'
    ),
  });
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/technician/dashboard', { timeout: 20_000 });
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error|identity fault/i, { timeout: 10_000 });
}

test.describe('Technician Business Workflow', () => {
  test.use({ geolocation: { longitude: 55.2708, latitude: 25.2048 }, permissions: ['geolocation'] });

  test.beforeEach(async ({ page }) => {
    await installAppCheckDebugToken(page);
    await login(page);
  });

  test('Technician can accept a job, upload proof, and resolve ticket', async ({ page }) => {
    test.setTimeout(150_000);

    await page.goto('/technician/jobs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error/i, { timeout: 10_000 });
    await expect(page.locator('body')).toContainText(/ACTIVE ASSIGNMENTS|OPEN JOB POOL|My Jobs/i, { timeout: 20_000 });

    const acceptFromPool = page.getByRole('button', { name: /ACCEPT JOB|ACCEPT MISSION|CLAIM MISSION/i }).first();
    const openAssignedJob = page.getByRole('button', { name: /OPEN JOB CARD/i }).first();

    if (await acceptFromPool.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await expect(acceptFromPool).toBeEnabled({ timeout: 10_000 });
      await acceptFromPool.click();
    } else {
      await expect(
        openAssignedJob,
        'Technician launch fixture must expose either an open pool job or an assigned active job.'
      ).toBeVisible({ timeout: 20_000 });
      await openAssignedJob.click();
    }

    await page.waitForURL('**/technician/job/**', { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/MISSION REF|Mission Lifecycle/i, { timeout: 20_000 });

    const acceptMission = page.getByRole('button', { name: /Accept Mission/i }).first();
    if (await acceptMission.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(acceptMission).toBeEnabled({ timeout: 10_000 });
      await acceptMission.click();
      await expect(page.locator('body')).toContainText(/Mission accepted|ACCEPTED|ASSIGNED/i, { timeout: 15_000 });
    }

    await clickRequired(page, [
      'button:has-text("On The Way")',
      'button:has-text("Start Trip")',
      'button:has-text("En Route")',
    ], 'Start trip action');
    await expect(page.locator('body')).toContainText(/EN ROUTE|On The Way|Status updated/i, { timeout: 20_000 });

    await clickRequired(page, [
      'button:has-text("Arrived")',
      'button:has-text("I have arrived")',
      'button:has-text("On Site")',
    ], 'Arrival action');
    await expect(page.locator('body')).toContainText(/ARRIVED|PRE-WORK SAFETY PROTOCOL|Status updated/i, { timeout: 20_000 });

    const ppe = page.locator('#ppe');
    const safety = page.locator('#safety');
    await expect(ppe).toBeVisible({ timeout: 10_000 });
    await expect(safety).toBeVisible({ timeout: 10_000 });
    await ppe.check();
    await safety.check();

    await clickRequired(page, ['button:has-text("Start Work")'], 'Start work action');
    await expect(page.locator('body')).toContainText(/IN PROGRESS|Proof readiness|Status updated/i, { timeout: 20_000 });

    const notes = page.getByLabel(/Resolution notes/i).first();
    await expect(notes).toBeVisible({ timeout: 10_000 });
    await notes.fill('E2E completion proof: issue inspected, repaired, and verified operational.');

    const materials = page.getByLabel(/Materials used|No parts required/i).first();
    await expect(materials).toBeVisible({ timeout: 10_000 });
    await materials.fill('No parts required');

    await attachRequiredImage(page, [
      'input[type="file"][accept*="image"]',
      'input[type="file"]',
    ], 'After Work Proof');

    const complete = page.getByRole('button', { name: /Complete Mission & Request Tenant Feedback/i }).first();
    await expect(
      complete,
      'Completion must unlock after seeded tenant before-proof, resolution notes, materials disposition, and after-work proof.'
    ).toBeEnabled({ timeout: 20_000 });
    await complete.click();

    await page.waitForURL('**/technician/jobs', { timeout: 30_000 });
    await expect(page.locator('body')).not.toContainText(/failed|permission-denied|missing or insufficient permissions/i, { timeout: 5_000 });
  });
});