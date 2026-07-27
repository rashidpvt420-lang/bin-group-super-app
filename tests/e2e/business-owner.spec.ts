/**
 * Authenticated production business proof for the Owner role.
 * No Firebase network mocking is allowed in this launch-critical suite.
 */
import { config as loadDotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, Page } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';
import { getLatestOtp } from './helpers/gmail-otp-reader';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

    const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const envPath = path.resolve(repositoryRoot, '.env.e2e');
const evidencePath = path.resolve(repositoryRoot, 'launch_package/artifacts/owner-onboarding-production-evidence.json');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const EMAIL = process.env.E2E_OWNER_EMAIL ?? '';
const MAILBOX_EMAIL = process.env.E2E_OWNER_MAILBOX_EMAIL ?? '';
const PASSWORD = process.env.E2E_OWNER_PASSWORD ?? '';
const ACQUIRED_PROPERTY = 'E2E Owner Acquisition Tower';

type OwnerLifecycleEvidence = {
  status?: string;
  projectId?: string;
  owner?: {
    acquiredThroughCallable?: boolean;
    authenticated?: boolean;
    dashboardStartedLocked?: boolean;
    dashboardUnlockedAfterApproval?: boolean;
  };
  onboarding?: {
    intakeId?: string;
    propertyCount?: number;
    mobilizationPercent?: number;
    contractUrlPresent?: boolean;
    initialSubmissionIdempotentReplay?: boolean;
    adminRejectionProven?: boolean;
    resubmissionProven?: boolean;
    approvalIdempotentReplay?: boolean;
    invoiceId?: string;
    invoiceProofHash?: string;
  };
  receiptEvidence?: {
    initialHash?: string;
    initialGeneration?: string;
    resubmissionHash?: string;
    resubmissionGeneration?: string;
    rotated?: boolean;
  };
  emailDelivery?: Record<string, unknown>;
};

let lifecycleEvidence: OwnerLifecycleEvidence;

