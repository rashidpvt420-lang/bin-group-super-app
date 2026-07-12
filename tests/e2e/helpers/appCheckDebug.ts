import type { Page } from '@playwright/test';

const PLACEHOLDER_PATTERNS = [
  /^your[_-]?registered[_-]?uuid$/i,
  /^replace[_-]?(me|with)/i,
  /^xxx+$/i,
  /^todo$/i,
  /^changeme$/i,
  /^false$/i,
  /^true$/i,
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getAppCheckDebugTokenFromEnv(): string {
  return String(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
}

export function assertValidAppCheckDebugToken(token = getAppCheckDebugTokenFromEnv()): string {
  if (!token) {
    throw new Error(
      'Missing VITE_FIREBASE_APPCHECK_DEBUG_TOKEN. Register a debug token for both the main and admin Firebase Web Apps, then set it in .env.e2e / CI secrets.',
    );
  }
  if (PLACEHOLDER_PATTERNS.some((re) => re.test(token)) || token.includes('YOUR_REGISTERED_UUID')) {
    throw new Error(
      'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN is a placeholder (e.g. YOUR_REGISTERED_UUID). Replace it with a Console-registered UUID.',
    );
  }
  if (!UUID_RE.test(token)) {
    throw new Error(
      'VITE_FIREBASE_APPCHECK_DEBUG_TOKEN must be a UUID registered in Firebase App Check debug tokens.',
    );
  }
  return token;
}

export function maskAppCheckToken(token: string): string {
  const value = String(token || '');
  if (value.length < 12) return '(invalid)';
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

/**
 * Inject a registered App Check debug token BEFORE any page script runs.
 * Must be called before the first navigation that loads Firebase.
 */
export async function installAppCheckDebugToken(page: Page, token = getAppCheckDebugTokenFromEnv()): Promise<string> {
  const allowSkip = process.env.E2E_SKIP_APPCHECK_TOKEN === 'true' || process.env.E2E_ALLOW_MISSING_ENV === 'true';
  if (!token && allowSkip) {
    // Local non-launch smoke only. Launch clearance must not set these flags.
    return '';
  }
  const validated = assertValidAppCheckDebugToken(token);
  const fingerprint = maskAppCheckToken(validated);

  await page.addInitScript((debugToken: string, tokenFingerprint: string) => {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    (window as any).__BIN_APPCHECK_DEBUG_FINGERPRINT__ = tokenFingerprint;
    // One-line diagnostic without printing the full token.
    // eslint-disable-next-line no-console
    console.info(`[AppCheckDebug] token_fingerprint=${tokenFingerprint}`);
  }, validated, fingerprint);

  return validated;
}

export async function assertAppCheckDebugTokenInPage(page: Page, expectedToken?: string): Promise<void> {
  const expected = assertValidAppCheckDebugToken(expectedToken || getAppCheckDebugTokenFromEnv());
  const expectedFingerprint = maskAppCheckToken(expected);

  const actual = await page.evaluate(() => {
    const token = String((window as any).FIREBASE_APPCHECK_DEBUG_TOKEN || '');
    const fingerprint = String((window as any).__BIN_APPCHECK_DEBUG_FINGERPRINT__ || '');
    return { present: Boolean(token), fingerprint, isBooleanTrue: token === 'true' };
  });

  if (!actual.present || actual.isBooleanTrue) {
    throw new Error(
      'Browser is not using a registered App Check debug UUID (missing or boolean true). Inject installAppCheckDebugToken() before Firebase loads.',
    );
  }
  if (actual.fingerprint !== expectedFingerprint) {
    throw new Error(
      `App Check debug fingerprint mismatch. expected=${expectedFingerprint} actual=${actual.fingerprint || '(none)'}`,
    );
  }
}

/** Patterns that prove App Check / Firestore enforcement is rejecting the browser. */
export const APP_CHECK_FAILURE_RE =
  /app check|firebase.?app.?check|appcheck|403|permission-denied|insufficient permissions|too many requests|status.?code.?429|\b429\b/i;

export function collectAppCheckFailures(messages: string[]): string[] {
  return messages.filter((msg) => APP_CHECK_FAILURE_RE.test(msg));
}
