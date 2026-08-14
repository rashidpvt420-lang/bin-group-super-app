/**
 * business-broker.spec.ts
 * Deep production E2E for the Broker role.
 * Proves both the Broker UI and the server-authoritative lead -> contract ->
 * deterministic commission -> single-use payout lifecycle.
 */
import { config as loadDotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test, expect, Page } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';
import { getLatestOtp } from './helpers/gmail-otp-reader';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const envPath = path.resolve(repositoryRoot, '.env.e2e');
const lifecycleEvidencePath = path.resolve(repositoryRoot, 'launch_package/artifacts/broker-production-evidence.json');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

// Owner and Broker authenticate using their dedicated OAuth-verified mailboxes.
const EMAIL = process.env.E2E_BROKER_MAILBOX_EMAIL ?? '';
const PASSWORD = process.env.E2E_BROKER_PASSWORD ?? '';

function requireLaunchCredentials() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('Missing E2E_BROKER_MAILBOX_EMAIL/PASSWORD. Broker launch validation cannot be skipped for public release.');
  }
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
    'Broker identity must resolve. Seed/repair the broker Auth role claim and users/{uid} profile when this remains visible.',
  ).toBeHidden({ timeout: 15_000 });

  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|identity fault|role authorization error/i,
    { timeout: 10_000 },
  );
}

async function submitBrokerLead(page: Page, uniqueLead: string) {
  await page.goto('/broker/leads/new', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });

  const clientName = page.getByTestId('broker-lead-client-name');
  await expect(clientName).toBeVisible({ timeout: 15_000 });
  await clientName.fill(uniqueLead);

  await page.getByLabel(/Phone Number/i).fill('+971501234567');
  await page.getByLabel(/Email Address/i).fill(`broker-e2e-${Date.now()}@example.com`);
  await page.getByLabel(/Property Interest|Requirement/i).fill('Full maintenance and property management for an E2E production villa');
  await page.getByLabel(/Location|Emirate/i).fill('Al Ain');
  await page.getByLabel(/Budget Range/i).fill('50000');
  await page.getByLabel(/Mission Notes/i).fill('Exact-SHA verification of Broker attribution, conversion, commission idempotency, and payout authority.');

  const submitLead = page.getByTestId('broker-lead-submit');
  await expect(submitLead).toBeEnabled({ timeout: 10_000 });
  await submitLead.click();

  await expect(page.getByText(/Lead recorded with attribution/i)).toBeVisible({ timeout: 25_000 });
  const createdLeadCard = page.getByTestId('broker-lead-card').filter({ hasText: uniqueLead }).first();
  await expect(createdLeadCard).toBeVisible({ timeout: 20_000 });
  await expect(createdLeadCard).toContainText(/ATTRIBUTION|broker_lead_/i, { timeout: 20_000 });
  await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions|Lead could not be submitted/i, { timeout: 5_000 });
}

test.describe('Broker Business Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    // Every retry must receive a fresh single-use commission and OTP state.
    // Preparing only once in run-critical-evidence makes a serial-suite retry
    // rerun this test against the commission consumed by the first attempt.
    execFileSync(process.execPath, ['scripts/prepare-broker-payout-otp-e2e.mjs'], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
      timeout: 60_000,
    });
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

  test('Broker can submit a lead, view commissions, and complete a real mailbox OTP payout request', async ({ page }) => {
    test.setTimeout(240_000);
    const uniqueLead = `E2E Lead ${Date.now()}`;
    await submitBrokerLead(page, uniqueLead);

    await page.goto('/broker/commissions', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).not.toContainText(/permission-denied|missing or insufficient permissions/i, { timeout: 10_000 });
    await expect(page.getByText(/Finance & Payouts/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('body')).toContainText(/PENDING SETTLEMENT|APPROVED FOR PAYOUT|LIFETIME EARNED/i, { timeout: 15_000 });

    const requestOtp = page.getByTestId('broker-payout-request-otp');
    await expect(requestOtp).toBeVisible({ timeout: 15_000 });
    await expect(requestOtp).toBeEnabled({ timeout: 15_000 });
    await expect(requestOtp).toContainText(/REQUEST PAYOUT \(1\)/i);
    const otpStartMs = Date.now();
    const requestOtpResponsePromise = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('requestBrokerPayoutOtp'),
      { timeout: 75_000 },
    );
    await requestOtp.click();
    const requestOtpResponse = await requestOtpResponsePromise;
    const requestOtpPayload = await requestOtpResponse.json().catch(() => ({})) as any;
    if (!requestOtpResponse.ok() || requestOtpPayload?.error) {
      throw new Error(
        `requestBrokerPayoutOtp failed HTTP ${requestOtpResponse.status()}: ${JSON.stringify(requestOtpPayload).slice(0, 1_500)}`,
      );
    }
    expect(String(requestOtpPayload?.result?.challengeId || '')).not.toBe('');

    const otpDialog = page.getByTestId('broker-payout-otp-dialog');
    await expect(otpDialog).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/A six-digit payout verification code was sent to your verified Broker email/i)).toBeVisible({ timeout: 10_000 });
    await expect(otpDialog).toContainText(/Code sent for AED 500 across 1 commission/i);

    const otpCode = page.getByTestId('broker-payout-otp-code');
    await expect(otpCode).toHaveValue('');
    await expect(page.getByTestId('broker-payout-otp-submit')).toBeDisabled();

    const otp = await getLatestOtp('broker', {
      timeoutMs: 90_000,
      afterMs: otpStartMs - 10_000,
      subjectHint: 'payout verification',
    });

    await otpCode.fill(otp);
    const submitOtp = page.getByTestId('broker-payout-otp-submit');
    await expect(submitOtp).toBeEnabled({ timeout: 5_000 });
    await submitOtp.click();

    await expect(page.getByText(/Payout request submitted|Payout approved|payout successfully/i)).toBeVisible({ timeout: 30_000 });
    await expect(otpDialog).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('body')).not.toContainText(/Unable to send payout verification code|payout verification or submission failed/i);
  });

  test('UI-created lead converts to one deterministic commission and one single-use payout request', async ({ page }, testInfo) => {
    test.setTimeout(360_000);
    const uniqueLead = `E2E Lifecycle Lead ${Date.now()}`;
    await submitBrokerLead(page, uniqueLead);

    execFileSync(process.execPath, ['scripts/run-broker-production-evidence.mjs'], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        E2E_BROKER_LEAD_NAME: uniqueLead,
      },
      stdio: 'inherit',
      timeout: 5 * 60 * 1000,
    });

    expect(existsSync(lifecycleEvidencePath), 'Broker lifecycle runner must create its exact-SHA evidence artifact.').toBe(true);
    const evidence = JSON.parse(readFileSync(lifecycleEvidencePath, 'utf8'));

    expect(evidence).toMatchObject({
      status: 'passed',
      projectId: 'bin-group-57c60',
      hardLaunchClaim: false,
      leadConversion: {
        leadCreatedThroughUi: true,
        converted: true,
        contractActive: true,
      },
      commission: {
        countAfterActivationReplay: 1,
        deterministicIdPreserved: true,
        payoutStatus: 'REQUESTED',
      },
      payout: {
        mailboxReceiptVerified: true,
        otpVerified: true,
        otpConsumed: true,
        commissionCount: 1,
        replayRejected: true,
      },
    });
    expect(evidence.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(evidence.commission.amount).toBe(500);
    expect(evidence.commission.currency).toBe('AED');

    await testInfo.attach('broker-contract-to-payout-production-evidence', {
      path: lifecycleEvidencePath,
      contentType: 'application/json',
    });
  });
});
