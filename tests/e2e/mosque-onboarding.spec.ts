import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

test.describe('Mosque / Masjid Onboarding and Dashboard E2E', () => {
  test('Should complete Mosque onboarding, verify approval, and check Mosque Intelligence dashboard', async ({ page }) => {
    // Collect console logs for checking errors/warnings
    const consoleErrors: string[] = [];
    
    page.on('console', msg => {
      const text = msg.text();
      console.log(`[BROWSER CONSOLE] [${msg.type()}] ${text}`);
      const textLower = text.toLowerCase();
      if (
        textLower.includes('permission-denied') ||
        textLower.includes('undefined mosqueprofile') ||
        textLower.includes('no property found in owner submission') ||
        textLower.includes('callable function failed') ||
        (textLower.includes('failed') && textLower.includes('callable'))
      ) {
        consoleErrors.push(text);
      }
    });

    page.on('pageerror', error => {
      console.log(`[BROWSER UNCAUGHT EXCEPTION] ${error.message}`);
      const textLower = error.message.toLowerCase();
      if (
        textLower.includes('permission-denied') ||
        textLower.includes('mosqueprofile') ||
        textLower.includes('no property found')
      ) {
        consoleErrors.push(error.message);
      }
    });

    // Unique email for E2E onboarding registration
    const email = `e2e-mosque-${Date.now()}@bin-groups.com`;
    const password = 'MasjidPass123!';
    console.log(`Generated test email: ${email}`);

    // 1. Open Onboarding page
    await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/.*onboarding.*/);
    await page.waitForTimeout(1000);

    // Step 1: Company Profile Info
    console.log('Step 1: Filling company profile...');
    await page.getByLabel('Company / Owner name').fill('Sovereign Mosque Council');
    await page.getByLabel('Trade license / Emirates ID reference').fill('AWQAF-MASJID-992');
    await page.getByLabel('Contact name').fill('Director of Operations');
    await page.getByLabel('Contact phone').fill('+971501112223');
    await page.getByLabel('Contact email').fill(email);

    // Click Continue
    await page.click('button:has-text("Continue to Asset Profile")');
    await page.waitForTimeout(1500);

    // Step 2: Asset Profile Selection
    console.log('Step 2: Selecting property type and filling mosque details...');
    const mosqueCard = page.locator('text=Mosque / Masjid').first();
    await expect(mosqueCard).toBeVisible({ timeout: 15000 });
    await mosqueCard.click();
    await page.waitForTimeout(1000);

    // Fill Mosque specific details using target inputs
    await page.locator('label:has-text("Mosque name") + div input').fill('Sheikh Zayed St Masjid');
    await page.locator('label:has-text("GFA sq.ft") + div input').fill('15000');
    await page.locator('label:has-text("Age years") + div input').fill('12');
    await page.locator('label:has-text("Capacity") + div input').first().fill('1200');
    await page.locator('label:has-text("Ramadan peak") + div input').fill('3000');
    await page.locator('label:has-text("Wudu areas") + div input').first().fill('4');
    await page.locator('label:has-text("HVAC units") + div input').fill('15');
    await page.locator('label:has-text("CCTV cameras") + div input').fill('36');

    // Click Continue on Step 2
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(1500);

    // Step 3: Property Location
    console.log('Step 3: Filling property location...');
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: /abu/i }).first().click();
    await page.getByLabel('Address').fill('Sheikh Zayed St, Abu Dhabi');
    // Ensure coordinates are pre-filled or fill manually
    await page.locator('label:has-text("Latitude") + div input').fill('24.4539');
    await page.locator('label:has-text("Longitude") + div input').fill('54.3773');
    await page.click('button:has-text("Save Coordinates")');
    await page.waitForTimeout(500);

    // Click Continue on Step 3
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(1500);

    // Step 4: Systems & Add-ons
    console.log('Step 4: Saving systems & add-ons...');
    await page.click('button:has-text("Save Systems & Add-ons")');
    await page.waitForTimeout(1500);

    // Step 5: Commercial Terms / Service Plan Selection
    console.log('Step 5: Selecting plan...');
    await expect(page.locator('body')).not.toContainText('NaN');
    await page.click('button:has-text("Confirm Plan")');
    await page.waitForTimeout(1500);

    // Step 6: Documents Upload
    console.log('Step 6: Uploading proof documents...');
    const dummyFile = {
      name: 'test_document.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 dummy document'),
    };
    // Select hidden file inputs and upload dummy PDF to satisfy validation
    await page.setInputFiles('input[type="file"] >> nth=0', dummyFile);
    await page.waitForTimeout(500);
    await page.setInputFiles('input[type="file"] >> nth=0', dummyFile);
    await page.waitForTimeout(500);
    await page.setInputFiles('input[type="file"] >> nth=0', dummyFile);
    await page.waitForTimeout(500);
    await page.waitForTimeout(1000);

    // Click Continue
    await page.click('button:has-text("Continue")');
    await page.waitForTimeout(1500);

    // Step 7: Account Creation (Sign Up)
    console.log('Step 7: Creating account...');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    await page.click('button:has-text("Create Account")');
    // Allow Cloud Function runtime registration to execute
    await page.waitForTimeout(5000);

    // Dismiss LegalModal if it pops up
    console.log('Checking for Legal Consent Modal...');
    const legalTitle = page.locator('text=SOVEREIGN INSTITUTIONAL AGREEMENT');
    try {
      if (await legalTitle.isVisible({ timeout: 10000 })) {
          console.log('Legal Consent Modal detected. Scrolling and accepting...');
          const dialogContent = page.locator('.MuiDialogContent-root');
          await dialogContent.evaluate(el => {
              el.scrollTop = el.scrollHeight;
              el.dispatchEvent(new Event('scroll'));
          });
          await page.waitForTimeout(1000);
          await page.click('button:has-text("I AGREE & ENTER")');
          console.log('Legal Consent Modal accepted.');
          await page.waitForTimeout(2000);
      } else {
          console.log('Legal Consent Modal not visible.');
      }
    } catch (e) {
      console.log('Error/Timeout during Legal Consent Modal check:', e);
    }

    // Step 8: Review & Submit Onboarding Package
    console.log('Step 8: Reviewing and finalizing...');
    await page.click('button:has-text("Finalize Payment")');
    await page.waitForTimeout(1500);

    // Step 9: Contract Signature
    console.log('Step 9: Signing contract...');
    await page.locator('label:has-text("Type your full legal name to sign") + div input').fill('Director of Operations');
    await page.locator('input[type="checkbox"]').click();
    await page.click('button:has-text("Sign Full Agreement & Proceed to Payment")');
    await page.waitForTimeout(2000);

    // Step 10: Payment Options
    console.log('Step 10: Selecting Cheque payment manifest...');
    await page.click('button:has-text("Cheque")');
    await page.click('button:has-text("Continue to Submission")');
    await page.waitForTimeout(1500);

    // Step 11: Submit Payment Package
    console.log('Step 11: Submitting onboarding package...');
    await page.click('button:has-text("Submit Payment & Documents")');
    await page.click('button:has-text("Confirm & Submit")');
    // Wait for submission completion and redirect to success state page
    await expect(page.locator('body')).toContainText('Payment Submitted', { timeout: 35000 });
    console.log('Onboarding package submitted successfully!');

    // 2. Programmatic Admin Review / Approval
    console.log('Admin reviewing & approving onboarding package programmatically...');
    execSync(`node approve_onboarding.cjs ${email}`, { stdio: 'inherit' });
    await page.waitForTimeout(2000);

    // 3. Login to Owner Portal
    console.log('Logging into the Owner Portal...');
    await page.goto('/login');
    await page.waitForTimeout(1000);
    await page.locator('label:has-text("Email") + div input').fill(email);
    await page.locator('label:has-text("Password") + div input').fill(password);
    await page.click('button:has-text("Sign in")');
    
    // Wait for redirect to Dashboard
    await page.waitForURL(/.*owner\/dashboard.*/, { timeout: 25000 });
    await page.waitForTimeout(5000);

    // 4. Verify Mosque / Masjid Intelligence dashboard loads successfully
    console.log('Verifying Mosque / Masjid Intelligence is present...');
    
    // Look for Mosque specialized UI components or headers
    const mosqueIntelligence = page.locator('text=Mosque Facility Profile, text=Mosque / Masjid Intelligence, text=Worshipper Capacity, text=Ramadan Peak').first();
    await expect(mosqueIntelligence).toBeVisible({ timeout: 15000 });
    
    // Verify dashboard does not appear blank
    await expect(page.locator('body')).not.toContainText('dashboard locked', { timeout: 5000 });
    await expect(page.locator('body')).not.toContainText('no active property', { timeout: 5000 });

    // Assert there were no fatal/critical browser errors
    console.log('Checking for collected browser console errors...');
    expect(consoleErrors).toEqual([]);
    console.log('PASSED: Mosque Onboarding and Dashboard verification completed successfully!');
  });
});
