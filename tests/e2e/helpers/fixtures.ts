import { test as base, expect, type Page } from '@playwright/test';
import {
  APP_CHECK_FAILURE_RE,
  assertAppCheckDebugTokenInPage,
  attachAuthenticatedAppCheckMonitor,
  collectAppCheckFailures,
  installAppCheckDebugToken,
  type AppCheckMonitor,
} from './appCheckDebug';

type AppCheckFixtures = {
  appCheckReady: string;
  appCheckMonitor: AppCheckMonitor;
};

/**
 * Extends Playwright test so a registered App Check debug UUID is injected
 * before any page script (including Firebase) can run, and network/console
 * failures are monitored for the full authenticated session.
 */
export const test = base.extend<AppCheckFixtures>({
  appCheckReady: async ({ page }, use) => {
    const token = await installAppCheckDebugToken(page);
    await use(token);
  },
  appCheckMonitor: async ({ page }, use) => {
    const monitor = await attachAuthenticatedAppCheckMonitor(page);
    await use(monitor);
  },
});

export { expect };

export async function attachAppCheckFailureGuard(page: Page) {
  return attachAuthenticatedAppCheckMonitor(page);
}

export function assertNoAppCheckDenial(bodyText: string, context: string) {
  if (APP_CHECK_FAILURE_RE.test(bodyText)) {
    throw new Error(`${context}: page body indicates App Check / permission / 429 failure.`);
  }
}

export { assertAppCheckDebugTokenInPage, collectAppCheckFailures, installAppCheckDebugToken };
