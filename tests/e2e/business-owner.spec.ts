/**
 * business-owner.spec.ts
 * Deep E2E business flow for the Owner role.
 * Verifies: Generating a quote, selecting a contract, payment flow, document upload, and signing.
 */
import { test, expect } from '@playwright/test';

test.describe('Owner Business Workflow', () => {
  test('Owner can navigate to onboarding and generate a quote', async ({ page }) => {
    test.setTimeout(120000);

    // Mock Firebase Storage upload/download and override Referer for other Google APIs in one unified handler
    await page.route('**/*.googleapis.com/**', async route => {
      const url = route.request().url();
      if (url.includes('firebasestorage.googleapis.com/v0/b/')) {
        if (route.request().method() === 'POST') {
          const nameParam = new URL(url).searchParams.get('name') || 'dummy.pdf';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              name: nameParam,
              bucket: 'bin-group-57c60.firebasestorage.app',
              downloadTokens: 'e2e-mock-token-12345',
              contentType: 'application/pdf',
              size: '1000',
              updated: new Date().toISOString()
            })
          });
        } else if (route.request().method() === 'GET') {
          const parts = url.split('/o/');
          const encodedPath = parts[1] ? parts[1].split('?')[0] : '';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              name: decodeURIComponent(encodedPath),
              bucket: 'bin-group-57c60.firebasestorage.app',
              downloadTokens: 'e2e-mock-token-12345',
              contentType: 'application/pdf',
              size: '1000',
              updated: new Date().toISOString()
            })
          });
        } else {
          await route.continue();
        }
        return;
      }

      // Override Referer header to bypass Google API key referrer domain restrictions
      const reqHeaders = { ...route.request().headers() };
      delete reqHeaders['referer'];
      delete reqHeaders['Referer'];
      const headers = {
        ...reqHeaders,
        'referer': 'https://bin-group-57c60.web.app/'
      };
      await route.continue({ headers });
    });

    // Collect console logs
    page.on('console', msg => console.log('BROWSER LOG:', msg.type(), msg.text()));

    const email = `e2e-owner-${Date.now()}@bin-groups.com`;
    const password = 'E2e!Test!Pass2026';
    console.log(`Generated E2E owner email: ${email}`);

    // 1. Open Onboarding page
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/.*onboarding.*/);
    await page.waitForTimeout(1000);

    // Step 1: Company Profile Info
    console.log('Step 1: Filling company profile...');
    await page.getByLabel('Company / Owner name', { exact: false }).first().fill('E2E Owner Corp');
    await page.getByLabel('Trade license / Emirates ID reference', { exact: false }).first().fill('TL-E2E-100');
    await page.getByLabel('Contact name', { exact: false }).first().fill('E2E Contact');
    await page.getByLabel('Contact phone', { exact: false }).first().fill('+971501112224');
    await page.getByLabel('Contact email', { exact: false }).first().fill(email);

    // Click Continue
    await page.locator('button:has-text("Continue to Asset Profile")').first().click();
    await page.waitForTimeout(1500);

    // Step 2: Asset Profile Selection
    console.log('Step 2: Selecting property type and filling details...');
    const villaCard = page.locator('text=Villa').first();
    await expect(villaCard).toBeVisible({ timeout: 15000 });
    await villaCard.click();
    await page.waitForTimeout(1000);

    // Fill details
    await page.getByLabel('Units', { exact: false }).first().fill('1');
    await page.getByLabel('Floors', { exact: false }).first().fill('2');
    await page.getByLabel('Sq Ft', { exact: false }).first().fill('3500');
    await page.getByLabel('Age', { exact: false }).first().fill('2');

    // Click Continue
    await page.locator('button:has-text("Continue")').first().click();
    await page.waitForTimeout(1500);

    // Step 3: Property Location
    console.log('Step 3: Filling location...');
    await page.locator('input[name="address"]').first().fill('E2E Villa 45, Marina, Dubai');
    // Ensure coordinates are filled
    await page.locator('input[name="latitude"]').first().fill('25.2048');
    await page.locator('input[name="longitude"]').first().fill('55.2708');

    // Click Continue
    await page.locator('button:has-text("Continue")').first().click();
    await page.waitForTimeout(1500);

    // Step 4: Systems & Add-ons
    console.log('Step 4: Checking systems and add-ons...');
    await page.locator('button:has-text("Initialize Analysis")').first().click();
    await page.waitForTimeout(1500);

    // Step 5: Commercial Terms / Service Plan Selection
    console.log('Step 5: Selecting plan...');
    // Choose "BOTH" or keep default (both is AMC + PM)
    const hybridCard = page.locator('text=Maintenance + Property Management').first();
    if (await hybridCard.isVisible()) {
      await hybridCard.click();
      await page.waitForTimeout(500);
    }
    await page.locator('button:has-text("Confirm Plan")').first().click();
    await page.waitForTimeout(1500);

    // Step 6: Documents Upload
    console.log('Step 6: Uploading proof documents...');
    const dummyFile = {
      name: 'test_document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 dummy document'),
    };
    // Select hidden file inputs and upload dummy PDF to satisfy validation
    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.nth(0).setInputFiles(dummyFile);
    await page.waitForTimeout(500);
    await fileInputs.nth(1).setInputFiles(dummyFile);
    await page.waitForTimeout(500);
    await fileInputs.nth(2).setInputFiles(dummyFile);
    await page.waitForTimeout(500);
    await page.waitForTimeout(1000);

    // Click Continue
    await page.locator('button:has-text("Continue to Account")').first().click();
    await page.waitForTimeout(1500);

    // Step 7: Account Creation (Sign Up)
    console.log('Step 7: Creating account...');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.locator('button:has-text("Create Account")').first().click();
    // Allow Cloud Function runtime registration to execute
    await page.waitForTimeout(5000);

    // Step 8: Review & Submit Onboarding Package
    console.log('Step 8: Reviewing and finalizing...');
    await page.locator('button:has-text("Finalize Payment")').first().click();
    await page.waitForTimeout(1500);

    // Step 9: Contract Signature
    console.log('Step 9: Signing contract...');
    await page.locator('label:has-text("Type your full legal name to sign") + div input, input[aria-label*="sign" i]').first().fill('E2E Owner');
    await page.locator('input[type="checkbox"]').first().check({ force: true });
    await page.locator('button:has-text("Sign Full Agreement & Proceed to Payment")').first().click();
    await page.waitForTimeout(2000);

    // Step 10: Payment Options
    console.log('Step 10: Selecting Cheque payment manifest...');
    await page.locator('button:has-text("Cheque")').first().click();
    await page.locator('button:has-text("Continue to Submission")').first().click();
    await page.waitForTimeout(1500);

    // Step 11: Submit Payment Package
    console.log('Step 11: Submitting onboarding package...');
    await page.locator('button:has-text("Submit Payment & Documents")').first().click();
    await page.locator('button:has-text("Confirm & Submit")').first().click();

    // Wait for submission completion and redirect to success state page
    await expect(page.locator('body')).toContainText('Payment Submitted Successfully', { timeout: 35000 });
    console.log('Onboarding package submitted successfully!');
  });
});
