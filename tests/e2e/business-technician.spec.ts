/**
 * business-technician.spec.ts
 * Deep E2E business flow for the Technician role.
 * Verifies: assigned job visibility, acceptance, GPS/arrival actions, proof photos, and ticket resolution.
 */
import { test, expect, Page, Locator } from '@playwright/test';

const EMAIL    = process.env.E2E_TECHNICIAN_EMAIL    ?? '';
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
    bodyPreview: document.body?.innerText?.slice(0, 1200),
    buttons: Array.from(document.querySelectorAll('button, a')).map((el: any) => ({
      text: el.innerText,
      ariaLabel: el.getAttribute('aria-label'),
      testId: el.getAttribute('data-testid'),
      disabled: el.disabled === true,
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    })).slice(0, 80),
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
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error/i, { timeout: 10_000 });
}

test.describe('Technician Business Workflow', () => {
  test.use({ geolocation: { longitude: 55.2708, latitude: 25.2048 }, permissions: ['geolocation'] });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Technician can accept a job, upload proofs, and resolve ticket', async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto('/technician/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error/i, { timeout: 10_000 });

    await expect(
      page.locator('[data-testid*="job" i], [data-testid*="ticket" i], text=/assigned|dispatch|job|ticket/i').first(),
      'Technician dashboard must expose at least one assigned/dispatch job for launch validation.'
    ).toBeVisible({ timeout: 30_000 });

    await clickRequired(page, [
      '[data-testid="technician-accept-job"]',
      '[data-testid*="accept" i]',
      'button:has-text("Accept Job")',
      'button:has-text("Acknowledge")',
      'button:has-text("Accept")',
    ], 'Accept job action');

    await expect(page.locator('body')).toContainText(/accepted|acknowledged|on the way|start trip|arrived/i, { timeout: 15_000 });

    await clickRequired(page, [
      '[data-testid="technician-start-trip"]',
      '[data-testid*="start-trip" i]',
      'button:has-text("Start Trip")',
      'button:has-text("On the way")',
      'button:has-text("En Route")',
    ], 'Start trip action');

    await expect(page.locator('body')).toContainText(/on the way|en route|arrived|gps|location/i, { timeout: 15_000 });

    await clickRequired(page, [
      '[data-testid="technician-arrived"]',
      '[data-testid*="arrived" i]',
      'button:has-text("Arrived")',
      'button:has-text("I have arrived")',
      'button:has-text("On Site")',
    ], 'Arrival action');

    await expect(page.locator('body')).toContainText(/arrived|on site|start work|upload/i, { timeout: 15_000 });

    const startWork = page.locator('[data-testid="technician-start-work"], [data-testid*="start-work" i], button:has-text("Start Work")').first();
    if (await startWork.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(startWork).toBeEnabled({ timeout: 10_000 });
      await startWork.click();
    }

    await attachRequiredImage(page, [
      '[data-testid="technician-before-photo"] input[type="file"]',
      'input[type="file"][name*="before" i]',
      'input[type="file"][data-testid*="before" i]',
      'input[type="file"][accept*="image"] >> nth=0',
      'input[type="file"] >> nth=0',
    ], 'Before Photo');

    await attachRequiredImage(page, [
      '[data-testid="technician-after-photo"] input[type="file"]',
      'input[type="file"][name*="after" i]',
      'input[type="file"][data-testid*="after" i]',
      'input[type="file"][accept*="image"] >> nth=1',
      'input[type="file"] >> nth=1',
    ], 'After Photo');

    const notes = page.locator('[data-testid="technician-completion-notes"] textarea, textarea[name*="notes" i], textarea[placeholder*="notes" i]').first();
    if (await notes.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await notes.fill('E2E completion proof: before and after evidence uploaded, issue resolved.');
    }

    await clickRequired(page, [
      '[data-testid="technician-resolve-ticket"]',
      '[data-testid*="resolve" i]',
      'button:has-text("Resolve Ticket")',
      'button:has-text("Mark Completed")',
      'button:has-text("Complete Job")',
    ], 'Resolve ticket action');

    const confirm = page.locator('button:has-text("Confirm"), button:has-text("Close Job"), button:has-text("Yes")').first();
    if (await confirm.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await expect(confirm).toBeEnabled({ timeout: 10_000 });
      await confirm.click();
    }

    await expect(page.locator('body')).toContainText(/resolved|completed|complete|success/i, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(/failed|permission-denied|missing or insufficient permissions/i, { timeout: 5_000 });
  });
});
