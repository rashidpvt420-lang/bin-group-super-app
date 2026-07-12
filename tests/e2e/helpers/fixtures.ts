import { test as base, expect, type Page } from '@playwright/test';
import {
  APP_CHECK_FAILURE_RE,
  assertAppCheckDebugTokenInPage,
  collectAppCheckFailures,
  installAppCheckDebugToken,
} from './appCheckDebug';

type AppCheckFixtures = {
  appCheckReady: string;
};

/**
 * Extends Playwright test so a registered App Check debug UUID is injected
 * before any page script (including Firebase) can run.
 */
export const test = base.extend<AppCheckFixtures>({
  appCheckReady: async ({ page }, use) => {
    const token = await installAppCheckDebugToken(page);
    await use(token);
  },
});

export { expect };

export async function attachAppCheckFailureGuard(page: Page) {
  const failures: string[] = [];
  const onConsole = (msg: { type: () => string; text: () => string }) => {
    if (msg.type() === 'error') failures.push(msg.text());
  };
  const onResponse = (response: { status: () => number; url: () => string }) => {
    const status = response.status();
    const url = response.url();
    if ((status === 403 || status === 429) && /firestore|firebasestorage|identitytoolkit|content-firebaseappcheck|google|googleapis|firebase/i.test(url)) {
      failures.push(`HTTP ${status} ${url}`);
    }
  };
  page.on('console', onConsole);
  page.on('response', onResponse);

  return {
    failures,
    assertClean(context: string) {
      const matched = collectAppCheckFailures(failures);
      if (matched.length) {
        throw new Error(
          `${context}: App Check / permission / rate-limit failure detected:\n- ${matched.slice(0, 8).join('\n- ')}`,
        );
      }
    },
    async assertTokenFingerprint() {
      await assertAppCheckDebugTokenInPage(page);
    },
  };
}

export function assertNoAppCheckDenial(bodyText: string, context: string) {
  if (APP_CHECK_FAILURE_RE.test(bodyText)) {
    throw new Error(`${context}: page body indicates App Check / permission / 429 failure.`);
  }
}
