import { config as loadDotenv } from 'dotenv';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, type Page, type Response } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(__dirname, '../..');
const envPath = path.resolve(repositoryRoot, '.env.e2e');
const evidencePath = path.resolve(repositoryRoot, 'launch_package/artifacts/broker-commercial-lifecycle-production-evidence.json');
if (existsSync(envPath)) loadDotenv({ path: envPath, override: false });

const BROKER_EMAIL = String(process.env.E2E_BROKER_EMAIL || '').trim().toLowerCase();
const BROKER_PASSWORD = String(process.env.E2E_BROKER_PASSWORD || '').trim();
const OWNER_EMAIL = String(process.env.E2E_OWNER_EMAIL || '').trim().toLowerCase();
const ADMIN_EMAIL = String(process.env.E2E_ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.E2E_ADMIN_PASSWORD || '').trim();
const ADMIN_MFA_CODE = String(process.env.E2E_ADMIN_REAL_MFA_CODE || '').trim();
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app').trim().replace(/\/+$/, '');

const adminUrl = (pathname: string) => `${ADMIN_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;

function requireCredentials() {
  const required = {
    E2E_BROKER_EMAIL: BROKER_EMAIL,
    E2E_BROKER_PASSWORD: BROKER_PASSWORD,
    E2E_OWNER_EMAIL: OWNER_EMAIL,
    E2E_OWNER_PASSWORD: process.env.E2E_OWNER_PASSWORD,
    E2E_ADMIN_EMAIL: ADMIN_EMAIL,
    E2E_ADMIN_PASSWORD: ADMIN_PASSWORD,
    E2E_ADMIN_REAL_MFA_CODE: /^\d{6}$/.test(ADMIN_MFA_CODE) ? ADMIN_MFA_CODE : '',
    VITE_FIREBASE_APPCHECK_DEBUG_TOKEN: process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN,
    E2E_BROKER_GMAIL_CLIENT_ID: process.env.E2E_BROKER_GMAIL_CLIENT_ID,
    E2E_BROKER_GMAIL_CLIENT_SECRET: process.env.E2E_BROKER_GMAIL_CLIENT_SECRET,
    E2E_BROKER_GMAIL_REFRESH_TOKEN: process.env.E2E_BROKER_GMAIL_REFRESH_TOKEN,
  };
  const missing = Object.entries(required).filter(([, value]) => !String(value || '').trim()).map(([name]) => name);
  if (missing.length) {
    throw new Error(`Missing or invalid ${missing.join(', ')}. Broker commercial lifecycle proof cannot be skipped.`);
  }
}

function runEvidence(mode: 'convert' | 'submit-first' | 'submit-second' | 'verify-paid', leadName = '') {
  const args = ['scripts/run-broker-commercial-lifecycle-evidence.mjs', `--mode=${mode}`];
  if (leadName) args.push(`--lead-name=${leadName}`);
  execFileSync(process.execPath, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    timeout: 20 * 60 * 1000,
  });
  if (!existsSync(evidencePath)) throw new Error('Broker lifecycle runner did not create its evidence artifact.');
  return JSON.parse(readFileSync(evidencePath, 'utf8')) as any;
}

async function loginBroker(page: Page) {
  await page.context().clearCookies();
  await page.goto(`/login?intendedRole=broker&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(`/login?intendedRole=broker&refresh=${Date.now()}`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"], input[name*="email" i]').first().fill(BROKER_EMAIL);
  await page.locator('input[type="password"]').first().fill(BROKER_PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL('**/broker/**', { timeout: 30_000 });
  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|identity fault|access denied/i,
    { timeout: 15_000 },
  );
}

function isFirebasePasswordResponse(response: Response) {
  return /identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/.test(response.url());
}

