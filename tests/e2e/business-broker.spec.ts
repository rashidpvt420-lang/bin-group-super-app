/**
 * Protected production business proof for the Broker role.
 *
 * The browser creates the attributed lead. A protected exact-SHA runner then
 * converts that same lead through an active contract, the real commission
 * trigger, one deterministic commission, SMTP OTP verification, and a
 * completed single-use payout submission.
 */
import { config as loadDotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const envPath = path.resolve(repositoryRoot, '.env.e2e');
const evidencePath = path.resolve(repositoryRoot, 'launch_package/artifacts/broker-production-evidence.json');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const EMAIL = process.env.E2E_BROKER_MAILBOX_EMAIL ?? '';
const PASSWORD = process.env.E2E_BROKER_PASSWORD ?? '';

type BrokerProductionEvidence = {
  status?: string;
  projectId?: string;
  commitSha?: string;
  broker?: {
    authenticated?: boolean;
    privateKycVerified?: boolean;
    commissionAgreementAccepted?: boolean;
  };
  leadConversion?: {
    leadId?: string;
    attributionId?: string;
    leadCreatedThroughUi?: boolean;
    converted?: boolean;
    contractId?: string;
    contractActive?: boolean;
  };
  commission?: {
    commissionId?: string;
    source?: string;
    amount?: number;
    percentage?: number;
    countAfterActivationReplay?: number;
    deterministicIdPreserved?: boolean;
    payoutStatus?: string;
  };
  payout?: {
    challengeId?: string;
    providerMessageId?: string;
    bindingHash?: string;
    otpVerified?: boolean;
    otpConsumed?: boolean;
    payoutRequestId?: string;
    payoutStatus?: string;
    verificationState?: string;
    amount?: number;
    commissionCount?: number;
    replayRejected?: boolean;
  };
};

function requireLaunchCredentials() {
  const required = [
    ['E2E_BROKER_MAILBOX_EMAIL', EMAIL],
    ['E2E_BROKER_PASSWORD', PASSWORD],
    ['VITE_FIREBASE_APPCHECK_DEBUG_TOKEN', process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? ''],
    ['GITHUB_SHA', process.env.GITHUB_SHA ?? ''],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing ${missing.join(', ')}. Broker production validation cannot be skipped for public release.`);
  }
}

function runBrokerLifecycleProof(leadName: string) {
  requireLaunchCredentials();
  execFileSync(process.execPath, ['scripts/run-broker-production-evidence.mjs'], {
    cwd: repositoryRoot,
    env: { ...process.env, E2E_BROKER_LEAD_NAME: leadName },
    stdio: 'inherit',
    timeout: 8 * 60 * 1000,
  });
  if (!existsSync(evidencePath)) {
    throw new Error('Broker production lifecycle runner did not create its evidence artifact.');
  }
  return JSON.parse(readFileSync(evidencePath, 'utf8')) as BrokerProductionEvidence;
}

async function login(page: Page) {
  requireLaunchCredentials();
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/broker/dashboard', { timeout: 20_000 });

  const identitySpinner = page.getByText(/Authenticating BIN-Groups Identity/i).first();
  await expect(
    identitySpinner,
    'Broker identity must resolve. Seed/repair the Broker Auth role claim and users/{uid} profile when this remains visible.',
  ).toBeHidden({ timeout: 15_000 });

  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|identity fault|role authorization error/i,
    { timeout: 10_000 },
  );
}

test.describe('Broker Business Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    const appCheckMonitor = await attachAuthenticatedAppCheckMonitor(page);
    (page as any).__binAppCheckMonitor = appCheckMonitor;
    await appCheckMonitor.assertTokenFingerprint();
    await login(page);
  });

  test.afterEach(async ({ page }) => {
    const monitor = (page as any).__binAppCheckMonitor;
    if (!monitor) return;
    monitor.assertClean(test.info().title);
    monitor.assertAuthenticatedFirebaseRead(test.info().title);
  });

  test('UI lead converts to one idempotent commission and a completed OTP payout submission', async ({ page }, testInfo) => {
    test.setTimeout(10 * 60 * 1000);
    const uniqueLead = `E2E Broker Conversion ${process.env.GITHUB_RUN_ID || Date.now()}`;

    await page.goto('/broker/leads/new', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });

    const clientName = page.getByTestId('broker-lead-client-name');
    await expect(clientName).toBeVisible({ timeout: 15_000 });
    await clientName.fill(uniqueLead);
    await page.getByLabel(/Phone Number/i).fill('+971501234567');
    await page.getByLabel(/Email Address/i).fill(`broker-e2e-${Date.now()}@example.com`);
    await page.getByLabel(/Property Interest|Requirement/i).fill('Full maintenance and property management for an attributed production-evidence property');
    await page.getByLabel(/Location|Emirate/i).fill('Al Ain');
    await page.getByLabel(/Budget Range/i).fill('50000');
    await page.getByLabel(/Mission Notes/i).fill('Protected exact-SHA Broker conversion, commission, and payout evidence.');

    const submitLead = page.getByTestId('broker-lead-submit');
    await expect(submitLead).toBeEnabled({ timeout: 10_000 });
    await submitLead.click();

    await expect(page.getByText(/Lead recorded with attribution/i)).toBeVisible({ timeout: 25_000 });
    const createdLeadCard = page.getByTestId('broker-lead-card').filter({ hasText: uniqueLead }).first();
    await expect(createdLeadCard).toBeVisible({ timeout: 20_000 });
    await expect(createdLeadCard).toContainText(/ATTRIBUTION|broker_lead_/i, { timeout: 20_000 });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|Lead could not be submitted/i, { timeout: 5_000 });

    const evidence = runBrokerLifecycleProof(uniqueLead);
    expect(evidence.status).toBe('passed');
    expect(evidence.projectId).toBe('bin-group-57c60');
    expect(evidence.commitSha).toBe(process.env.GITHUB_SHA);
    expect(evidence.broker).toMatchObject({
      authenticated: true,
      privateKycVerified: true,
      commissionAgreementAccepted: true,
    });
    expect(evidence.leadConversion).toMatchObject({
      leadCreatedThroughUi: true,
      converted: true,
      contractActive: true,
    });
    expect(evidence.leadConversion?.leadId).toBeTruthy();
    expect(evidence.leadConversion?.attributionId).toMatch(/^broker_lead_/);
    expect(evidence.leadConversion?.contractId).toMatch(/^e2e_broker_contract_/);
    expect(evidence.commission).toMatchObject({
      source: 'CONTRACT_ACTIVATION',
      amount: 500,
      percentage: 5,
      countAfterActivationReplay: 1,
      deterministicIdPreserved: true,
      payoutStatus: 'REQUESTED',
    });
    expect(evidence.commission?.commissionId).toBe(`commission_${evidence.leadConversion?.contractId}`);
    expect(evidence.payout).toMatchObject({
      otpVerified: true,
      otpConsumed: true,
      payoutStatus: 'PENDING_ADMIN_REVIEW',
      verificationState: 'EMAIL_OTP_SINGLE_USE_PRIVATE_KYC',
      amount: 500,
      commissionCount: 1,
      replayRejected: true,
    });
    expect(evidence.payout?.providerMessageId).toBeTruthy();
    expect(evidence.payout?.bindingHash).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.payout?.payoutRequestId).toBeTruthy();

    await testInfo.attach('broker-production-evidence', {
      path: evidencePath,
      contentType: 'application/json',
    });

    await page.goto('/broker/commissions', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/Finance & Payouts/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('body')).toContainText(/PENDING ADMIN REVIEW/i, { timeout: 30_000 });
    await expect(page.locator('body')).toContainText(/REQUESTED/i, { timeout: 30_000 });
    await expect(page.locator('body')).not.toContainText(/Unable to load commission records|payout verification or submission failed|permission-denied/i);
  });
});
