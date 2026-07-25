import { test, expect, type Page, type Response } from '@playwright/test';
import { attachAuthenticatedAppCheckMonitor } from './helpers/appCheckDebug';

const EMAIL = String(process.env.E2E_ADMIN_EMAIL || '').trim();
const PASSWORD = String(process.env.E2E_ADMIN_PASSWORD || '').trim();
const REAL_MFA_CODE = String(process.env.E2E_ADMIN_REAL_MFA_CODE || '').trim();
const ADMIN_BASE_URL = String(process.env.E2E_ADMIN_BASE_URL || 'https://bin-group-admin-panel.web.app').trim().replace(/\/+$/, '');

const adminUrl = (pathname: string) => `${ADMIN_BASE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;

function requireCredentials() {
  const missing = [
    !EMAIL ? 'E2E_ADMIN_EMAIL' : '',
    !PASSWORD ? 'E2E_ADMIN_PASSWORD' : '',
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing ${missing.join(', ')}. Admin authentication proof cannot be skipped.`);
}

function isFirebasePasswordResponse(response: Response) {
  return /identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/.test(response.url());
}

async function collectDiagnostics(page: Page) {
  const errors: string[] = [];
  const failedRequests: string[] = [];
  const failedScripts: string[] = [];
  const pageErrors: string[] = [];

  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    const line = `${request.method()} ${request.url()} — ${request.failure()?.errorText || 'failed'}`;
    failedRequests.push(line);
    if (request.resourceType() === 'script') failedScripts.push(line);
  });

  return async (authResponse?: Response | null) => ({
    currentUrl: page.url(),
    bodyText: (await page.locator('body').innerText().catch(() => '')).slice(0, 4_000),
    firstPageError: pageErrors[0] || null,
    consoleErrors: errors.slice(0, 20),
    requestFailures: failedRequests.slice(0, 20),
    failedScriptUrl: failedScripts[0] || null,
    firebaseAuthStatus: authResponse?.status() || null,
    firebaseAuthBody: authResponse ? (await authResponse.text().catch(() => '')).slice(0, 2_000) : null,
  });
}

test.describe('Admin authentication recovery proof', () => {
  test('real Admin login initializes the bundle and reaches the dashboard', async ({ page }) => {
    test.setTimeout(120_000);
    requireCredentials();

    const diagnostics = await collectDiagnostics(page);
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    await monitor.assertTokenFingerprint();

    let authResponse: Response | null = null;
    try {
      await page.goto(adminUrl('/login'), { waitUntil: 'domcontentloaded' });

      await expect(page.locator('body')).not.toContainText('AUTHENTICATING SOVEREIGN IDENTITY', { timeout: 20_000 });
      await expect(page.getByTestId('admin-bootstrap-error')).not.toBeVisible({ timeout: 2_000 }).catch(() => undefined);
      await expect(page.getByTestId('admin-login-email')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('admin-login-password')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByTestId('admin-login-submit')).toBeVisible({ timeout: 10_000 });

      const responsePromise = page.waitForResponse(isFirebasePasswordResponse, { timeout: 30_000 });
      await page.getByTestId('admin-login-email').fill(EMAIL);
      await page.getByTestId('admin-login-password').fill(PASSWORD);
      await page.getByTestId('admin-login-submit').click();
      authResponse = await responsePromise;

      expect(authResponse.status(), `Firebase Auth response: ${(await authResponse.text()).slice(0, 1_000)}`).toBeLessThan(400);

      const mfaChallenge = page.getByTestId('admin-mfa-signin-challenge');
      if (await mfaChallenge.isVisible({ timeout: 15_000 }).catch(() => false)) {
        if (!/^\d{6}$/.test(REAL_MFA_CODE)) {
          throw new Error('A real enrolled MFA challenge was returned. Supply the current SMS code through E2E_ADMIN_REAL_MFA_CODE; test/fake MFA is prohibited.');
        }
        await page.getByTestId('admin-mfa-send-signin-code').click();
        await expect(page.getByTestId('admin-mfa-signin-code')).toBeVisible({ timeout: 30_000 });
        await page.getByTestId('admin-mfa-signin-code').fill(REAL_MFA_CODE);
        await page.getByTestId('admin-mfa-resolve-signin').click();
      }

      await page.waitForURL(`${ADMIN_BASE_URL}/dashboard`, { timeout: 40_000 });
      await expect(page.locator('body')).not.toContainText(/AUTHENTICATING SOVEREIGN IDENTITY|ADMIN_INITIALIZATION_ERROR|Admin Console Could Not Start/i);
      monitor.assertClean(test.info().title);
      monitor.assertAuthenticatedFirebaseRead(test.info().title);
    } catch (error) {
      const evidence = await diagnostics(authResponse);
      throw new Error(`${error instanceof Error ? error.message : String(error)}\nAdmin auth diagnostics:\n${JSON.stringify(evidence, null, 2)}`);
    }
  });
});