async function loginAdminWithRealMfa(page: Page) {
  await page.context().clearCookies();
  await page.goto(adminUrl('/login'), { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(adminUrl('/login'), { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('admin-login-email')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('admin-login-password')).toBeVisible({ timeout: 10_000 });

  const responsePromise = page.waitForResponse(isFirebasePasswordResponse, { timeout: 30_000 });
  await page.getByTestId('admin-login-email').fill(ADMIN_EMAIL);
  await page.getByTestId('admin-login-password').fill(ADMIN_PASSWORD);
  await page.getByTestId('admin-login-submit').click();
  const authResponse = await responsePromise;
  expect(authResponse.status(), `Firebase Admin Auth response: ${(await authResponse.text()).slice(0, 1_000)}`).toBeLessThan(400);

  const challenge = page.getByTestId('admin-mfa-signin-challenge');
  await expect(challenge, 'Broker payout settlement requires a real enrolled Admin MFA session').toBeVisible({ timeout: 30_000 });
  await page.getByTestId('admin-mfa-send-signin-code').click();
  await expect(page.getByTestId('admin-mfa-signin-code')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('admin-mfa-signin-code').fill(ADMIN_MFA_CODE);
  await page.getByTestId('admin-mfa-resolve-signin').click();
  await page.waitForURL(`${ADMIN_BASE_URL}/dashboard`, { timeout: 45_000 });
  await expect(page.locator('body')).not.toContainText(
    /permission-denied|missing or insufficient permissions|application error|minified react error|admin console could not start/i,
    { timeout: 15_000 },
  );
}

function payoutPanel(page: Page) {
  return page.getByText('Broker Payout Requests', { exact: true })
    .locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]');
}

function payoutCard(page: Page, requestId: string, brokerName: string, amount: number, status: string) {
  const panel = payoutPanel(page);
  const byRequestId = panel.locator(`[data-payout-request-id="${requestId}"]`);
  const amountLabel = `AED ${Number(amount).toLocaleString()}`;
  return byRequestId.or(
    panel.locator('div.MuiBox-root')
      .filter({ hasText: brokerName })
      .filter({ hasText: amountLabel })
      .filter({ hasText: status })
      .last(),
  ).first();
}

async function createAttributedLead(page: Page, leadName: string) {
  await page.goto('/broker/leads/new', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/broker\/leads\/new/, { timeout: 20_000 });
  await page.getByTestId('broker-lead-client-name').fill(leadName);
  await page.getByLabel(/Phone Number/i).fill('+971500000001');
  await page.getByLabel(/Email Address/i).fill(OWNER_EMAIL);
  await page.getByLabel(/Property Interest|Requirement/i).fill('Full maintenance and property management for the activated Owner portfolio');
  await page.getByLabel(/Location|Emirate/i).fill('Abu Dhabi');
  await page.getByLabel(/Budget Range/i).fill('1250000');
  await page.getByLabel(/Mission Notes/i).fill('Protected exact-SHA Broker commercial conversion evidence.');
  await page.getByTestId('broker-lead-submit').click();
  await expect(page.locator('body')).toContainText(/Lead recorded with attribution broker_lead_/i, { timeout: 25_000 });
  const card = page.getByTestId('broker-lead-card').filter({ hasText: leadName }).first();
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText(/ATTRIBUTION|broker_lead_/i, { timeout: 20_000 });
}

async function rejectFirstPayout(page: Page, evidence: any) {
  await page.goto(adminUrl(`/broker?refresh=${Date.now()}`), { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/broker/, { timeout: 20_000 });
  const request = evidence.payout.first;
  const card = payoutCard(page, request.payoutRequestId, evidence.broker.displayName, request.amount, 'PENDING ADMIN REVIEW');
  await expect(card).toBeVisible({ timeout: 30_000 });
  page.once('dialog', async (dialog) => dialog.accept('Protected E2E rejection: bank settlement reference requires correction.'));
  await card.getByRole('button', { name: 'Reject', exact: true }).click();
  await expect(card).toContainText('REJECTED', { timeout: 30_000 });
}

async function approveAndPayReplacement(page: Page, evidence: any) {
  await page.goto(adminUrl(`/broker?refresh=${Date.now()}`), { waitUntil: 'domcontentloaded' });
  const request = evidence.payout.second;
  const card = payoutCard(page, request.payoutRequestId, evidence.broker.displayName, request.amount, 'PENDING ADMIN REVIEW');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card.getByRole('button', { name: 'Mark paid', exact: true })).toBeVisible({ timeout: 30_000 });
  page.once('dialog', async (dialog) => dialog.accept(`E2E-BROKER-SETTLED-${Date.now()}`));
  await card.getByRole('button', { name: 'Mark paid', exact: true }).click();
  await expect(card).toContainText('PAID', { timeout: 30_000 });
}

test.describe('Broker Business Workflow', () => {
  test.describe.configure({ mode: 'serial' });
  test.setTimeout(32 * 60 * 1000);

  test.afterAll(() => {
    execFileSync(process.execPath, ['scripts/run-owner-business-suite-evidence.mjs', 'restore-shared-fixtures'], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'inherit',
      timeout: 5 * 60 * 1000,
    });
  });

  test('Broker lead converts through Owner activation, one commission, mailbox OTP and Admin MFA settlement', async ({ page }, testInfo) => {
    requireCredentials();
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    await monitor.assertTokenFingerprint();
    await loginBroker(page);

    const leadName = `E2E Broker Commercial ${Date.now()}-${testInfo.retry}`;
    await createAttributedLead(page, leadName);
    monitor.assertClean('Broker lead capture');
    monitor.assertAuthenticatedFirebaseRead('Broker lead capture');

    let evidence = runEvidence('convert', leadName);
    expect(evidence.status).toBe('conversion_ready');
    expect(evidence.owner).toMatchObject({ activatedFromProductionOnboarding: true });
    expect(evidence.lead).toMatchObject({ createdThroughBrokerUi: true, ownerLinked: true, attributionReplayIdempotent: true });
    expect(evidence.contract).toMatchObject({ active: true, brokerAttributed: true });
    expect(evidence.commission).toMatchObject({ exactContractCommissionCount: 1, duplicatePrevented: true });
    expect(evidence.commission.percentage).toBeGreaterThanOrEqual(5);
    expect(evidence.commission.percentage).toBeLessThanOrEqual(8);

    await loginAdminWithRealMfa(page);

    evidence = runEvidence('submit-first');
    expect(evidence.status).toBe('first_payout_pending');
    expect(evidence.payout.first).toMatchObject({ submitted: true, otpVerified: true, otpReplayBlocked: true, status: 'PENDING_ADMIN_REVIEW' });
    expect(evidence.payout.first.brandedFrom).toBe('BIN GROUP <ceo@bin-groups.com>');
    expect(evidence.payout.first.providerMessageId).toBeTruthy();
    expect(evidence.payout.first.mailbox).toMatchObject({
      mailboxReceived: true,
      recipientVerified: true,
      brandedSenderVerified: true,
      subjectVerified: true,
    });
    await rejectFirstPayout(page, evidence);

    evidence = runEvidence('submit-second');
    expect(evidence.status).toBe('second_payout_pending');
    expect(evidence.payout.firstRejectedByAdminMfa).toBe(true);
    expect(evidence.payout.second).toMatchObject({ submitted: true, otpVerified: true, otpReplayBlocked: true, status: 'PENDING_ADMIN_REVIEW' });
    expect(evidence.payout.second.mailbox).toMatchObject({ mailboxReceived: true, recipientVerified: true, brandedSenderVerified: true });
    await approveAndPayReplacement(page, evidence);

    evidence = runEvidence('verify-paid');
    expect(evidence.status).toBe('passed');
    expect(evidence.commitSha).toBe(process.env.GITHUB_SHA);
    expect(evidence.commission).toMatchObject({ finalStatus: 'PAID', exactContractCommissionCount: 1, duplicatePrevented: true });
    expect(evidence.payout).toMatchObject({
      adminMfaRejectionProven: true,
      adminMfaApprovalProven: true,
      adminMfaPaidSettlementProven: true,
    });
    expect(evidence.payout.first.finalStatus).toBe('REJECTED');
    expect(evidence.payout.second.finalStatus).toBe('PAID');
    expect(evidence.audit).toEqual({ firstRejection: true, secondApproval: true, secondPaidSettlement: true });

    await loginBroker(page);
    await page.goto('/broker/commissions', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText(new RegExp(leadName, 'i'), { timeout: 30_000 });
    await expect(page.locator('body')).toContainText('PAID', { timeout: 20_000 });
    await expect(page.locator('body')).toContainText(`AED ${Number(evidence.commission.amount).toLocaleString()}`, { timeout: 20_000 });

    await testInfo.attach('broker-commercial-lifecycle-production-evidence', {
      path: evidencePath,
      contentType: 'application/json',
    });
  });
});
