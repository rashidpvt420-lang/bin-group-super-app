import { createHmac } from 'node:crypto';
import { expect, type Page, type Response } from '@playwright/test';

export type AdminMfaCredentials = {
  email: string;
  password: string;
  totpSecret?: string;
  realPhoneCode?: string;
  label?: string;
};

const FIREBASE_PASSWORD_ENDPOINT = /identitytoolkit\.googleapis\.com\/v1\/accounts:signInWithPassword/;
const FIREBASE_MFA_FINALIZE_ENDPOINT = /identitytoolkit\.googleapis\.com\/v2\/accounts\/mfaSignIn:finalize/;
const TOTP_PERIOD_MS = 30_000;
const MIN_TOTP_LIFETIME_MS = 10_000;

function decodeBase32(input: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = String(input || '').toUpperCase().replace(/[\s=-]/g, '');
  if (!normalized || /[^A-Z2-7]/.test(normalized)) {
    throw new Error('TOTP secret must be a valid Base32 value.');
  }
  let bits = '';
  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
    bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotp(secret: string, timestamp = Date.now()) {
  const key = decodeBase32(secret);
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export function totpWindowRemainingMs(timestamp = Date.now()) {
  const elapsed = timestamp % TOTP_PERIOD_MS;
  return TOTP_PERIOD_MS - elapsed;
}

export async function waitForFreshTotpWindow(
  page: Pick<Page, 'waitForTimeout'>,
  minimumLifetimeMs = MIN_TOTP_LIFETIME_MS,
) {
  const minimum = Math.max(0, Math.min(minimumLifetimeMs, TOTP_PERIOD_MS - 1));
  const remaining = totpWindowRemainingMs();
  if (remaining >= minimum) return;
  await page.waitForTimeout(remaining + 250);
}

async function waitForNextTotpWindow(page: Pick<Page, 'waitForTimeout'>) {
  await page.waitForTimeout(totpWindowRemainingMs() + 250);
}

export function requireAdminMfaCredentials(prefix = 'E2E_FOUNDER') {
  const email = String(process.env[`${prefix}_EMAIL`] || '').trim().toLowerCase();
  const password = String(process.env[`${prefix}_PASSWORD`] || '').trim();
  const totpSecret = String(process.env[`${prefix}_TOTP_SECRET`] || '').trim();
  const realPhoneCode = String(process.env[`${prefix}_REAL_MFA_CODE`] || '').trim();
  if (!email || !password) {
    throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required.`);
  }
  if (!totpSecret && !/^\d{6}$/.test(realPhoneCode)) {
    throw new Error(`${prefix}_TOTP_SECRET or a current ${prefix}_REAL_MFA_CODE is required.`);
  }
  if (totpSecret) decodeBase32(totpSecret);
  return { email, password, totpSecret, realPhoneCode, label: prefix };
}

function isFirebasePasswordResponse(response: Response) {
  return FIREBASE_PASSWORD_ENDPOINT.test(response.url());
}

function isFirebaseMfaFinalizeResponse(response: Response) {
  return FIREBASE_MFA_FINALIZE_ENDPOINT.test(response.url());
}

async function submitMfaCode(page: Page) {
  const responsePromise = page.waitForResponse(isFirebaseMfaFinalizeResponse, { timeout: 15_000 }).catch(() => null);
  await page.getByTestId('admin-mfa-resolve-signin').click();
  return responsePromise;
}

async function visibleMfaError(page: Page) {
  const error = page.getByTestId('admin-mfa-signin-error');
  await error.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  return String((await error.textContent().catch(() => '')) || '').trim();
}

export async function loginAdminWithRealMfa(
  page: Page,
  adminBaseUrl: string,
  credentials: AdminMfaCredentials,
) {
  const baseUrl = String(adminBaseUrl || '').trim().replace(/\/+$/, '');
  if (!baseUrl) throw new Error('E2E_ADMIN_BASE_URL is required.');

  let authResponse: Response | null = null;
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText || 'failed'}`);
  });

  try {
    await page.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('admin-login-email')).toBeVisible({ timeout: 25_000 });
    await expect(page.getByTestId('admin-login-password')).toBeVisible({ timeout: 10_000 });
    const responsePromise = page.waitForResponse(isFirebasePasswordResponse, { timeout: 30_000 });
    await page.getByTestId('admin-login-email').fill(credentials.email);
    await page.getByTestId('admin-login-password').fill(credentials.password);
    await page.getByTestId('admin-login-submit').click();
    authResponse = await responsePromise;
    expect(authResponse.status(), 'Firebase Auth password endpoint returned an error status.').toBeLessThan(400);

    await expect(page.getByTestId('admin-mfa-signin-challenge')).toBeVisible({ timeout: 30_000 });
    if (credentials.totpSecret) {
      const factorSelect = page.getByTestId('admin-mfa-factor-select');
      if (await factorSelect.isVisible().catch(() => false)) {
        const options = await factorSelect.locator('option').all();
        for (const opt of options) {
          const optText = await opt.innerText();
          if (/authenticator/i.test(optText)) {
            const val = await opt.getAttribute('value');
            if (val) await factorSelect.selectOption(val);
            break;
          }
        }
      }
    }
    const totpSelected = page.getByTestId('admin-mfa-totp-selected');
    const usesTotp = await totpSelected.isVisible().catch(() => false);
    if (usesTotp) {
      if (!credentials.totpSecret) {
        throw new Error(`${credentials.label || 'Admin'} has a TOTP factor selected, but no TOTP secret was injected.`);
      }
      await page.getByTestId('admin-mfa-send-signin-code').click();
      await expect(page.getByTestId('admin-mfa-signin-code')).toBeVisible({ timeout: 10_000 });
      await waitForFreshTotpWindow(page);
      await page.getByTestId('admin-mfa-signin-code').fill(generateTotp(credentials.totpSecret));
    } else {
      if (!/^\d{6}$/.test(String(credentials.realPhoneCode || ''))) {
        throw new Error(`${credentials.label || 'Admin'} selected phone MFA, but no current real SMS code was injected.`);
      }
      await page.getByTestId('admin-mfa-send-signin-code').click();
      await expect(page.getByTestId('admin-mfa-signin-code')).toBeVisible({ timeout: 30_000 });
      await page.getByTestId('admin-mfa-signin-code').fill(String(credentials.realPhoneCode));
    }

    const firstMfaResponse = await submitMfaCode(page);
    if (usesTotp && firstMfaResponse && !firstMfaResponse.ok()) {
      const firstError = await visibleMfaError(page);
      if (!/incorrect|expired/i.test(firstError)) {
        throw new Error(`${credentials.label || 'Admin'} TOTP sign-in failed with Firebase status ${firstMfaResponse.status()}.`);
      }

      // A code can be generated just before its 30-second window closes. Retry
      // exactly once in a distinct window; any second rejection is a credential
      // synchronization failure, not something this test should hide.
      await waitForNextTotpWindow(page);
      await page.getByTestId('admin-mfa-signin-code').fill(generateTotp(credentials.totpSecret!));
      const retryMfaResponse = await submitMfaCode(page);
      if (retryMfaResponse && !retryMfaResponse.ok()) {
        throw new Error(`${credentials.label || 'Admin'} TOTP was rejected in two consecutive windows. Reconcile E2E_FOUNDER_TOTP_SECRET with the enrolled Firebase Authenticator factor.`);
      }
    }
    await page.waitForURL(`${baseUrl}/dashboard`, { timeout: 45_000 });
    await page.waitForLoadState('domcontentloaded');
    await page.locator('.MuiCircularProgress-root').waitFor({ state: 'detached', timeout: 30_000 }).catch(() => undefined);
    await expect(page.locator('body')).not.toContainText(
      /permission-denied|missing or insufficient permissions|application error|minified react error|admin console could not start/i,
      { timeout: 10_000 },
    );
    return authResponse;
  } catch (error) {
    const failedScriptUrl = failedRequests.find((line) => /\.m?js(?:\?|\s|$)/i.test(line)) || null;
    const diagnostics = {
      currentUrl: page.url(),
      bodyText: (await page.locator('body').innerText().catch(() => '')).slice(0, 4_000),
      firstPageError: pageErrors[0] || null,
      consoleErrors: consoleErrors.slice(0, 20),
      requestFailures: failedRequests.slice(0, 20),
      failedScriptUrl,
      firebaseAuthStatus: authResponse?.status() || null,
      firebaseAuthEndpoint: authResponse ? 'identitytoolkit.accounts:signInWithPassword' : null,
    };
    throw new Error(`${error instanceof Error ? error.message : String(error)}\nAdmin auth diagnostics:\n${JSON.stringify(diagnostics, null, 2)}`);
  }
}
