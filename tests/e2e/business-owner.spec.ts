/**
 * Authenticated production business proof for the five-page inspection-first
 * Owner lifecycle. No Firebase network mocking is allowed.
 */
import { config as loadDotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, Page } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

test.use({ trace: 'off', video: 'off', screenshot: 'off' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const envPath = path.resolve(repositoryRoot, '.env.e2e');
const evidencePath = path.resolve(repositoryRoot, 'launch_package/artifacts/owner-onboarding-production-evidence.json');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const EMAIL = process.env.E2E_OWNER_EMAIL ?? '';
const PASSWORD = process.env.E2E_OWNER_PASSWORD ?? '';
const ACQUIRED_PROPERTY = 'E2E Owner Acquisition Tower';

type OwnerLifecycleEvidence = {
  status?: string;
  projectId?: string;
  workflowVersion?: string;
  owner?: {
    acquiredThroughCallable?: boolean;
    authenticated?: boolean;
    dashboardStartedLocked?: boolean;
    dashboardUnlockedAfterApproval?: boolean;
  };
  onboarding?: {
    intakeId?: string;
    propertyCount?: number;
    clientDraftId?: string;
    serverGeneratedPropertyIds?: string[];
    mobilizationPercent?: number;
    submissionIdempotentReplay?: boolean;
    paymentNotDueBeforeInspections?: boolean;
    finalApprovalIdempotentReplay?: boolean;
    invoiceId?: string;
    invoiceProofHash?: string;
  };
  inspectionEvidence?: {
    inspectionIds?: string[];
    inspectionCount?: number;
    evidenceHash?: string;
    evidenceGeneration?: string;
    checklistVerified?: boolean;
    arrivalWithinRadius?: boolean;
    distanceMetres?: number;
    visitStartedAtPresent?: boolean;
    visitCompletedAtPresent?: boolean;
  };
  paymentEvidence?: {
    policy?: string;
    method?: string;
    paymentConfigVersion?: string;
    paymentConfigHash?: string;
    approvedMethods?: string[];
    amountReceived?: number;
    receiptHash?: string;
    receiptGeneration?: string;
    sensitiveValuesExcluded?: boolean;
  };
  adminApproval?: {
    canonicalFounderEmail?: string;
    mfaSecondFactorType?: string;
    mfaSecondFactorIdentifierPresent?: boolean;
    contractActivated?: boolean;
    propertyActivated?: boolean;
    dashboardUnlocked?: boolean;
  };
  emailDelivery?: Record<string, unknown>;
};

let lifecycleEvidence: OwnerLifecycleEvidence;

function requireLaunchCredentials() {
  const required = [
    ['E2E_OWNER_EMAIL', EMAIL],
    ['E2E_OWNER_PASSWORD', PASSWORD],
    ['E2E_FOUNDER_EMAIL', process.env.E2E_FOUNDER_EMAIL ?? ''],
    ['E2E_FOUNDER_PASSWORD', process.env.E2E_FOUNDER_PASSWORD ?? ''],
    ['E2E_FOUNDER_TOTP_SECRET', process.env.E2E_FOUNDER_TOTP_SECRET ?? ''],
    ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN', process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? ''],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')}. Inspection-first Owner activation proof cannot be skipped.`);
  }
}

function runOwnerSuiteCommand(mode: 'lifecycle' | 'restore-shared-fixtures') {
  execFileSync(process.execPath, ['scripts/run-owner-business-suite-evidence.mjs', mode], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    timeout: 18 * 60 * 1000,
  });
}

function runOwnerLifecycleProof() {
  requireLaunchCredentials();
  runOwnerSuiteCommand('lifecycle');
  if (!existsSync(evidencePath)) {
    throw new Error('Inspection-first Owner production runner did not create its evidence artifact.');
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

async function acceptLegalAgreementIfRequired(page: Page) {
  const agreement = page.getByRole('dialog').filter({ hasText: /SOVEREIGN INSTITUTIONAL AGREEMENT/i }).first();
  if (!await agreement.isVisible({ timeout: 5_000 }).catch(() => false)) return;

  const content = agreement.getByTestId('legal-agreement-content');
  await expect(content, 'Owner legal agreement must expose its scrollable content').toBeVisible({ timeout: 10_000 });
  const agree = agreement.getByTestId('legal-agreement-accept');
  await expect(agree).toHaveAccessibleName(/I AGREE & ENTER/i);
  await expect.poll(async () => {
    // Fonts and responsive Dialog layout can change the scroll height after the
    // first synthetic scroll. Re-apply the real end position until React has
    // observed the final layout instead of racing one fire-and-forget event.
    await agreement.getByTestId('legal-agreement-end').scrollIntoViewIfNeeded();
    await content.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    return agree.isEnabled().catch(() => false);
  }, {
    timeout: 20_000,
    intervals: [100, 250, 500, 1_000],
    message: 'Owner legal consent must become enabled after the full agreement is reviewed',
  }).toBe(true);
  await agree.click();
  await expect(agreement).not.toBeVisible({ timeout: 20_000 });
  await expect(page.locator('body')).not.toContainText(/SOVEREIGN INSTITUTIONAL AGREEMENT/i, { timeout: 10_000 });
}

async function expectAcquiredOwnerDashboard(page: Page) {
  // The default Owner route is intentionally the decision-focused Simple
  // dashboard. Prove the activated property on the real advanced portfolio
  // route instead of expecting the Simple page to render inventory rows.
  await page.goto('/owner/dashboard/full', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/owner\/dashboard\/full/);
  await expect(page.locator('body'), 'Owner dashboard must render the server-generated activation property').toContainText(
    new RegExp(ACQUIRED_PROPERTY, 'i'),
    { timeout: 30_000 },
  );
  await expect(page.locator('body')).not.toContainText(
    /no properties found|dashboard locked|payment verification required|permission-denied/i,
    { timeout: 10_000 },
  );
}

test.describe('Owner Business Workflow', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(20 * 60 * 1000);

  test.beforeAll(() => {
    runOwnerLifecycleProof();
  });

  test.afterAll(() => {
    runOwnerSuiteCommand('restore-shared-fixtures');
  });

  test.beforeEach(async ({ page }) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = monitor;
    await monitor.assertTokenFingerprint();
    await login(page);
    await acceptLegalAgreementIfRequired(page);
  });

  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('Five-page Owner submission, evidence-backed visits, exact 15% and Founder MFA activation are production-proven', async ({ page }, testInfo) => {
    expect(lifecycleEvidence.status).toBe('passed');
    expect(lifecycleEvidence.projectId).toBe('bin-group-57c60');
    expect(lifecycleEvidence.workflowVersion).toBe('OWNER_FIVE_PAGE_INSPECTION_FIRST_V1');
    expect(lifecycleEvidence.owner).toMatchObject({
      acquiredThroughCallable: true,
      authenticated: true,
      dashboardStartedLocked: true,
      dashboardUnlockedAfterApproval: true,
    });
    expect(lifecycleEvidence.onboarding).toMatchObject({
      propertyCount: 1,
      mobilizationPercent: 15,
      submissionIdempotentReplay: true,
      paymentNotDueBeforeInspections: true,
      finalApprovalIdempotentReplay: true,
    });
    expect(lifecycleEvidence.onboarding?.intakeId).toMatch(/^e2e_owner_inspection_first_/);
    expect(lifecycleEvidence.onboarding?.clientDraftId).toBe('draft-owner-property-1');
    expect(lifecycleEvidence.onboarding?.serverGeneratedPropertyIds).toEqual([
      `${lifecycleEvidence.onboarding?.intakeId}_property_1`,
    ]);
    expect(lifecycleEvidence.onboarding?.invoiceId).toMatch(/^MOB-/);
    expect(lifecycleEvidence.onboarding?.invoiceProofHash).toMatch(/^[a-f0-9]{64}$/);

    expect(lifecycleEvidence.inspectionEvidence).toMatchObject({
      inspectionCount: 1,
      checklistVerified: true,
      arrivalWithinRadius: true,
      visitStartedAtPresent: true,
      visitCompletedAtPresent: true,
    });
    expect(lifecycleEvidence.inspectionEvidence?.inspectionIds?.[0]).toMatch(/^owner_inspection_/);
    expect(lifecycleEvidence.inspectionEvidence?.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(lifecycleEvidence.inspectionEvidence?.evidenceGeneration).toBeTruthy();
    expect(lifecycleEvidence.inspectionEvidence?.distanceMetres).toBeLessThanOrEqual(750);

    expect(lifecycleEvidence.paymentEvidence).toMatchObject({
      policy: 'phase1-manual',
      method: 'CASH',
      approvedMethods: ['CASH', 'CHEQUE'],
      sensitiveValuesExcluded: true,
    });
    expect(lifecycleEvidence.paymentEvidence?.paymentConfigVersion).toBeTruthy();
    expect(lifecycleEvidence.paymentEvidence?.paymentConfigHash).toMatch(/^[a-f0-9]{64}$/);
    expect(lifecycleEvidence.paymentEvidence?.receiptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(lifecycleEvidence.paymentEvidence?.receiptGeneration).toBeTruthy();

    expect(lifecycleEvidence.adminApproval).toMatchObject({
      canonicalFounderEmail: 'ceo@bin-groups.com',
      mfaSecondFactorType: 'totp',
      mfaSecondFactorIdentifierPresent: true,
      contractActivated: true,
      propertyActivated: true,
      dashboardUnlocked: true,
    });
    expect(Object.keys(lifecycleEvidence.emailDelivery ?? {})).toEqual(expect.arrayContaining([
      'contractOtpProviderMessageId',
      'contractOtpMailboxReceiptVerified',
      'contractOtpMailboxReceivedAt',
      'contractOtpMailboxMessageIdHash',
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

  test('Owner sees the active contract created only after visits and payment approval', async ({ page }) => {
    const intakeId = lifecycleEvidence.onboarding?.intakeId;
    expect(intakeId).toBeTruthy();
    await page.goto(`/owner/contracts?contractId=${encodeURIComponent(String(intakeId))}`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/contracts/, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(/no contracts on record|contract link was not found|permission-denied/i, { timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/Portfolio Contract|Maintenance Contract Only/i, { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/LOCKED CONTRACT SCOPE|ACTIVE AGREEMENTS|admin approved/i, { timeout: 20_000 });
  });

  test('Owner sees the exact 15% mobilisation invoice and Phase 1 controls', async ({ page }) => {
    const invoiceId = lifecycleEvidence.onboarding?.invoiceId;
    expect(invoiceId).toBeTruthy();
    await page.goto('/owner/financials', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/owner\/financials/, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(
      /permission-denied|missing or insufficient permissions|application error|minified react error|SOVEREIGN INSTITUTIONAL AGREEMENT/i,
      { timeout: 10_000 },
    );
    await expect(page.locator('body')).toContainText(/AED|payment|financial|invoice|billing/i, { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(new RegExp(String(invoiceId), 'i'), { timeout: 20_000 });
  });
});
