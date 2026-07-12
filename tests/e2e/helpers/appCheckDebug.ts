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

type AppCheckInitPayload = {
  debugToken: string;
  tokenFingerprint: string;
};

export function getAppCheckDebugTokenFromEnv(): string {
  return String(process.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || '').trim();
}

export function assertValidAppCheckDebugToken(token = getAppCheckDebugTokenFromEnv()): string {
  if (!token) {
    throw new Error(
      'Missing VITE_FIREBASE_APPCHECK_DEBUG_TOKEN. Register a debug token for both the main and admin Firebase Web Apps, then set it in .env.e2e / CI secrets.',
    );
  }
  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(token)) || token.includes('YOUR_REGISTERED_UUID')) {
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

export async function installAppCheckDebugToken(
  page: Page,
  token = getAppCheckDebugTokenFromEnv(),
): Promise<string> {
  const allowSkip =
    process.env.E2E_SKIP_APPCHECK_TOKEN === 'true' ||
    process.env.E2E_ALLOW_MISSING_ENV === 'true';
  if (!token && allowSkip) return '';

  const validated = assertValidAppCheckDebugToken(token);
  const payload: AppCheckInitPayload = {
    debugToken: validated,
    tokenFingerprint: maskAppCheckToken(validated),
  };

  await page.addInitScript((init: AppCheckInitPayload) => {
    (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = init.debugToken;
    (window as any).__BIN_APPCHECK_DEBUG_FINGERPRINT__ = init.tokenFingerprint;
    console.info(`[AppCheckDebug] token_fingerprint=${init.tokenFingerprint}`);
  }, payload);

  if (!page.isClosed()) {
    await page.evaluate((init: AppCheckInitPayload) => {
      (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = init.debugToken;
      (window as any).__BIN_APPCHECK_DEBUG_FINGERPRINT__ = init.tokenFingerprint;
    }, payload);
  }

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

export const APP_CHECK_FAILURE_RE =
  /app check|firebase.?app.?check|appcheck|permission-denied|insufficient permissions|unauthenticated|too many requests|resource.?exhausted|throttl|status.?code.?(401|403|429)|\b401\b|\b403\b|\b429\b/i;

const FIREBASE_NETWORK_RE =
  /firestore\.googleapis\.com|firebasestorage\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firebaseappcheck\.googleapis\.com|content-firebaseappcheck|firebaseio\.com|cloudfunctions\.net/i;

export function collectAppCheckFailures(messages: string[]): string[] {
  return messages.filter((message) => APP_CHECK_FAILURE_RE.test(message));
}

export type AppCheckMonitor = {
  failures: string[];
  successfulAuthResponses: string[];
  successfulFirebaseReads: string[];
  assertClean: (context: string) => void;
  assertTokenFingerprint: () => Promise<void>;
  assertAuthenticatedFirebaseRead: (context: string) => void;
};

/**
 * Attach listeners before login. Evidence requires a successful browser Auth
 * response followed by a successful Firestore read in the same test. Public
 * document reads and Admin SDK seeding never qualify.
 */
export async function attachAuthenticatedAppCheckMonitor(page: Page): Promise<AppCheckMonitor> {
  await installAppCheckDebugToken(page);
  const failures: string[] = [];
  const successfulAuthResponses: string[] = [];
  const successfulFirebaseReads: string[] = [];
  let authSeen = false;

  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(message.text());
  });

  page.on('pageerror', (error) => {
    failures.push(String(error?.message || error));
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (!FIREBASE_NETWORK_RE.test(url)) return;

    if (status === 401 || status === 403 || status === 429) {
      failures.push(`HTTP ${status} ${url}`);
      return;
    }

    if (status < 200 || status >= 300) return;

    if (/identitytoolkit|securetoken/i.test(url)) {
      authSeen = true;
      successfulAuthResponses.push(url);
      return;
    }

    if (/firestore\.googleapis\.com/i.test(url) && authSeen) {
      successfulFirebaseReads.push(url);
    }
  });

  return {
    failures,
    successfulAuthResponses,
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
      if (!successfulAuthResponses.length) {
        throw new Error(`${context}: no successful browser Firebase Auth response observed.`);
      }
      if (!successfulFirebaseReads.length) {
        throw new Error(
          `${context}: no Firestore read was observed after browser authentication. Public reads or Admin SDK writes are not App Check proof.`,
        );
      }
    },
  };
}
