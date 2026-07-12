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
    return '';
  }
  const validated = assertValidAppCheckDebugToken(token);
  const fingerprint = maskAppCheckToken(validated);

  await page.addInitScript((debugToken: string, tokenFingerprint: string) => {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    (window as any).__BIN_APPCHECK_DEBUG_FINGERPRINT__ = tokenFingerprint;
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
  /app check|firebase.?app.?check|appcheck|permission-denied|insufficient permissions|unauthenticated|too many requests|resource.?exhausted|throttl|status.?code.?(401|403|429)|\b401\b|\b403\b|\b429\b/i;

const FIREBASE_NETWORK_RE =
  /firestore\.googleapis\.com|firebasestorage\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebaseappcheck\.googleapis\.com|content-firebaseappcheck|firebaseio\.com|cloudfunctions\.net/i;

export function collectAppCheckFailures(messages: string[]): string[] {
  return messages.filter((msg) => APP_CHECK_FAILURE_RE.test(msg));
}

export type AppCheckMonitor = {
  failures: string[];
  successfulFirebaseReads: string[];
  assertClean: (context: string) => void;
  assertTokenFingerprint: () => Promise<void>;
  assertAuthenticatedFirebaseRead: (context: string) => void;
};

/**
 * Attach console + network listeners BEFORE login and keep them until the test ends.
 * Route rendering alone is not App Check proof — require at least one authenticated Firebase read.
 */
export async function attachAuthenticatedAppCheckMonitor(page: Page): Promise<AppCheckMonitor> {
  await installAppCheckDebugToken(page);
  const failures: string[] = [];
  const successfulFirebaseReads: string[] = [];
  let authSeen = false;

  page.on('console', (msg) => {
    if (msg.type() === 'error') failures.push(msg.text());
  });

  page.on('pageerror', (err) => {
    failures.push(String(err?.message || err));
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (!FIREBASE_NETWORK_RE.test(url)) return;

    if (status === 401 || status === 403 || status === 429) {
      failures.push(`HTTP ${status} ${url}`);
      return;
    }

    // Successful identity/firestore reads after auth count as authenticated Firebase access.
    if (status >= 200 && status < 300) {
      if (/identitytoolkit|securetoken/i.test(url)) authSeen = true;
      if (/firestore\.googleapis\.com/i.test(url) && (authSeen || /documents:/i.test(url))) {
        successfulFirebaseReads.push(url);
      }
    }
  });

  return {
    failures,
    successfulFirebaseReads,
    assertClean(context: string) {
      const matched = collectAppCheckFailures(failures);
      if (matched.length) {
        throw new Error(
          `${context}: App Check / auth / rate-limit failure detected:\n- ${matched.slice(0, 12).join('\n- ')}`,
        );
      }
    },
    async assertTokenFingerprint() {
      await assertAppCheckDebugTokenInPage(page);
    },
    assertAuthenticatedFirebaseRead(context: string) {
      if (!successfulFirebaseReads.length) {
        throw new Error(
          `${context}: no authenticated Firebase read observed. Route rendering alone is not App Check proof.`,
        );
      }
    },
  };
}
