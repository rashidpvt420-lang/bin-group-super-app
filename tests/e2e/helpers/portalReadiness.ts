import { expect, type Page } from '@playwright/test';

const AUTH_LOADING = /AUTHENTICATING BIN-GROUPS IDENTITY|Connection is slow/i;
const AUTH_FAILURE = /PROFILE UNAVAILABLE|IDENTITY SYNC FAULT|PROTOCOL VIOLATION|PROFILE MISSING/i;

/**
 * A route is not ready just because React rendered a body or the URL did not
 * redirect. Wait for RoleProvider's authenticated boot marker and require the
 * expected portal shell before asserting page-specific content.
 */
export async function assertAuthenticatedPortalReady(
  page: Page,
  context: string,
  expectedPortalLabel: string,
) {
  await page.waitForFunction(
    () => (window as any).__BIN_GROUPS_BOOT__?.authReady === true,
    null,
    { timeout: 30_000 },
  );

  const body = page.locator('body');
  await expect(body, `${context}: authentication loader must be gone`).not.toContainText(AUTH_LOADING, {
    timeout: 5_000,
  });
  await expect(body, `${context}: secure role verification must not be in an error state`).not.toContainText(AUTH_FAILURE);
  await expect(body, `${context}: expected authenticated portal shell`).toContainText(
    new RegExp(expectedPortalLabel, 'i'),
    { timeout: 15_000 },
  );
}
