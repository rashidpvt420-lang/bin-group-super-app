/**
 * audit-all-buttons.spec.ts
 * Deep E2E button & page verification for all 30 menu items.
 */
import { test, expect, Page } from '@playwright/test';

const EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_ADMIN_EMAIL/PASSWORD. Admin launch validation cannot be skipped for public release.');
  }
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForLoadState('domcontentloaded');
  await waitForLoader(page);
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|application error|minified react error|system interruption/i, { timeout: 10000 });
}

async function waitForLoader(page: Page) {
  await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);
}

test.describe('Admin Button & Menu Verification Audit', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const buttonsToAudit = [
    { label: 'Dashboard', path: '/dashboard' },
    { label: 'Payroll Hub', path: '/financials/payroll' },
    { label: 'Document Vault', path: '/document-vault' },
    { label: 'Institutional Audit', path: '/vault' },
    { label: 'Design Studio Manager', path: '/design-studio' },
    { label: 'Orphan War Room', path: '/orphans' },
    { label: 'Verify Payment', path: '/manual-approvals' },
    { label: 'Sovereign Control', path: '/control-center' },
    { label: 'Pricing Matrix 2026', path: '/admin/pricing-matrix' },
    { label: 'BIN-GPT Engineer', path: '/admin/bin-gpt-engineer' },
    { label: 'ACTIVE TENANTS', path: '/owners' },
    { label: 'Brokers', path: '/broker' },
    { label: 'Tenants', path: '/tenants' },
    { label: 'Property Passports', path: '/properties/passport' },
    { label: 'Unit Status Control', path: '/admin/units' },
    { label: 'Technicians', path: '/technicians' },
    { label: 'Duty Command Center', path: '/ops/technicians' },
    { label: 'Mission Logs', path: '/tickets' },
    { label: 'WhatsApp Triage', path: '/ops/whatsapp-triage' },
    { label: 'BIN Connect Inbox', path: '/ops/bin-connect' },
    { label: 'Pilot Completion', path: '/ops/pilot-completion' },
    { label: 'Public Launch Command', path: '/ops/public-launch-command' },
    { label: 'RFQ Trust Workflow', path: '/ops/rfq' },
    { label: 'Vendor Command', path: '/ops/vendors' },
    { label: 'PDPL Governance', path: '/ops/data-governance' },
    { label: 'SOS Feed', path: '/sos' },
    { label: 'Systemic Audit Log', path: '/audit' },
    { label: 'HR Command', path: '/hr' },
    { label: 'Support', path: '/settings' }
  ];

  for (const button of buttonsToAudit) {
    test(`Clicking "${button.label}" navigates to ${button.path} and loads cleanly`, async ({ page }) => {
      console.log(`Auditing button: ${button.label} -> ${button.path}`);
      
      const link = page.locator('.MuiDrawer-paper a, .MuiDrawer-paper li, .MuiDrawer-paper div[role="button"]')
        .filter({ hasText: new RegExp(`^${button.label}$`, 'i') })
        .first();

      await expect(link, `Sidebar must contain a button for "${button.label}"`).toBeVisible({ timeout: 5000 });
      await link.click();
      
      await page.waitForURL(`**${button.path}`, { timeout: 10000 });
      await waitForLoader(page);
      
      // Verify no crashes or errors
      const bodyText = await page.locator('body').innerText();
      expect(bodyText, `${button.label} page should load visible content`).toBeTruthy();
      expect(bodyText, `${button.label} page should not render crash text`).not.toMatch(/application error|unhandled runtime error|chunkloaderror|minified react error|cannot read properties of undefined|null is not an object/i);
      expect(bodyText, `${button.label} page should not render permission errors`).not.toMatch(/permission-denied|unauthenticated|access denied|not authorized/i);
      
      console.log(`Successfully verified page: ${button.label}`);
    });
  }

  test('Clicking "Owner Portal ↗" targets external domain', async ({ page }) => {
    const link = page.locator('.MuiDrawer-paper a').filter({ hasText: /owner portal/i }).first();
    await expect(link, 'Sidebar must contain Owner Portal external link').toBeVisible({ timeout: 5000 });
    const href = await link.getAttribute('href');
    expect(href, 'Owner Portal link must point to bin-groups.com').toContain('bin-groups.com');
    console.log(`Owner Portal link verified pointing to: ${href}`);
  });
});