function requireLaunchCredentials() {
  const required = [
    ['E2E_OWNER_EMAIL', EMAIL],
    ['E2E_OWNER_PASSWORD', PASSWORD],
    ['E2E_ADMIN_EMAIL', process.env.E2E_ADMIN_EMAIL ?? ''],
    ['E2E_ADMIN_PASSWORD', process.env.E2E_ADMIN_PASSWORD ?? ''],
    ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN', process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? ''],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')}. Owner acquisition and activation proof cannot be skipped for public release.`);
  }
}

function runOwnerSuiteCommand(mode: 'lifecycle' | 'restore-shared-fixtures') {
  execFileSync(process.execPath, ['scripts/run-owner-business-suite-evidence.mjs', mode], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    timeout: 12 * 60 * 1000,
  });
}

function runOwnerLifecycleProof() {
  requireLaunchCredentials();
  runOwnerSuiteCommand('lifecycle');
  if (!existsSync(evidencePath)) {
    throw new Error('Owner production lifecycle runner did not create its evidence artifact.');
  }
  lifecycleEvidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as OwnerLifecycleEvidence;
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.context().clearCookies();
  await page.goto(`/login?intendedRole=owner&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`/login?intendedRole=owner&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/owner/**', { timeout: 30_000 });
  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|identity fault|access denied/i,
    { timeout: 15_000 },
  );
}

async function expectAcquiredOwnerDashboard(page: Page) {
  await expect(page.locator('body'), 'owner dashboard must render the property created by the production acquisition workflow').toContainText(
    new RegExp(ACQUIRED_PROPERTY, 'i'),
    { timeout: 30_000 },
  );
  await expect(page.locator('body')).not.toContainText(
    /no properties found|dashboard locked|payment verification required|permission-denied/i,
    { timeout: 10_000 },
  );
}

test.describe('Owner Business Workflow', () => {
  test.use({ trace: 'off', video: 'off', screenshot: 'off' });

  test.beforeEach(async ({ page }) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = monitor;
    await monitor.assertTokenFingerprint();
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('New Owner acquisition, rejection, resubmission and one-time activation are production-proven', async ({ page }, testInfo) => {
    expect(lifecycleEvidence.status).toBe('passed');
    expect(lifecycleEvidence.projectId).toBe('bin-group-57c60');
    expect(lifecycleEvidence.owner).toMatchObject({
      acquiredThroughCallable: true,
      authenticated: true,
      dashboardStartedLocked: true,
      dashboardUnlockedAfterApproval: true,
    });
    expect(lifecycleEvidence.onboarding).toMatchObject({
      propertyCount: 1,
      mobilizationPercent: 15,
      contractUrlPresent: true,
      initialSubmissionIdempotentReplay: true,
      adminRejectionProven: true,
      resubmissionProven: true,
      approvalIdempotentReplay: true,
    });
    expect(lifecycleEvidence.onboarding?.intakeId).toMatch(/^e2e_owner_onboarding_/);
    expect(lifecycleEvidence.onboarding?.invoiceId).toMatch(/^MOB-/);
    expect(lifecycleEvidence.onboarding?.invoiceProofHash).toMatch(/^[a-f0-9]{64}$/);
    expect(lifecycleEvidence.receiptEvidence).toMatchObject({ rotated: true });
    expect(lifecycleEvidence.receiptEvidence?.initialHash).toMatch(/^[a-f0-9]{64}$/);
    expect(lifecycleEvidence.receiptEvidence?.resubmissionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(lifecycleEvidence.receiptEvidence?.initialGeneration).toBeTruthy();
    expect(lifecycleEvidence.receiptEvidence?.resubmissionGeneration).toBeTruthy();
    expect(Object.keys(lifecycleEvidence.emailDelivery ?? {})).toEqual(expect.arrayContaining([
      'contractOtpInitialProviderMessageId',
      'contractOtpResubmissionProviderMessageId',
      'initialOnboardingMail',
      'initialContractMail',
      'rejectionMail',
      'resubmissionOnboardingMail',
      'resubmissionContractMail',
      'invoiceMail',
    ]));

    await testInfo.attach('owner-onboarding-production-evidence', {
      path: evidencePath,
      contentType: 'application/json',
    });

    await page.goto('/owner/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/dashboard/, { timeout: 20_000 });
    await expectAcquiredOwnerDashboard(page);
    await expect(page.locator('body')).toContainText(/property|portfolio|asset|unit/i, { timeout: 20_000 });
  });

  test('Owner sees the activated contract generated by the acquisition workflow', async ({ page }) => {
    const intakeId = lifecycleEvidence.onboarding?.intakeId;
    expect(intakeId).toBeTruthy();
    await page.goto(`/owner/contracts?contractId=${encodeURIComponent(String(intakeId))}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/contracts/, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(/no contracts on record|contract link was not found|permission-denied/i, { timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/Portfolio Contract|Maintenance Contract Only/i, { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/LOCKED CONTRACT SCOPE|ACTIVE AGREEMENTS|admin approved/i, { timeout: 20_000 });
  });

  test('Owner sees the generated mobilization invoice and financial controls', async ({ page }) => {
    const invoiceId = lifecycleEvidence.onboarding?.invoiceId;
    expect(invoiceId).toBeTruthy();
    await page.goto('/owner/financials', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/financials/, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(
      /permission-denied|missing or insufficient permissions|application error|minified react error/i,
      { timeout: 10_000 },
    );
    await expect(page.locator('body')).toContainText(/AED|payment|financial|invoice|billing/i, { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(new RegExp(String(invoiceId), 'i'), { timeout: 20_000 });
  });

  test('Owner can request and submit the contract signature OTP from the Gmail mailbox', async ({ page }) => {
    test.setTimeout(130_000);
    if (!MAILBOX_EMAIL) {
      throw new Error('Missing E2E_OWNER_MAILBOX_EMAIL. Owner OTP mailbox validation cannot run without a distinct mailbox identity.');
    }

    await page.goto('/owner/contracts', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/contracts/, { timeout: 20_000 });

    const signatureName = page.getByTestId('owner-contract-signature-name');
    await expect(signatureName).toBeVisible({ timeout: 30_000 });
    await signatureName.fill('E2E Owner Signature');

    const requestOtp = page.getByTestId('owner-contract-signature-otp-request');
    await expect(requestOtp).toBeEnabled({ timeout: 10_000 });
    const otpRequestedAtMs = Date.now();
    await requestOtp.click();

    const challenge = page.getByTestId('owner-contract-signature-otp-challenge');
    await expect(challenge).toBeVisible({ timeout: 35_000 });
    const correlationId = await challenge.getAttribute('data-correlation-id') || '';
    expect(correlationId, 'backend OTP request ID must be visible before reading Gmail').toMatch(/\S/);

    const otpCode = page.getByTestId('owner-contract-signature-otp-code');
    await expect(otpCode).toBeVisible({ timeout: 35_000 });

    const otp = await getLatestOtp('owner', {
      expectedSender:    process.env.E2E_OTP_EXPECTED_SENDER || 'ceo@bin-groups.com',
      expectedRecipient: MAILBOX_EMAIL,
      correlationId,
      timeoutMs:         90_000,
      afterMs:           otpRequestedAtMs - 5_000,
      subjectHint:       'contract signature',
    });

    await otpCode.fill(otp);
    const submitOtp = page.getByTestId('owner-contract-signature-otp-submit');
    await expect(submitOtp).toBeEnabled({ timeout: 5_000 });
    await submitOtp.click();

    await expect(page.getByText(/Signature OTP verified/i)).toBeVisible({ timeout: 30_000 });
    await expect(submitOtp).toBeDisabled();
  });
});
